// GreedyMesher.ts
import * as THREE from 'three';
import { Chunk } from './Chunk';
import { BlockType } from './BlockType';

// Mapeo de tipos de bloque a coordenadas de textura en el atlas
// Asume un atlas de 16x16 texturas (16x16 píxeles cada una)
const TEXTURE_ATLAS_SIZE = 16;
const TEXTURE_SIZE = 1 / TEXTURE_ATLAS_SIZE;

// Interfaz para las coordenadas de textura
interface TextureCoords {
    top: [number, number];
    side: [number, number];
    bottom: [number, number];
}

// Mapeo de tipos de bloque a sus coordenadas de textura
const BLOCK_TEXTURES: Record<number, TextureCoords> = {
    [BlockType.AIR]: { top: [0, 0], side: [0, 0], bottom: [0, 0] },
    [BlockType.GRASS]: { 
        top: [0, 0],     // Césped superior
        side: [3, 0],    // Lado de tierra con hierba
        bottom: [2, 0]   // Tierra
    },
    [BlockType.DIRT]: { 
        top: [2, 0],     // Tierra
        side: [2, 0],    // Tierra
        bottom: [2, 0]   // Tierra
    },
    [BlockType.STONE]: { 
        top: [1, 0],     // Piedra
        side: [1, 0],    // Piedra
        bottom: [1, 0]   // Piedra
    },
    // Añade más tipos de bloques según sea necesario
};

// Función para obtener las coordenadas UV para una cara específica
function getFaceUVs(blockType: BlockType, face: 'top' | 'side' | 'bottom' = 'side'): number[] {
    const defaultCoords = { top: [0, 0], side: [0, 0], bottom: [0, 0] };
    const coords = BLOCK_TEXTURES[blockType] || defaultCoords;
    const [u, v] = coords[face];
    
    // Convertir coordenadas de textura a coordenadas UV (0-1)
    const u0 = u * TEXTURE_SIZE;
    const v0 = 1 - (v + 1) * TEXTURE_SIZE; // Invertir V para que (0,0) sea la esquina inferior izquierda
    const u1 = u0 + TEXTURE_SIZE;
    const v1 = v0 + TEXTURE_SIZE;
    
    // Retornar coordenadas en orden para un quad (TL, TR, BR, BL)
    return [
        u0, v0,  // Vértice superior izquierdo
        u1, v0,  // Vértice superior derecho
        u1, v1,  // Vértice inferior derecho
        u0, v1   // Vértice inferior izquierdo
    ];
}

export class GreedyMesher {
    /**
     * Genera una BufferGeometry por greedy meshing para un chunk.
     * Si se pasa 'world', se consultan bloques fuera del chunk para evitar caras internas.
     * world.getBlock(x,y,z) debe recibir coordenadas ABSOLUTAS de bloque.
     */
    public static generateMesh(chunk: Chunk, world?: any): THREE.BufferGeometry | null {
        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
    
        const sizes = [Chunk.SIZE, Chunk.HEIGHT, Chunk.SIZE];
    
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
    
        // Sweep axes: d is axis being sliced
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
    
            // IMPORTANT: no increment in the for header — we increment inside exactly once per iteration
            for (x[d] = -1; x[d] < dimsD - 1; ) {
                // Build mask for this plane
                let n = 0;
                for (x[v] = 0; x[v] < dimsV; x[v]++) {
                    for (x[u] = 0; x[u] < dimsU; x[u]++) {
                        const a = (x[d] >= 0) ? getBlockAt(x[0], x[1], x[2]) : 0;
                        const b = (x[d] < dimsD - 1) ? getBlockAt(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0;
    
                        if ((a && b) || (!a && !b)) {
                            mask[n++] = 0;
                        } else if (a) {
                            mask[n++] = a;   // positive -> face towards +q
                        } else {
                            mask[n++] = -b;  // negative -> face towards -q
                        }
                    }
                }
    
                // Advance plane exactly once
                x[d]++;
    
                // Generate mesh from mask (dimsU x dimsV)
                n = 0;
                for (let j = 0; j < dimsV; j++) {
                    for (let i = 0; i < dimsU;) {
                        const m = mask[n];
                        if (m !== 0) {
                            // width
                            let w = 1;
                            while (i + w < dimsU && mask[n + w] === m) w++;
    
                            // height
                            let h = 1;
                            outer: while (j + h < dimsV) {
                                for (let k = 0; k < w; k++) {
                                    if (mask[n + k + h * dimsU] !== m) break outer;
                                }
                                h++;
                            }
    
                            // base coords for quad
                            x[u] = i;
                            x[v] = j;
    
                            const du = [0, 0, 0]; du[u] = w;
                            const dv = [0, 0, 0]; dv[v] = h;
    
                            const vertexCount = positions.length / 3;
    
                            // Add 4 verts (generic, works for any face)
                            positions.push(x[0], x[1], x[2]);
                            positions.push(x[0] + du[0], x[1] + du[1], x[2] + du[2]);
                            positions.push(x[0] + du[0] + dv[0], x[1] + du[1] + dv[1], x[2] + du[2] + dv[2]);
                            positions.push(x[0] + dv[0], x[1] + dv[1], x[2] + dv[2]);
    
                            // Indices: winding depends on sign(m)
                            if (m > 0) {
                                indices.push(vertexCount, vertexCount + 1, vertexCount + 2);
                                indices.push(vertexCount, vertexCount + 2, vertexCount + 3);
                            } else {
                                // invert winding for negative faces
                                indices.push(vertexCount, vertexCount + 2, vertexCount + 1);
                                indices.push(vertexCount, vertexCount + 3, vertexCount + 2);
                            }
    
                            // Normals: q * sign(m)
                            const normalSign = (m > 0) ? 1 : -1;
                            for (let t = 0; t < 4; t++) {
                                normals.push(q[0] * normalSign, q[1] * normalSign, q[2] * normalSign);
                            }
    
                            // UVs: determine face type from d and sign(m)
                            const blockType = Math.abs(m) as BlockType;
                            let faceType: 'top' | 'side' | 'bottom' = 'side';
                            if (d === 1) faceType = (m > 0) ? 'top' : 'bottom';
                            else faceType = 'side';
                            const faceUVs = getFaceUVs(blockType, faceType);
                            // faceUVs should be 8 numbers matching order of verts
                            uvs.push(...faceUVs);
    
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
