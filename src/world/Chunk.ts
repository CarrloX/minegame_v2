import * as THREE from 'three';
import { BlockType } from './BlockType';
import { GreedyMesher } from './GreedyMesher';
import { TextureAtlas } from './TextureAtlas';


/**
 * Represents a 16x16x16 chunk of blocks in the world
 */
export class Chunk {
    public static readonly SIZE = 16;
    public static readonly HEIGHT = 16;
    
    // Using a flat array for better memory locality and performance
    // Indexed as [x + z * SIZE + y * SIZE * SIZE]
    private blocks: Uint8Array;
    private mesh: THREE.Mesh | null;
    public isDirty: boolean;
    private nonAirCount: number = 0; // Track number of non-air blocks for fast isEmpty()
    
    // Pre-allocated typed arrays for mesh data
    private positionArray: Float32Array;
    private normalArray: Float32Array;
    private uvArray: Float32Array;
    private indexArray: Uint32Array;
    private vertexCount: number = 0;
    private indexCount: number = 0;
    
    // Reusable array for UV calculations
    private uvTemp: number[][] = [[0, 0], [0, 0], [0, 0], [0, 0]];
    
    // Chunk position in chunk coordinates (not block coordinates)
    constructor(public readonly x: number, public readonly y: number, public readonly z: number) {
        this.blocks = new Uint8Array(Chunk.SIZE * Chunk.SIZE * Chunk.HEIGHT);
        this.mesh = null;
        this.isDirty = true;
        
        // Pre-allocate typed arrays with maximum possible size
        // Maximum possible faces in a chunk: 16x16x16 blocks * 6 faces = 24,576 faces
        // Each face has 4 vertices (24,576 * 4 = 98,304 vertices)
        // Each vertex has 3 components (x,y,z) = 294,912 position/normal components
        // Each vertex has 2 UV components = 196,608 UV components
        // Each face has 6 indices = 147,456 indices
        const maxVertices = Chunk.SIZE * Chunk.SIZE * Chunk.HEIGHT * 24; // 24 vertices per block (6 faces * 4 vertices)
        const maxIndices = Chunk.SIZE * Chunk.SIZE * Chunk.HEIGHT * 36;  // 36 indices per block (6 faces * 6 indices)
        
        this.positionArray = new Float32Array(maxVertices * 3); // x,y,z for each vertex
        this.normalArray = new Float32Array(maxVertices * 3);   // nx,ny,nz for each vertex
        this.uvArray = new Float32Array(maxVertices * 2);       // u,v for each vertex
        this.indexArray = new Uint32Array(maxIndices);
    }
    
    /**
     * Converts 3D chunk coordinates to flat array index
     */
    private getIndex(x: number, y: number, z: number): number {
        if (x < 0 || x >= Chunk.SIZE || y < 0 || y >= Chunk.HEIGHT || z < 0 || z >= Chunk.SIZE) {
            throw new Error(`Coordinates (${x}, ${y}, ${z}) are out of chunk bounds`);
        }
        return x + z * Chunk.SIZE + y * Chunk.SIZE * Chunk.SIZE;
    }
    
    /**
     * Gets the block type at the specified local chunk coordinates
     * Returns BlockType.AIR if coordinates are out of bounds
     */
    public getBlock(x: number, y: number, z: number): BlockType {
        // Check bounds first to handle out-of-bounds gracefully
        if (x < 0 || x >= Chunk.SIZE || 
            y < 0 || y >= Chunk.HEIGHT || 
            z < 0 || z >= Chunk.SIZE) {
            return BlockType.AIR;
        }
        return this.blocks[this.getIndex(x, y, z)];
    }
    
    /**
     * Sets the block type at the specified local chunk coordinates
     */
    public setBlock(x: number, y: number, z: number, blockType: BlockType): void {
        const index = this.getIndex(x, y, z);
        const currentBlock = this.blocks[index];
        
        // Update non-air count
        if (currentBlock === BlockType.AIR && blockType !== BlockType.AIR) {
            this.nonAirCount++;
        } else if (currentBlock !== BlockType.AIR && blockType === BlockType.AIR) {
            this.nonAirCount--;
        }
        
        this.blocks[index] = blockType;
    }
    
    /**
     * Fills a 3D region within the chunk with a specific block type
     */
    public fill(
        x1: number, y1: number, z1: number,
        x2: number, y2: number, z2: number,
        blockType: BlockType
    ): void {
        // Ensure coordinates are in the correct order
        const minX = Math.max(0, Math.min(x1, x2));
        const maxX = Math.min(Chunk.SIZE - 1, Math.max(x1, x2));
        const minY = Math.max(0, Math.min(y1, y2));
        const maxY = Math.min(Chunk.HEIGHT - 1, Math.max(y1, y2));
        const minZ = Math.max(0, Math.min(z1, z2));
        const maxZ = Math.min(Chunk.SIZE - 1, Math.max(z1, z2));
        
        // Count non-air blocks in the fill region to update nonAirCount efficiently
        let airToNonAir = 0;
        let nonAirToAir = 0;
        
        if (blockType === BlockType.AIR) {
            // Count non-air blocks that will become air
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    for (let x = minX; x <= maxX; x++) {
                        if (this.getBlock(x, y, z) !== BlockType.AIR) {
                            nonAirToAir++;
                        }
                    }
                }
            }
            this.nonAirCount -= nonAirToAir;
        } else {
            // Count air blocks that will become non-air
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    for (let x = minX; x <= maxX; x++) {
                        if (this.getBlock(x, y, z) === BlockType.AIR) {
                            airToNonAir++;
                        } else {
                            nonAirToAir++;
                        }
                    }
                }
            }
            this.nonAirCount = this.nonAirCount + airToNonAir - nonAirToAir;
        }
        
        // Now perform the actual fill
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                for (let x = minX; x <= maxX; x++) {
                    this.blocks[this.getIndex(x, y, z)] = blockType;
                }
            }
        }
    }
    
    /**
     * Checks if the chunk is empty (contains only air blocks)
     */
    /**
     * Checks if the chunk is empty (contains only air blocks)
     * Optimized to O(1) using nonAirCount
     */
    public isEmpty(): boolean {
        return this.nonAirCount === 0;
    }
    
    /**
     * Marks the chunk as needing a mesh update
     */
    public markDirty(): void {
        this.isDirty = true;
    }
    
    /**
     * Gets the chunk's mesh, creating it if necessary
     */
    public getMesh(mode: 'detailed' | 'greedy', world: import('./World').World): THREE.Mesh | null {
        if (this.isDirty) {
            this.updateMesh(mode, world);
        }
        return this.mesh;
    }

    /**
     * Disposes of the chunk's resources
     * Only disposes of materials that are owned by this chunk
     */
    public dispose(): void {
        if (this.mesh) {
            // Always dispose of the geometry
            this.mesh.geometry.dispose();
            
            // Only dispose of materials if they are owned by this chunk
            if (this.mesh.userData.ownedMaterial) {
                if (Array.isArray(this.mesh.material)) {
                    this.mesh.material.forEach(m => m.dispose());
                } else if (this.mesh.material) {
                    this.mesh.material.dispose();
                }
            }
        }
    }
    
    /**
     * Updates the chunk's mesh based on its block data using simple face culling
     */
    private updateMesh(mode: 'detailed' | 'greedy', world: any): void {
        // Skip if chunk is empty
        if (this.isEmpty()) {
            if (this.mesh) {
                // Keep the mesh but make it invisible if we want to reuse it later
                this.mesh.visible = false;
            }
            this.isDirty = false;
            return;
        }

        // Ruta para generación de geometría 'greedy'
        if (mode === 'greedy') {
            // Ensure world reference is passed to GreedyMesher for neighbor chunk queries
            if (!world || typeof world.getBlock !== 'function') {
                console.warn('World reference not available for greedy meshing');
                if (this.mesh) this.mesh.visible = false;
                this.isDirty = false;
                return;
            }
            
            // Generate the mesh data
            const geometry = GreedyMesher.generateMesh(this, world);
            if (!geometry) {
                if (this.mesh) this.mesh.visible = false;
                this.isDirty = false;
                return;
            }

            // Get or create material
            let material: THREE.Material;
            let ownedMaterial = false;
            
            if (world.getMaterial) {
                material = world.getMaterial();
                ownedMaterial = false;
            } else {
                material = new THREE.MeshBasicMaterial({ 
                    color: 0x00ff00,
                    side: THREE.DoubleSide,
                    transparent: true,
                    alphaTest: 0.1
                });
                ownedMaterial = true;
            }
            
            // Reuse existing mesh if possible
            if (this.mesh) {
                // Dispose of old geometry if it exists
                const oldGeometry = this.mesh.geometry as THREE.BufferGeometry;
                if (oldGeometry) oldGeometry.dispose();
                
                // Update geometry
                this.mesh.geometry = geometry;
                
                // Update material if needed (only if the ownership changed)
                const currentOwned = this.mesh.userData.ownedMaterial || false;
                if (currentOwned !== ownedMaterial || this.mesh.material !== material) {
                    if (currentOwned && this.mesh.material) {
                        if (Array.isArray(this.mesh.material)) {
                            this.mesh.material.forEach(m => m.dispose());
                        } else {
                            (this.mesh.material as THREE.Material).dispose();
                        }
                    }
                    this.mesh.material = material;
                }
                
                // Update user data
                this.mesh.userData = { 
                    mode: 'greedy',
                    ownedMaterial: ownedMaterial
                };
                
                this.mesh.visible = true;
            } else {
                // Create new mesh if it doesn't exist
                this.mesh = new THREE.Mesh(geometry, material);
                this.mesh.userData = { 
                    mode: 'greedy',
                    ownedMaterial: ownedMaterial
                };
                this.mesh.castShadow = true;
                this.mesh.receiveShadow = true;
                
                // Set position
                this.mesh.position.set(
                    this.x * Chunk.SIZE,
                    this.y * Chunk.HEIGHT,
                    this.z * Chunk.SIZE
                );
            }

            this.isDirty = false;
            return;
        }
        
        // Reuse this array to reduce garbage collection (kept for backward compatibility)
        // Note: This is now a class-level variable, but we keep this for any other code that might use it
        
        // Reset counters
        this.vertexCount = 0;
        this.indexCount = 0;
        
        // Use the class-level typed arrays directly
        
        // Function to add a face to the mesh using pre-allocated typed arrays
        const addFace = (vertices: number[], normal: number[], blockType: BlockType, face: string) => {
            const vertexIndex = this.vertexCount;
            
            // Add vertex positions and normals
            for (let i = 0; i < 4; i++) {
                const v = i * 3; // 0, 3, 6, 9
                
                // Add position
                this.positionArray[this.vertexCount * 3] = vertices[v];
                this.positionArray[this.vertexCount * 3 + 1] = vertices[v + 1];
                this.positionArray[this.vertexCount * 3 + 2] = vertices[v + 2];
                
                // Add normal
                this.normalArray[this.vertexCount * 3] = normal[0];
                this.normalArray[this.vertexCount * 3 + 1] = normal[1];
                this.normalArray[this.vertexCount * 3 + 2] = normal[2];
                
                this.vertexCount++;
            }
            
            // Get UV coordinates using the centralized texture atlas
            TextureAtlas.getUvCoordsReusable(blockType, face, this.uvTemp);
            
            // Add UVs
            for (let i = 0; i < 4; i++) {
                this.uvArray[vertexIndex * 2 + i * 2] = this.uvTemp[i][0];
                this.uvArray[vertexIndex * 2 + i * 2 + 1] = this.uvTemp[i][1];
            }
            
            // Add indices (two triangles: 0,1,2 and 0,2,3)
            this.indexArray[this.indexCount++] = vertexIndex;
            this.indexArray[this.indexCount++] = vertexIndex + 1;
            this.indexArray[this.indexCount++] = vertexIndex + 2;
            this.indexArray[this.indexCount++] = vertexIndex;
            this.indexArray[this.indexCount++] = vertexIndex + 2;
            this.indexArray[this.indexCount++] = vertexIndex + 3;
        };
        
        // Verificar si un bloque está oculto (rodeado por bloques en todas las direcciones)
        const isBlockHidden = (x: number, y: number, z: number): boolean => {
            if (x === 0 || x === Chunk.SIZE - 1 ||
                y === 0 || y === Chunk.HEIGHT - 1 ||
                z === 0 || z === Chunk.SIZE - 1) {
                return false;
            }
            return this.getBlock(x + 1, y, z) !== BlockType.AIR &&
                   this.getBlock(x - 1, y, z) !== BlockType.AIR &&
                   this.getBlock(x, y + 1, z) !== BlockType.AIR &&
                   this.getBlock(x, y - 1, z) !== BlockType.AIR &&
                   this.getBlock(x, y, z + 1) !== BlockType.AIR &&
                   this.getBlock(x, y, z - 1) !== BlockType.AIR;
        };
        
        // Generate geometry for each block
        // Optimized loop order (y-z-x) for better memory locality
        // This matches the memory layout of the block data array (x + z*SIZE + y*SIZE*SIZE)
        for (let y = 0; y < Chunk.HEIGHT; y++) {
            for (let z = 0; z < Chunk.SIZE; z++) {
                for (let x = 0; x < Chunk.SIZE; x++) {
                    const blockType = this.getBlock(x, y, z);
                    if (blockType === BlockType.AIR) continue;
                    if (isBlockHidden(x, y, z)) continue;

                    const px = x, py = y, pz = z;

                    // Check adjacent blocks and add faces as needed
                    // Front face (z+1)
                    const frontBlock = (z === Chunk.SIZE - 1) 
                        ? world.getBlock(this.x * Chunk.SIZE + x, this.y * Chunk.HEIGHT + y, this.z * Chunk.SIZE + z + 1) 
                        : this.getBlock(x, y, z + 1);
                    if (frontBlock === BlockType.AIR) {
                        addFace([px, py, pz + 1, px + 1, py, pz + 1, px + 1, py + 1, pz + 1, px, py + 1, pz + 1], 
                               [0, 0, 1], blockType, 'front');
                    }

                    // Back face (z-1)
                    const backBlock = (z === 0) 
                        ? world.getBlock(this.x * Chunk.SIZE + x, this.y * Chunk.HEIGHT + y, this.z * Chunk.SIZE + z - 1) 
                        : this.getBlock(x, y, z - 1);
                    if (backBlock === BlockType.AIR) {
                        addFace([px + 1, py, pz, px, py, pz, px, py + 1, pz, px + 1, py + 1, pz], 
                              [0, 0, -1], blockType, 'back');
                    }

                    // Right face (x+1)
                    const rightBlock = (x === Chunk.SIZE - 1) 
                        ? world.getBlock(this.x * Chunk.SIZE + x + 1, this.y * Chunk.HEIGHT + y, this.z * Chunk.SIZE + z) 
                        : this.getBlock(x + 1, y, z);
                    if (rightBlock === BlockType.AIR) {
                        addFace([px + 1, py, pz + 1, px + 1, py, pz, px + 1, py + 1, pz, px + 1, py + 1, pz + 1], 
                              [1, 0, 0], blockType, 'right');
                    }

                    // Left face (x-1)
                    const leftBlock = (x === 0) 
                        ? world.getBlock(this.x * Chunk.SIZE + x - 1, this.y * Chunk.HEIGHT + y, this.z * Chunk.SIZE + z) 
                        : this.getBlock(x - 1, y, z);
                    if (leftBlock === BlockType.AIR) {
                        addFace([px, py, pz, px, py, pz + 1, px, py + 1, pz + 1, px, py + 1, pz], 
                              [-1, 0, 0], blockType, 'left');
                    }

                    // Top face (y+1)
                    const topBlock = (y === Chunk.HEIGHT - 1) 
                        ? world.getBlock(this.x * Chunk.SIZE + x, this.y * Chunk.HEIGHT + y + 1, this.z * Chunk.SIZE + z) 
                        : this.getBlock(x, y + 1, z);
                    if (topBlock === BlockType.AIR) {
                        addFace([px, py + 1, pz, px, py + 1, pz + 1, px + 1, py + 1, pz + 1, px + 1, py + 1, pz], 
                              [0, 1, 0], blockType, 'top');
                    }

                    // Bottom face (y-1)
                    const bottomBlock = (y === 0) 
                        ? world.getBlock(this.x * Chunk.SIZE + x, this.y * Chunk.HEIGHT + y - 1, this.z * Chunk.SIZE + z) 
                        : this.getBlock(x, y - 1, z);
                    if (bottomBlock === BlockType.AIR) {
                        addFace([px, py, pz, px + 1, py, pz, px + 1, py, pz + 1, px, py, pz + 1], 
                              [0, -1, 0], blockType, 'bottom');
                    }
                }
            }
        }
        
        // Create or update geometry for detailed mode
        let geometry: THREE.BufferGeometry;
        
        if (this.mesh && this.mesh.userData.mode === 'detailed' && this.vertexCount > 0) {
            // Reuse existing geometry
            geometry = this.mesh.geometry as THREE.BufferGeometry;
            
            // Update existing attributes if they exist
            if (this.vertexCount > 0) {
                // Get or create attributes
                let positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
                let normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;
                let uvAttr = geometry.getAttribute('uv') as THREE.BufferAttribute;
                
                // Create new buffer attributes with the exact size needed
                const positionArray = new Float32Array(this.positionArray.buffer, 0, this.vertexCount * 3);
                const normalArray = new Float32Array(this.normalArray.buffer, 0, this.vertexCount * 3);
                const uvArray = new Float32Array(this.uvArray.buffer, 0, this.vertexCount * 2);
                
                // Update position attribute
                if (positionAttr && positionAttr.count === this.vertexCount) {
                    positionAttr.copyArray(positionArray);
                    positionAttr.needsUpdate = true;
                } else {
                    geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
                }
                
                // Update normal attribute
                if (normalAttr && normalAttr.count === this.vertexCount) {
                    normalAttr.copyArray(normalArray);
                    normalAttr.needsUpdate = true;
                } else {
                    geometry.setAttribute('normal', new THREE.BufferAttribute(normalArray, 3));
                }
                
                // Update UV attribute
                if (uvAttr && uvAttr.count === this.vertexCount) {
                    uvAttr.copyArray(uvArray);
                    uvAttr.needsUpdate = true;
                } else {
                    geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
                }
                
                // Handle index buffer with proper type (Uint16Array or Uint32Array)
                const indexArray = this.indexCount > 0 ? 
                    new Uint32Array(this.indexArray.buffer, 0, this.indexCount) : 
                    new Uint32Array(0);
                
                // Check if we need 32-bit indices (more than 65535 vertices)
                const needs32BitIndices = this.vertexCount > 65535;
                
                if (geometry.index) {
                    // If the current index type doesn't match what we need, create a new one
                    const currentIs32Bit = geometry.index.array instanceof Uint32Array;
                    
                    if (currentIs32Bit === needs32BitIndices) {
                        // Same type, just update the array
                        geometry.index.copyArray(indexArray);
                        geometry.index.needsUpdate = true;
                    } else {
                        // Need to create a new index buffer with the correct type
                        geometry.setIndex(null); // Remove existing index
                        if (needs32BitIndices) {
                            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexArray), 1, false));
                        } else {
                            // Convert to Uint16Array if possible
                            if (this.vertexCount > 65535) {
                                console.warn('Chunk has too many vertices for 16-bit indices, but trying to use them anyway');
                            }
                            geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indexArray), 1, false));
                        }
                    }
                } else if (this.indexCount > 0) {
                    // Create new index buffer with appropriate type
                    if (needs32BitIndices) {
                        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexArray), 1, false));
                    } else {
                        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indexArray), 1, false));
                    }
                }
                
                geometry.computeBoundingSphere();
                geometry.computeBoundingBox();
            } else {
                // No geometry to show, make mesh invisible
                this.mesh.visible = false;
                this.isDirty = false;
                return;
            }
        } else if (this.vertexCount > 0) {
            // Create new geometry if none exists or if switching from greedy mode
            geometry = new THREE.BufferGeometry();
            
            // Create typed arrays with the exact size needed
            const positionArray = new Float32Array(this.positionArray.buffer, 0, this.vertexCount * 3);
            const normalArray = new Float32Array(this.normalArray.buffer, 0, this.vertexCount * 3);
            const uvArray = new Float32Array(this.uvArray.buffer, 0, this.vertexCount * 2);
            
            // Create index array with appropriate type (Uint16Array or Uint32Array)
            const needs32BitIndices = this.vertexCount > 65535;
            const indexArray = this.indexCount > 0 ? 
                new Uint32Array(this.indexArray.buffer, 0, this.indexCount) : 
                new Uint32Array(0);
            
            // Set geometry attributes
            geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
            geometry.setAttribute('normal', new THREE.BufferAttribute(normalArray, 3));
            geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
            
            // Set index with appropriate type
            if (indexArray.length > 0) {
                if (needs32BitIndices) {
                    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexArray), 1, false));
                } else {
                    // Convert to Uint16Array if possible
                    if (this.vertexCount > 65535) {
                        console.warn('Chunk has too many vertices for 16-bit indices, but trying to use them anyway');
                    }
                    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indexArray), 1, false));
                }
            }
            
            geometry.computeBoundingSphere();
            geometry.computeBoundingBox();
        } else {
            // No geometry to show
            if (this.mesh) this.mesh.visible = false;
            this.isDirty = false;
            return;
        }

        // Get or create material
        let material: THREE.Material;
        let ownedMaterial = false;
        
        if (world.getMaterial) {
            material = world.getMaterial();
            ownedMaterial = false;
        } else {
            // Fallback material if world doesn't provide one
            const textureLoader = new THREE.TextureLoader();
            const texture = textureLoader.load('/assets/textures/atlas.png');
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestMipmapLinearFilter;
            
            material = new THREE.MeshStandardMaterial({
                map: texture,
                side: THREE.DoubleSide,
                transparent: true,
                alphaTest: 0.5
            });
            ownedMaterial = true;
        }

        // Reuse or create mesh
        if (this.mesh) {
            // Dispose of old geometry if it's not being reused
            if (this.mesh.userData.mode !== 'detailed') {
                const oldGeometry = this.mesh.geometry as THREE.BufferGeometry;
                if (oldGeometry) oldGeometry.dispose();
                this.mesh.geometry = geometry;
            }
            
            // Update material if needed
            const currentOwned = this.mesh.userData.ownedMaterial || false;
            if (currentOwned !== ownedMaterial || this.mesh.material !== material) {
                if (currentOwned && this.mesh.material) {
                    if (Array.isArray(this.mesh.material)) {
                        this.mesh.material.forEach(m => m.dispose());
                    } else {
                        (this.mesh.material as THREE.Material).dispose();
                    }
                }
                this.mesh.material = material;
            }
            
            // Update user data
            this.mesh.userData = { 
                mode: 'detailed',
                ownedMaterial: ownedMaterial
            };
            
            this.mesh.visible = true;
        } else {
            // Create new mesh
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.userData = { 
                mode: 'detailed',
                ownedMaterial: ownedMaterial
            };
            this.mesh.castShadow = true;
            this.mesh.receiveShadow = true;
            
            // Set position
            this.mesh.position.set(
                this.x * Chunk.SIZE,
                this.y * Chunk.HEIGHT,
                this.z * Chunk.SIZE
            );
        }
        
        // Marcar como actualizado
        this.isDirty = false;
    }
}
