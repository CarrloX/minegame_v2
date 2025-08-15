// greedy-worker.ts (TypeScript for WebWorker)
import { BlockType } from '../world/BlockType';

const SIZE = 16;
const HEIGHT = 16;
const ATLAS_TILES = 16;           // tiles per row/col in atlas
const UV_TILE = 1 / ATLAS_TILES;  // tile size in UV coords

type Group = { key: string; blockType: number; face: 'top'|'bottom'|'side'; start: number; count: number };

class GreedyMesherWorker {
  // Map blockType + face to atlas tile coords (u,v tile indices)
  private static readonly TILE_MAP: Record<number, { top: [number,number], side: [number,number], bottom: [number,number] }> = {
    [BlockType.GRASS]: { top: [0,0], side: [2,0], bottom: [1,0] }, // Side texture at [2,0] to match the atlas
    [BlockType.DIRT]:  { top: [1,0], side: [1,0], bottom: [1,0] },  // Dirt texture at [1,0]
    [BlockType.STONE]: { top: [3,0], side: [3,0], bottom: [3,0] },  // Stone texture at [3,0]
    // add more as needed
  };

  private static getFaceUVs(blockType: number, face: 'top'|'bottom'|'side', _wTiles = 1, _hTiles = 1): number[] {
    const map = this.TILE_MAP[blockType] || { top: [0,0], side: [0,0], bottom: [0,0] };
    const tile = (face === 'top') ? map.top : (face === 'bottom' ? map.bottom : map.side);
    const uTile = tile[0], vTile = tile[1];

    // Add a small offset to prevent texture bleeding (adjust as needed)
    const BLEED = 0.001;
    
    // Calculate UV coordinates with proper scaling and offset
    const u0 = (uTile * UV_TILE) + BLEED;
    const v0 = 1.0 - ((vTile + 1) * UV_TILE) + BLEED;
    const u1 = ((uTile + 1) * UV_TILE) - BLEED;
    const v1 = 1.0 - (vTile * UV_TILE) - BLEED;

    // Debug log for grass side texture
    if (blockType === BlockType.GRASS && face === 'side') {
      console.log('Grass side UV calculations:', {
        blockType,
        face,
        tile,
        uTile,
        vTile,
        UV_TILE,
        BLEED,
        u0,
        v0,
        u1,
        v1,
        finalUVs: [
          [u0, v1],  // bottom-left
          [u1, v1],  // bottom-right
          [u1, v0],  // top-right
          [u0, v0]   // top-left
        ]
      });
    }

    // Return UVs in the order: bottom-left, bottom-right, top-right, top-left
    return [
      u0, v1,  // bottom-left
      u1, v1,  // bottom-right
      u1, v0,  // top-right
      u0, v0   // top-left
    ];
  }

  public static generateMeshData(
    blocks: Uint8Array,
    chunkX: number,
    chunkY: number,
    chunkZ: number,
    worldGetBlock?: (x:number,y:number,z:number)=>number|undefined,
    _debug = false
  ) : {
    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    groups: Group[];
  } | null {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const groups: Group[] = [];

    const sizes = [SIZE, HEIGHT, SIZE];

    const getBlockLocal = (lx:number, ly:number, lz:number) => {
      if (lx >=0 && lx < SIZE && ly >=0 && ly < HEIGHT && lz >=0 && lz < SIZE) {
        return blocks[lx + lz * SIZE + ly * SIZE * SIZE];
      }
      if (!worldGetBlock) return BlockType.AIR;
      const absX = chunkX * SIZE + lx;
      const absY = chunkY * HEIGHT + ly;
      const absZ = chunkZ * SIZE + lz;
      const b = worldGetBlock(absX, absY, absZ);
      return (typeof b === 'number') ? b : BlockType.AIR;
    };

    // Greedy sweep (Mikolá Lysenko style)
    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3;
      const v = (d + 2) % 3;
      const dimsD = sizes[d];
      const dimsU = sizes[u];
      const dimsV = sizes[v];

      const x = [0,0,0];
      const q = [0,0,0];
      q[d] = 1;

      const mask = new Int32Array(dimsU * dimsV);

      // iterate planes
      for (x[d] = -1; x[d] < dimsD - 1; ) {
        // build mask
        let n = 0;
        for (x[v] = 0; x[v] < dimsV; x[v]++) {
          for (x[u] = 0; x[u] < dimsU; x[u]++) {
            const a = (x[d] >= 0) ? getBlockLocal(x[0], x[1], x[2]) : 0;
            const b = (x[d] < dimsD - 1) ? getBlockLocal(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0;
            if ((a && b) || (!a && !b)) mask[n++] = 0;
            else if (a) mask[n++] = a;
            else mask[n++] = -b;
          }
        }

        x[d]++; // advance plane exactly once per iteration

        // generate mesh from mask
        n = 0;
        for (let j = 0; j < dimsV; j++) {
          for (let i = 0; i < dimsU; ) {
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

              // base coords
              x[u] = i;
              x[v] = j;

              const du = [0,0,0]; du[u] = w;
              const dv = [0,0,0]; dv[v] = h;

              // vertex base
              const vx = [ x[0], x[1], x[2] ];
              // push 4 vertices (no duplication)
              const vertexIndex = positions.length / 3;
              positions.push(
                vx[0], vx[1], vx[2],
                vx[0] + du[0], vx[1] + du[1], vx[2] + du[2],
                vx[0] + du[0] + dv[0], vx[1] + du[1] + dv[1], vx[2] + du[2] + dv[2],
                vx[0] + dv[0], vx[1] + dv[1], vx[2] + dv[2]
              );

              // winding/indices depending on sign
              if (m > 0) {
                indices.push(vertexIndex, vertexIndex+1, vertexIndex+2, vertexIndex, vertexIndex+2, vertexIndex+3);
              } else {
                // invert winding for negative faces
                indices.push(vertexIndex, vertexIndex+2, vertexIndex+1, vertexIndex, vertexIndex+3, vertexIndex+2);
              }

              // normals (q * sign)
              const sign = (m > 0) ? 1 : -1;
              const nx = q[0] * sign, ny = q[1] * sign, nz = q[2] * sign;
              for (let t = 0; t < 4; t++) normals.push(nx, ny, nz);

              // UVs scaled by w,h tiles
              const blockType = Math.abs(m);
              const faceType: 'top'|'bottom'|'side' = (d === 1) ? (m > 0 ? 'top' : 'bottom') : 'side';
              const faceUVs = this.getFaceUVs(blockType, faceType, w, h); // returns 8 numbers
              // add uv for 4 verts
              uvs.push(faceUVs[0], faceUVs[1], faceUVs[2], faceUVs[3], faceUVs[4], faceUVs[5], faceUVs[6], faceUVs[7]);

              // record / merge groups by key
              const key = `${blockType}:${faceType}`;
              const indexStart = indices.length - 6; // start index of this quad in indices array
              if (groups.length > 0 && groups[groups.length - 1].key === key && groups[groups.length - 1].start + groups[groups.length - 1].count === indexStart) {
                groups[groups.length - 1].count += 6;
              } else {
                groups.push({ key, blockType, face: faceType, start: indexStart, count: 6 });
              }

              // zero out mask
              for (let l = 0; l < h; l++) {
                for (let k = 0; k < w; k++) {
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

    if (positions.length === 0) return null;

    // convert to typed arrays
    const posArr = new Float32Array(positions);
    const normArr = new Float32Array(normals);
    const uvArr = new Float32Array(uvs);
    const idxArr = new Uint32Array(indices);

    return {
      positions: posArr,
      normals: normArr,
      uvs: uvArr,
      indices: idxArr,
      groups
    };
  }
}

// worker message handling (minimal logs)
(self as any).onmessage = (e: MessageEvent<any>) => {
  const { id, blocks: blocksBuffer, chunkX, chunkY, chunkZ } = e.data;
  const blocks = new Uint8Array(blocksBuffer);

  try {
    const result = GreedyMesherWorker.generateMeshData(blocks, chunkX, chunkY, chunkZ, e.data.worldGetBlock);
    if (!result) {
      (self as any).postMessage({ id, empty: true });
      return;
    }

    // send typed array buffers + groups metadata
    const message = {
      id,
      positions: result.positions.buffer,
      normals: result.normals.buffer,
      uvs: result.uvs.buffer,
      indices: result.indices.buffer,
      groups: result.groups
    };

    const transfer: Transferable[] = [result.positions.buffer, result.normals.buffer, result.uvs.buffer, result.indices.buffer];
    (self as any).postMessage(message, transfer);
  } catch (err) {
    (self as any).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};

export {}; // TS worker module
