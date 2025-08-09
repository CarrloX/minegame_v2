// This runs in a WebWorker - no DOM or THREE.js access
import { BlockType } from '../world/BlockType';

// Re-implement GreedyMesher logic for the worker context
class GreedyMesherWorker {
    private static readonly SIZE = 16;
    private static readonly HEIGHT = 16;

    // Generate mesh data without THREE.js dependencies
    public static generateMeshData(
        blocks: Uint8Array,
        chunkX: number,
        chunkY: number,
        chunkZ: number,
        worldGetBlock?: (x: number, y: number, z: number) => number | undefined
    ): {
        positions: Float32Array;
        normals: Float32Array;
        uvs: Float32Array;
        indices: Uint32Array;
    } | null {
        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let indexOffset = 0;

        const sizes = [this.SIZE, this.HEIGHT, this.SIZE];

        // Helper to get block at local coordinates
        const getBlockAt = (lx: number, ly: number, lz: number): number => {
            if (lx >= 0 && lx < this.SIZE && 
                ly >= 0 && ly < this.HEIGHT && 
                lz >= 0 && lz < this.SIZE) {
                return blocks[lx + lz * this.SIZE + ly * this.SIZE * this.SIZE];
            }
            // Outside chunk: ask world if available
            if (worldGetBlock) {
                const absX = chunkX * this.SIZE + lx;
                const absY = chunkY * this.HEIGHT + ly;
                const absZ = chunkZ * this.SIZE + lz;
                const b = worldGetBlock(absX, absY, absZ);
                return (typeof b === 'number') ? b : BlockType.AIR;
            }
            return BlockType.AIR;
        };

        // Helper to add a quad to the mesh data
        const addQuad = (
            x: number, y: number, z: number,
            dx1: number, dy1: number, dz1: number,
            dx2: number, dy2: number, dz2: number,
            normal: number[],
            blockType: BlockType
        ) => {
            // Skip air blocks
            if (blockType === BlockType.AIR) return;

            // Calculate vertex positions
            const v1 = [x, y, z];
            const v2 = [x + dx1, y + dy1, z + dz1];
            const v3 = [x + dx1 + dx2, y + dy1 + dy2, z + dz1 + dz2];
            const v4 = [x + dx2, y + dy2, z + dz2];

            // Add vertices (two triangles)
            for (const v of [v1, v2, v3, v1, v3, v4]) {
                positions.push(v[0], v[1], v[2]);
            }

            // Add normals (same for all vertices in the quad)
            for (let i = 0; i < 6; i++) {
                normals.push(...normal);
            }

            // Add UVs (simple planar mapping for now)
            // TODO: Implement proper UV mapping based on block type and face
            for (let i = 0; i < 6; i++) {
                uvs.push(0, 0); // Placeholder UVs
            }

            // Add indices
            for (let i = 0; i < 6; i++) {
                indices.push(indexOffset++);
            }
        };

        // Greedy meshing implementation (simplified)
        // TODO: Implement full greedy meshing algorithm here
        // This is a placeholder that just creates a quad for each visible face
        for (let x = 0; x < this.SIZE; x++) {
            for (let y = 0; y < this.HEIGHT; y++) {
                for (let z = 0; z < this.SIZE; z++) {
                    const blockType = getBlockAt(x, y, z);
                    if (blockType === BlockType.AIR) continue;

                    // Check each neighbor to see if face is visible
                    if (getBlockAt(x-1, y, z) === BlockType.AIR) {
                        addQuad(x, y, z, 0, 1, 0, 0, 0, 1, [-1, 0, 0], blockType);
                    }
                    if (getBlockAt(x+1, y, z) === BlockType.AIR) {
                        addQuad(x+1, y, z, 0, 1, 0, 0, 0, 1, [1, 0, 0], blockType);
                    }
                    if (getBlockAt(x, y-1, z) === BlockType.AIR) {
                        addQuad(x, y, z, 1, 0, 0, 0, 0, 1, [0, -1, 0], blockType);
                    }
                    if (getBlockAt(x, y+1, z) === BlockType.AIR) {
                        addQuad(x, y+1, z, 1, 0, 0, 0, 0, 1, [0, 1, 0], blockType);
                    }
                    if (getBlockAt(x, y, z-1) === BlockType.AIR) {
                        addQuad(x, y, z, 1, 0, 0, 0, 1, 0, [0, 0, -1], blockType);
                    }
                    if (getBlockAt(x, y, z+1) === BlockType.AIR) {
                        addQuad(x, y, z+1, 1, 0, 0, 0, 1, 0, [0, 0, 1], blockType);
                    }
                }
            }
        }

        // Return null if no geometry was generated
        if (positions.length === 0) {
            return null;
        }

        // Convert to typed arrays for efficient transfer
        return {
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            uvs: new Float32Array(uvs),
            indices: new Uint32Array(indices)
        };
    }
}

// Handle messages from the main thread
self.onmessage = function(e: MessageEvent<{
    id: string;
    blocks: ArrayBuffer;
    chunkX: number;
    chunkY: number;
    chunkZ: number;
}>) {
    const { id, blocks, chunkX, chunkY, chunkZ } = e.data;
    
    try {
        const meshData = GreedyMesherWorker.generateMeshData(
            new Uint8Array(blocks),
            chunkX,
            chunkY,
            chunkZ
            // Note: worldGetBlock function cannot be passed directly to worker
            // We'll need to handle chunk borders differently
        );

        if (meshData) {
            // Transfer the ArrayBuffers to avoid copying
            const transfer: Transferable[] = [
                meshData.positions.buffer,
                meshData.normals.buffer,
                meshData.uvs.buffer,
                meshData.indices.buffer
            ];
            
            (self as any).postMessage({
                id,
                positions: meshData.positions,
                normals: meshData.normals,
                uvs: meshData.uvs,
                indices: meshData.indices
            }, transfer);
        } else {
            (self as any).postMessage({ id, empty: true });
        }
    } catch (error) {
        console.error('Error in GreedyMesher worker:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        (self as any).postMessage({ 
            id, 
            error: errorMessage 
        });
    }
};

export {}; // Required for TypeScript worker files
