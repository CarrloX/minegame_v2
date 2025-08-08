import * as THREE from 'three';
import { BlockType } from '../blocks/BlockType';
import { BlockTextures } from '../assets/textureAtlas';

export interface MeshData {
    positions: number[];
    normals: number[];
    uvs: number[];
    indices: number[];
    materials: {
        blockType: BlockType;
        face: 'top' | 'side' | 'bottom';
        start: number;
        count: number;
    }[];
}

export class GreedyMesher {
    private static readonly CHUNK_SIZE = 16;
    private static readonly FACE_INDICES = [
        [4, 5, 6, 7],  // Right
        [0, 3, 2, 1],  // Left
        [5, 4, 0, 1],  // Top
        [6, 7, 3, 2],  // Bottom
        [1, 2, 6, 5],  // Front
        [0, 4, 7, 3]   // Back
    ];

    private static readonly NORMALS = [
        new THREE.Vector3(1, 0, 0),   // Right
        new THREE.Vector3(-1, 0, 0),  // Left
        new THREE.Vector3(0, 1, 0),   // Top
        new THREE.Vector3(0, -1, 0),  // Bottom
        new THREE.Vector3(0, 0, 1),   // Front
        new THREE.Vector3(0, 0, -1)   // Back
    ];

    // Get UV coordinates for a specific face of a block
    private static isSameBlockType(a: number, b: number): boolean {
        // Consider air blocks as the same for meshing purposes
        if (a === BlockType.AIR && b === BlockType.AIR) return true;
        // For non-air blocks, they must be exactly the same
        return a === b;
    }

    /**
     * Get UV coordinates for a specific face of a block from the texture atlas
     * The UV coordinates must match the vertex order in the addQuad method:
     * - For all faces, the order is: v0, v1, v2, v3 (four vertices of the quad)
     * - The order is different for each face to ensure correct face culling
     */
    private static getFaceUVs(blockType: BlockType, face: number): number[] {
        // Determine the face type (top, bottom, or side)
        const faceType = face === 2 ? 'top' : (face === 3 ? 'bottom' : 'side');
        const uv = BlockTextures[blockType][faceType];
        
        // Return UV coordinates in the correct order for the face
        // The order must match the vertex order in the addQuad method
        switch (face) {
            case 0: // Right
                // Order: v0, v1, v2, v3 (clockwise when viewed from the front)
                return [
                    uv.u, uv.v + uv.height,          // v0: bottom-left
                    uv.u + uv.width, uv.v + uv.height, // v1: bottom-right
                    uv.u + uv.width, uv.v,            // v2: top-right
                    uv.u, uv.v                        // v3: top-left
                ];
            case 1: // Left
                // Order: v0, v1, v2, v3 (clockwise when viewed from the front)
                return [
                    uv.u + uv.width, uv.v + uv.height, // v0: bottom-right
                    uv.u, uv.v + uv.height,           // v1: bottom-left
                    uv.u, uv.v,                       // v2: top-left
                    uv.u + uv.width, uv.v             // v3: top-right
                ];
            case 2: // Top
                // Order: v0, v1, v2, v3 (clockwise when viewed from above)
                return [
                    uv.u, uv.v + uv.height,          // v0: near-left
                    uv.u + uv.width, uv.v + uv.height, // v1: near-right
                    uv.u + uv.width, uv.v,            // v2: far-right
                    uv.u, uv.v                        // v3: far-left
                ];
            case 3: // Bottom
                // Order: v0, v1, v2, v3 (clockwise when viewed from below)
                return [
                    uv.u, uv.v,                      // v0: near-left
                    uv.u + uv.width, uv.v,           // v1: near-right
                    uv.u + uv.width, uv.v + uv.height, // v2: far-right
                    uv.u, uv.v + uv.height           // v3: far-left
                ];
            case 4: // Front
                // Order: v0, v1, v2, v3 (clockwise when viewed from the front)
                return [
                    uv.u, uv.v + uv.height,          // v0: bottom-left
                    uv.u + uv.width, uv.v + uv.height, // v1: bottom-right
                    uv.u + uv.width, uv.v,            // v2: top-right
                    uv.u, uv.v                        // v3: top-left
                ];
            case 5: // Back
                // Order: v0, v1, v2, v3 (clockwise when viewed from the back)
                return [
                    uv.u + uv.width, uv.v + uv.height, // v0: bottom-right
                    uv.u, uv.v + uv.height,           // v1: bottom-left
                    uv.u, uv.v,                       // v2: top-left
                    uv.u + uv.width, uv.v             // v3: top-right
                ];
            default:
                // Default to side texture for unknown faces
                return [
                    uv.u, uv.v + uv.height,
                    uv.u + uv.width, uv.v + uv.height,
                    uv.u + uv.width, uv.v,
                    uv.u, uv.v
                ];
        }
    }

    /**
     * Generate optimized mesh data for a chunk using greedy meshing algorithm
     * @param blocks 3D array of block types (number[][][])
     * @returns Optimized mesh data
     */
    public static generateMesh(blocks: number[][][]): MeshData {
        const meshData: MeshData = {
            positions: [],
            normals: [],
            uvs: [],
            indices: [],
            materials: []
        };
        
        // Track the current index offset for material groups
        let currentIndexOffset = 0;

        // Process each face direction (right, left, top, bottom, front, back)
        for (let face = 0; face < 6; face++) {
            currentIndexOffset = this.processFace(face, blocks, meshData, currentIndexOffset);
        }

        return meshData;
    }

    private static processFace(face: number, blocks: number[][][], meshData: MeshData, currentIndexOffset: number): number {
        // Create a 2D mask to track processed blocks
        const mask = Array(this.CHUNK_SIZE * this.CHUNK_SIZE).fill(0);
        
        // The current index offset is now passed as a parameter
        
        // Determine the primary axis and the other two axes based on face
        const u = (face % 3 + 1) % 3;
        const v = (face % 3 + 2) % 3;
        const w = face % 3;
        
        // Determine the direction of the face
        const dir = Math.floor(face / 3) * 2 - 1;
        
        // Process each layer along the primary axis
        for (let d = 0; d < this.CHUNK_SIZE; d++) {
            // Reset mask for this layer
            mask.fill(0);
            
            // Build the mask for this layer
            for (let vv = 0; vv < this.CHUNK_SIZE; vv++) {
                for (let uu = 0; uu < this.CHUNK_SIZE; uu++) {
                    const pos = [0, 0, 0];
                    const wPos = dir > 0 ? d : this.CHUNK_SIZE - 1 - d;
                    
                    pos[u] = uu;
                    pos[v] = vv;
                    pos[w] = wPos;
                    
                    const currentBlock = this.getBlock(blocks, pos[0], pos[1], pos[2]);
                    const neighborPos = [...pos];
                    neighborPos[w] += dir;
                    const neighborBlock = this.getBlock(blocks, neighborPos[0], neighborPos[1], neighborPos[2]);
                    
                    // Mark as visible if current block is solid and neighbor is air or out of bounds
                    if (currentBlock !== BlockType.AIR && 
                        (neighborBlock === BlockType.AIR || neighborBlock === undefined)) {
                        mask[vv * this.CHUNK_SIZE + uu] = currentBlock;
                    }
                }
            }
            
            // Generate quads using greedy meshing
            for (let vv = 0; vv < this.CHUNK_SIZE; vv++) {
                for (let uu = 0; uu < this.CHUNK_SIZE; uu++) {
                    if (mask[vv * this.CHUNK_SIZE + uu] === 0) continue;
                    
                    // Determine the width and height of the quad
                    let width = 1;
                    while (uu + width < this.CHUNK_SIZE && 
                           this.isSameBlockType(mask[vv * this.CHUNK_SIZE + uu + width], mask[vv * this.CHUNK_SIZE + uu])) {
                        width++;
                    }
                    
                    let height = 1;
                    let canExpandHeight = true;
                    
                    while (vv + height < this.CHUNK_SIZE && canExpandHeight) {
                        for (let i = 0; i < width; i++) {
                            if (!this.isSameBlockType(mask[(vv + height) * this.CHUNK_SIZE + uu + i], mask[vv * this.CHUNK_SIZE + uu])) {
                                canExpandHeight = false;
                                break;
                            }
                        }
                        
                        if (canExpandHeight) {
                            height++;
                        }
                    }
                    
                    // Add the quad to the mesh
                    const blockType = mask[vv * this.CHUNK_SIZE + uu];

                    // Mark these blocks as processed
                    for (let h = 0; h < height; h++) {
                        for (let w = 0; w < width; w++) {
                            mask[(vv + h) * this.CHUNK_SIZE + uu + w] = 0;
                        }
                    }
                    const prevIndexCount = meshData.indices.length;
                    
                    this.addQuad(
                        face, 
                        uu, vv, d, 
                        width, height, 
                        blockType,
                        meshData
                    );
                    
                    // Add material group for this face
                    const faceType = face === 2 ? 'top' : (face === 3 ? 'bottom' : 'side');
                    const indexCount = meshData.indices.length - prevIndexCount;
                    
                    meshData.materials.push({
                        blockType,
                        face: faceType,
                        start: currentIndexOffset,
                        count: indexCount
                    });
                    
                    currentIndexOffset += indexCount;
                    
                    // Skip processed blocks
                    uu += width - 1;
                }
            }
        }
        return currentIndexOffset;
    }

    private static addQuad(
        face: number, 
        u: number, v: number, d: number, 
        width: number, height: number, 
        blockType: BlockType,
        meshData: MeshData
    ): void {
        const indexOffset = meshData.positions.length / 3;
        const normal = GreedyMesher.NORMALS[face];
        
        // Define the four corners of the quad
        const positions: THREE.Vector3[] = [];
        
        // Determine quad position based on face direction
        switch (face) {
            case 0: // Right
                positions.push(
                    new THREE.Vector3(d + 1, v, u),
                    new THREE.Vector3(d + 1, v, u + width),
                    new THREE.Vector3(d + 1, v + height, u + width),
                    new THREE.Vector3(d + 1, v + height, u)
                );
                break;
            case 1: // Left
                positions.push(
                    new THREE.Vector3(d, v, u + width),
                    new THREE.Vector3(d, v, u),
                    new THREE.Vector3(d, v + height, u),
                    new THREE.Vector3(d, v + height, u + width)
                );
                break;
            case 2: // Top
                positions.push(
                    new THREE.Vector3(u, v + 1, d + width),
                    new THREE.Vector3(u + width, v + 1, d + width),
                    new THREE.Vector3(u + width, v + 1, d),
                    new THREE.Vector3(u, v + 1, d)
                );
                break;
            case 3: // Bottom
                positions.push(
                    new THREE.Vector3(u, v, d),
                    new THREE.Vector3(u + width, v, d),
                    new THREE.Vector3(u + width, v, d + width),
                    new THREE.Vector3(u, v, d + width)
                );
                break;
            case 4: // Front
                positions.push(
                    new THREE.Vector3(u, v, d + 1),
                    new THREE.Vector3(u + width, v, d + 1),
                    new THREE.Vector3(u + width, v + height, d + 1),
                    new THREE.Vector3(u, v + height, d + 1)
                );
                break;
            case 5: // Back
                positions.push(
                    new THREE.Vector3(u + width, v, d),
                    new THREE.Vector3(u, v, d),
                    new THREE.Vector3(u, v + height, d),
                    new THREE.Vector3(u + width, v + height, d)
                );
                break;
        }
        
        // Add positions and normals
        for (const pos of positions) {
            meshData.positions.push(pos.x, pos.y, pos.z);
            meshData.normals.push(normal.x, normal.y, normal.z);
        }
        
        // Add UVs from texture atlas
        const faceUVs = this.getFaceUVs(blockType, face);
        meshData.uvs.push(...faceUVs);
        
        // Add indices (two triangles)
        meshData.indices.push(
            indexOffset, indexOffset + 1, indexOffset + 2,
            indexOffset, indexOffset + 2, indexOffset + 3
        );
    }


    
    private static getBlock(blocks: number[][][], x: number, y: number, z: number): number {
        if (x < 0 || y < 0 || z < 0 || x >= this.CHUNK_SIZE || y >= this.CHUNK_SIZE || z >= this.CHUNK_SIZE) {
            return BlockType.AIR;
        }
        return blocks[x][y][z];
    }
}
