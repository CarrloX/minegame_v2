// GreedyMesher.ts
import * as THREE from 'three';
import { Chunk } from './Chunk';
import { BlockType } from './BlockType';

// Texture atlas configuration
const TEXTURE_ATLAS_SIZE = 16;
const TEXTURE_SIZE = 1 / TEXTURE_ATLAS_SIZE;
const UV_EPS = 1e-4; // small padding to avoid bleeding between tiles

interface TextureCoords {
  top: [number, number];
  side: [number, number];
  bottom: [number, number];
}

/**
 * Map of block -> tile coordinates (tile indices inside the atlas)
 * Adjust these to match your atlas.png layout.
 */
const BLOCK_TEXTURES: Record<number, TextureCoords> = {
  [BlockType.AIR]: { top: [0, 0], side: [0, 0], bottom: [0, 0] },
  [BlockType.GRASS]: {
    top: [0, 0],
    side: [2, 0], // grass side tile index in atlas
    bottom: [1, 0] // dirt
  },
  [BlockType.DIRT]: {
    top: [1, 0],
    side: [1, 0],
    bottom: [1, 0]
  },
  [BlockType.STONE]: {
    top: [3, 0],
    side: [3, 0],
    bottom: [3, 0]
  },
  // add more block type mappings as needed
};

/**
 * Returns UV coordinates (8 numbers) for a face.
 * tileW / tileH indicate how many atlas tiles the quad should cover.
 * NOTE: For tileable faces we subdivide quads into unit-width sub-quads and call this with tileW=1.
 */
function getFaceUVs(blockType: BlockType, face: 'top' | 'side' | 'bottom' = 'side', tileW = 1, tileH = 1): number[] {
  const defaultCoords: TextureCoords = { top: [0, 0], side: [0, 0], bottom: [0, 0] };
  const coords = BLOCK_TEXTURES[blockType] || defaultCoords;
  const [uTile, vTile] = coords[face];

  // origin bottom-left in atlas; we convert to uv coordinates (0..1), account for v flip
  const u0 = uTile * TEXTURE_SIZE + UV_EPS;
  const v0 = 1 - (vTile + tileH) * TEXTURE_SIZE + UV_EPS;
  const u1 = u0 + TEXTURE_SIZE * tileW - 2 * UV_EPS;
  const v1 = v0 + TEXTURE_SIZE * tileH - 2 * UV_EPS;

  // Return UVs for vertices in same order as positions are pushed:
  // positions are: p0, p1, p2, p3
  // We use: top-left (u0,v1), top-right (u1,v1), bottom-right (u1,v0), bottom-left (u0,v0)
  // But to remain consistent with the positions order (p0..p3) used below,
  // we return [u0,v1, u1,v1, u1,v0, u0,v0] or [u0,v0,u1,v0,u1,v1,u0,v1] depending on
  // whether your position ordering treats p0 as top-left or bottom-left.
  //
  // The greedy mesher here uses positions: x, x+du, x+du+dv, x+dv (in block space).
  // Empirically that maps to (top-left, top-right, bottom-right, bottom-left) if you
  // treat +v as down in UV space (we already flipped v when computing v0).
  //
  // So return in order: TL, TR, BR, BL -> (u0,v1),(u1,v1),(u1,v0),(u0,v0)
  return [u0, v1, u1, v1, u1, v0, u0, v0];
}

/** Decide whether a face should tile per-block instead of stretching.
 * add more rules as you add tileable textures to atlas */
function shouldTile(blockType: BlockType, face: 'top' | 'side' | 'bottom'): boolean {
  // Grass sides should tile per-block to avoid stretching when greedy merges along width.
  if (blockType === BlockType.GRASS && face === 'side') return true;
  // Example: wood sides, log sides, bricks, etc. can be added here.
  return false;
}

export class GreedyMesher {
  /**
   * Generate a BufferGeometry for a chunk using greedy meshing.
   * world.getBlock(x,y,z) (absolute coordinates) can be passed to check neighbors across chunk boundaries.
   */
  public static generateMesh(chunk: Chunk, world?: any): THREE.BufferGeometry | null {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const sizes = [Chunk.SIZE, Chunk.HEIGHT, Chunk.SIZE];

    // helper to query block local/absolute
    const getBlockAt = (lx: number, ly: number, lz: number): number => {
      if (lx >= 0 && lx < Chunk.SIZE && ly >= 0 && ly < Chunk.HEIGHT && lz >= 0 && lz < Chunk.SIZE) {
        return chunk.getBlock(lx, ly, lz);
      }
      if (!world || typeof world.getBlock !== 'function') return BlockType.AIR;
      const absX = chunk.x * Chunk.SIZE + lx;
      const absY = chunk.y * Chunk.HEIGHT + ly;
      const absZ = chunk.z * Chunk.SIZE + lz;
      const b = world.getBlock(absX, absY, absZ);
      return (typeof b === 'number') ? b : BlockType.AIR;
    };

    // sweep over axes following classic greedy mesher
    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3;
      const v = (d + 2) % 3;
      const dimsD = sizes[d];
      const dimsU = sizes[u];
      const dimsV = sizes[v];

      const x = [0, 0, 0];
      const q = [0, 0, 0];
      q[d] = 1;

      const mask = new Int32Array(dimsU * dimsV);

      for (x[d] = -1; x[d] < dimsD - 1; ) {
        // build mask
        let n = 0;
        for (x[v] = 0; x[v] < dimsV; x[v]++) {
          for (x[u] = 0; x[u] < dimsU; x[u]++) {
            const a = (x[d] >= 0) ? getBlockAt(x[0], x[1], x[2]) : 0;
            const b = (x[d] < dimsD - 1) ? getBlockAt(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0;

            if ((a && b) || (!a && !b)) {
              mask[n++] = 0;
            } else if (a) {
              mask[n++] = a; // face toward +q
            } else {
              mask[n++] = -b; // face toward -q
            }
          }
        }

        x[d]++; // advance plane once

        // generate mesh from mask
        n = 0;
        for (let j = 0; j < dimsV; j++) {
          for (let i = 0; i < dimsU;) {
            const m = mask[n];
            if (m !== 0) {
              // compute width
              let w = 1;
              while (i + w < dimsU && mask[n + w] === m) w++;

              // compute height
              let h = 1;
              outer: while (j + h < dimsV) {
                for (let k = 0; k < w; k++) {
                  if (mask[n + k + h * dimsU] !== m) break outer;
                }
                h++;
              }

              // base coordinates
              x[u] = i;
              x[v] = j;

              const du = [0, 0, 0]; du[u] = w;
              const dv = [0, 0, 0]; dv[v] = h;

              // block type and face type
              const blockType = Math.abs(m) as BlockType;
              let faceType: 'top' | 'side' | 'bottom' = 'side';
              if (d === 1) faceType = (m > 0) ? 'top' : 'bottom';
              else faceType = 'side';

              const normalSign = (m > 0) ? 1 : -1;

              // If this face should tile per-block (to avoid stretching), subdivide along the u axis into unit-wide quads.
              const tileable = shouldTile(blockType, faceType);
              const quadW = du[u]; // width in blocks
              const quadH = dv[v]; // height in blocks

              if (tileable && quadW > 1) {
                // create quadW sub-quads each width 1 and height quadH
                for (let sx = 0; sx < quadW; sx++) {
                  const base = [x[0], x[1], x[2]];
                  base[u] += sx;

                  // positions for sub-quad (p0,p1,p2,p3)
                  const p0 = [base[0], base[1], base[2]];
                  const p1 = [base[0] + (u === 0 ? 1 : 0), base[1] + (u === 1 ? 1 : 0), base[2] + (u === 2 ? 1 : 0)];
                  const p2 = [p1[0] + (v === 0 ? quadH : 0), p1[1] + (v === 1 ? quadH : 0), p1[2] + (v === 2 ? quadH : 0)];
                  const p3 = [base[0] + (v === 0 ? quadH : 0), base[1] + (v === 1 ? quadH : 0), base[2] + (v === 2 ? quadH : 0)];

                  const vc = positions.length / 3;
                  positions.push(p0[0], p0[1], p0[2]);
                  positions.push(p1[0], p1[1], p1[2]);
                  positions.push(p2[0], p2[1], p2[2]);
                  positions.push(p3[0], p3[1], p3[2]);

                  if (m > 0) {
                    indices.push(vc, vc + 1, vc + 2);
                    indices.push(vc, vc + 2, vc + 3);
                  } else {
                    indices.push(vc, vc + 2, vc + 1);
                    indices.push(vc, vc + 3, vc + 2);
                  }

                  // normals (same for all four verts)
                  for (let t = 0; t < 4; t++) {
                    normals.push(q[0] * normalSign, q[1] * normalSign, q[2] * normalSign);
                  }

                  // UVs for this sub-quad: tileW=1, tileH=quadH
                  const faceUVs = getFaceUVs(blockType, faceType, 1, quadH);
                  uvs.push(...faceUVs);
                }
              } else {
                // Single big quad (default greedy behavior)
                const vc = positions.length / 3;
                positions.push(x[0], x[1], x[2]);
                positions.push(x[0] + du[0], x[1] + du[1], x[2] + du[2]);
                positions.push(x[0] + du[0] + dv[0], x[1] + du[1] + dv[1], x[2] + du[2] + dv[2]);
                positions.push(x[0] + dv[0], x[1] + dv[1], x[2] + dv[2]);

                if (m > 0) {
                  indices.push(vc, vc + 1, vc + 2);
                  indices.push(vc, vc + 2, vc + 3);
                } else {
                  indices.push(vc, vc + 2, vc + 1);
                  indices.push(vc, vc + 3, vc + 2);
                }

                for (let t = 0; t < 4; t++) {
                  normals.push(q[0] * normalSign, q[1] * normalSign, q[2] * normalSign);
                }

                // UVs: if we pass tileW = quadW and tileH = quadH this will effectively map a region
                // of the atlas proportionally to the quad. That *stretches* the tile across the quad.
                // For tileable faces we circumvent this by subdividing above; for others this is acceptable.
                const faceUVs = getFaceUVs(blockType, faceType, quadW, quadH);
                uvs.push(...faceUVs);
              }

              // zero out mask region
              for (let l = 0; l < h; ++l) {
                for (let k = 0; k < w; ++k) {
                  mask[n + k + l * dimsU] = 0;
                }
              }

              i += w;
              n += w;
            } else {
              i++;
              n++;
            }
          }
        }
      }
    }

    if (indices.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
  }
}
