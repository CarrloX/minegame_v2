// GreedyMesher.ts
import * as THREE from 'three';
import { Chunk } from './Chunk';
import { BlockType } from './BlockType';

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

        // helper: obtener bloque local (0 para aire) usando world cuando esté fuera del chunk
        const getBlockAt = (lx: number, ly: number, lz: number): number => {
            // si está dentro del chunk, usar chunk.getBlock
            if (lx >= 0 && lx < Chunk.SIZE && ly >= 0 && ly < Chunk.HEIGHT && lz >= 0 && lz < Chunk.SIZE) {
                return chunk.getBlock(lx, ly, lz);
            }
            // fuera del chunk: si tenemos world, preguntar con coordenadas absolutas
            if (!world || typeof world.getBlock !== 'function') return BlockType.AIR;
            const absX = chunk.x * Chunk.SIZE + lx;
            const absY = chunk.y * Chunk.HEIGHT + ly;
            const absZ = chunk.z * Chunk.SIZE + lz;
            const b = world.getBlock(absX, absY, absZ);
            return (typeof b === 'number') ? b : BlockType.AIR;
        };

        // Sweep axes
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

            for (x[d] = -1; x[d] < dimsD; x[d]++) {
                // build mask
                let n = 0;
                for (x[v] = 0; x[v] < dimsV; x[v]++) {
                    for (x[u] = 0; x[u] < dimsU; x[u]++) {
                        const a = (x[d] >= 0) ? getBlockAt(x[0], x[1], x[2]) : 0;
                        const b = (x[d] < dimsD - 1) ? getBlockAt(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0;

                        if ((a && b) || (!a && !b)) {
                            mask[n++] = 0;
                        } else if (a) {
                            mask[n++] = a;       // positive -> face towards +q
                        } else {
                            mask[n++] = -b;      // negative -> face towards -q
                        }
                    }
                }

                x[d]++; // advance plane

                // generate mesh for mask (dimsU x dimsV)
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

                            // set base coords
                            x[u] = i;
                            x[v] = j;

                            const du = [0, 0, 0];
                            du[u] = w;
                            const dv = [0, 0, 0];
                            dv[v] = h;

                            const vertexCount = positions.length / 3;

                            // vertices (ordered so that positive m -> normal = +q and winding correct)
                            positions.push(x[0], x[1], x[2]);
                            positions.push(x[0] + du[0], x[1] + du[1], x[2] + du[2]);
                            positions.push(x[0] + du[0] + dv[0], x[1] + du[1] + dv[1], x[2] + du[2] + dv[2]);
                            positions.push(x[0] + dv[0], x[1] + dv[1], x[2] + dv[2]);

                            // indices: winding depends on sign(m)
                            if (m > 0) {
                                indices.push(vertexCount, vertexCount + 1, vertexCount + 2);
                                indices.push(vertexCount, vertexCount + 2, vertexCount + 3);
                            } else {
                                // invert winding for negative faces
                                indices.push(vertexCount, vertexCount + 2, vertexCount + 1);
                                indices.push(vertexCount, vertexCount + 3, vertexCount + 2);
                            }

                            // normals
                            const normalSign = (m > 0) ? 1 : -1;
                            for (let t = 0; t < 4; t++) {
                                normals.push(q[0] * normalSign, q[1] * normalSign, q[2] * normalSign);
                            }

                            // uvs (0..1 default per quad) — adapta según atlas si necesitas
                            uvs.push(0, 0, 1, 0, 1, 1, 0, 1);

                            // zero out mask
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

        return geometry;
    }
}
