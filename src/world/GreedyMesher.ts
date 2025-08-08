import * as THREE from 'three';
import { Chunk } from './Chunk';

export class GreedyMesher {
    public static generateMesh(chunk: Chunk): THREE.BufferGeometry | null {
        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        const { SIZE, HEIGHT } = Chunk;

        // Sweep over the 3 dimensions
        for (let d = 0; d < 3; d++) {
            const u = (d + 1) % 3;
            const v = (d + 2) % 3;

            const x = [0, 0, 0];
            const q = [0, 0, 0];
            q[d] = 1;

            const mask = new Int32Array(SIZE * HEIGHT);

            // Sweep over the slices of the chunk
            for (x[d] = -1; x[d] < SIZE;) {
                let n = 0;
                for (x[v] = 0; x[v] < HEIGHT; x[v]++) {
                    for (x[u] = 0; x[u] < SIZE; x[u]++) {
                        const a = (x[d] >= 0) ? chunk.getBlock(x[0], x[1], x[2]) : 0;
                        const b = (x[d] < SIZE - 1) ? chunk.getBlock(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0;

                        if ((!a && !b) || (a && b)) {
                            mask[n++] = 0;
                        } else if (a) {
                            mask[n++] = a;
                        } else {
                            mask[n++] = -b;
                        }
                    }
                }

                x[d]++;
                n = 0;

                // Generate mesh for this slice
                for (let j = 0; j < HEIGHT; j++) {
                    for (let i = 0; i < SIZE;) {
                        if (mask[n]) {
                            let w = 1, h = 1;
                            // Find the width of the quad
                            while (i + w < SIZE && mask[n + w] === mask[n]) {
                                w++;
                            }

                            // Find the height of the quad
                            let done = false;
                            while (j + h < HEIGHT) {
                                for (let k = 0; k < w; k++) {
                                    if (mask[n + k + h * SIZE] !== mask[n]) {
                                        done = true;
                                        break;
                                    }
                                }
                                if (done) break;
                                h++;
                            }

                            x[u] = i;
                            x[v] = j;

                            const du = [0, 0, 0];
                            du[u] = w;
                            const dv = [0, 0, 0];
                            dv[v] = h;

                            const vertexCount = positions.length / 3;

                            positions.push(x[0], x[1], x[2]);
                            positions.push(x[0] + du[0], x[1] + du[1], x[2] + du[2]);
                            positions.push(x[0] + du[0] + dv[0], x[1] + du[1] + dv[1], x[2] + du[2] + dv[2]);
                            positions.push(x[0] + dv[0], x[1] + dv[1], x[2] + dv[2]);

                            indices.push(vertexCount, vertexCount + 1, vertexCount + 2);
                            indices.push(vertexCount, vertexCount + 2, vertexCount + 3);

                            for (let k = 0; k < 4; k++) {
                                normals.push(q[0], q[1], q[2]);
                            }

                            uvs.push(0, 0, 1, 0, 1, 1, 0, 1);

                            // Zero out the mask
                            for (let l = 0; l < h; ++l) {
                                for (let k = 0; k < w; ++k) {
                                    mask[n + k + l * SIZE] = 0;
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

        if (indices.length === 0) {
            return null;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);

        return geometry;
    }
}
