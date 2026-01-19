import * as THREE from 'three';
import { BlockType } from './BlockType';
import { TextureAtlas } from './TextureAtlas';
import { WorkerManager, type MeshData } from '../workers/WorkerManager';
import { DebugManager } from '../debug/DebugManager';

/**
 * Minimal interface for world objects that can be used for block queries
 */
export interface WorldLike {
    /**
     * Gets the block type at the specified world coordinates
     * @param x World X coordinate
     * @param y World Y coordinate
     * @param z World Z coordinate
     * @returns The type of block at the specified coordinates, or undefined if out of bounds
     */
    getBlock(x: number, y: number, z: number): BlockType | undefined;
    
    /**
     * Gets the shared material for chunk meshes
     * @param debug Optional flag to get the debug wireframe material
     * @returns The shared material or null if not loaded yet
     */
    getMaterial(debug?: boolean): THREE.Material | null;
}

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
    private transitionMesh: THREE.Mesh | null = null; // For LOD transitions
    public isDirty: boolean;
    private nonAirCount: number = 0; // Track number of non-air blocks for fast isEmpty()
    private transitionProgress: number = 0; // 0-1 value for transition progress
    private transitionStartTime: number = 0;
    private transitionDuration: number = 300; // ms for transition
    public currentLOD: 'detailed' | 'greedy' | 'transitioning' = 'detailed';
    
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
     * @param x - X coordinate within chunk (0 to Chunk.SIZE-1)
     * @param y - Y coordinate within chunk (0 to Chunk.HEIGHT-1)
     * @param z - Z coordinate within chunk (0 to Chunk.SIZE-1)
     * @returns The index in the flat blocks array for the given coordinates
     * @throws {Error} If coordinates are out of chunk bounds
     */
    private getIndex(x: number, y: number, z: number): number {
        if (x < 0 || x >= Chunk.SIZE || y < 0 || y >= Chunk.HEIGHT || z < 0 || z >= Chunk.SIZE) {
            throw new Error(`Coordinates (${x}, ${y}, ${z}) are out of chunk bounds`);
        }
        return x + z * Chunk.SIZE + y * Chunk.SIZE * Chunk.SIZE;
    }
    
    /**
     * Gets the block type at the specified local chunk coordinates.
     * This method is safe to call with any coordinates - it will return BlockType.AIR
     * for coordinates outside the chunk bounds.
     *
     * @param x - X coordinate within the chunk (0 to Chunk.SIZE-1)
     * @param y - Y coordinate within the chunk (0 to Chunk.HEIGHT-1)
     * @param z - Z coordinate within the chunk (0 to Chunk.SIZE-1)
     * @returns The type of block at the specified coordinates, or BlockType.AIR if out of bounds
     */
    public getBlock(x: number, y: number, z: number): BlockType {
        if (x < 0 || x >= Chunk.SIZE || y < 0 || y >= Chunk.HEIGHT || z < 0 || z >= Chunk.SIZE) {
            return BlockType.AIR;
        }
        return this.blocks[this.getIndex(x, y, z)];
    }
    
    /**
     * Sets the block type at the specified local chunk coordinates.
     * If the coordinates are out of bounds, this method does nothing.
     * Automatically marks the chunk as dirty if the block type changes.
     *
     * @param x - X coordinate within the chunk (0 to Chunk.SIZE-1)
     * @param y - Y coordinate within the chunk (0 to Chunk.HEIGHT-1)
     * @param z - Z coordinate within the chunk (0 to Chunk.SIZE-1)
     * @param blockType - The type of block to set at the specified coordinates
     * @returns {void}
     */
    public setBlock(x: number, y: number, z: number, blockType: BlockType): void {
        if (x < 0 || x >= Chunk.SIZE || y < 0 || y >= Chunk.HEIGHT || z < 0 || z >= Chunk.SIZE) {
            return; // Out of bounds
        }

        const index = this.getIndex(x, y, z);
        const oldBlockType = this.blocks[index];
        
        // Skip if no change
        if (oldBlockType === blockType) return;
        
        // Update non-air count
        if (oldBlockType === BlockType.AIR) {
            this.nonAirCount++;
        } else if (blockType === BlockType.AIR) {
            this.nonAirCount--;
        }
        
        this.blocks[index] = blockType;
        this.isDirty = true;
    }
    
    /**
     * Fills a 3D region within the chunk with a specific block type.
     * The region is defined by two corner points (x1,y1,z1) and (x2,y2,z2).
     * The coordinates will be automatically ordered to ensure the fill works regardless
     * of which corner is specified first.
     *
     * @param x1 - First X coordinate of the region
     * @param y1 - First Y coordinate of the region
     * @param z1 - First Z coordinate of the region
     * @param x2 - Second X coordinate of the region
     * @param y2 - Second Y coordinate of the region
     * @param z2 - Second Z coordinate of the region
     * @param blockType - The type of block to fill the region with
     * @returns {void}
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
     * Forces the chunk to regenerate its mesh on the next update
     * This is called when a block is modified to ensure the mesh is updated
     */
    public forceMeshRegeneration(): void {
        this.isDirty = true;
        // Clear any existing mesh to force regeneration
        if (this.mesh) {
            if (this.mesh.geometry) {
                this.mesh.geometry.dispose();
            }
            this.mesh = null;
        }
    }
    
    // Starts a transition to a new LOD level
    public startTransitionToLOD(mode: 'detailed' | 'greedy'): void {
        if (this.currentLOD === mode) return;
        
        // If already in transition, complete the current transition first
        if (this.transitionMesh) {
            this.completeTransition();
        }
        
        // Move current mesh to transition mesh
        this.transitionMesh = this.mesh;
        this.mesh = null;
        this.currentLOD = 'transitioning';
        this.transitionProgress = 0;
        this.transitionStartTime = performance.now();
        
        // Mark as dirty to force regeneration with new LOD
        this.markDirty();
    }
    
    // Updates the transition animation
    public updateTransition(): boolean {
        if (this.currentLOD !== 'transitioning') return false;
        
        const now = performance.now();
        const elapsed = now - this.transitionStartTime;
        this.transitionProgress = Math.min(elapsed / this.transitionDuration, 1);
        
        // Update material opacity for crossfade
        if (this.mesh && this.transitionMesh) {
            const newOpacity = this.transitionProgress;
            const oldOpacity = 1 - newOpacity;
            
            const setOpacity = (material: THREE.Material | THREE.Material[], opacity: number) => {
                if (Array.isArray(material)) {
                    material.forEach(m => {
                        if ('opacity' in m) m.opacity = opacity;
                        m.transparent = opacity < 1;
                    });
                } else if ('opacity' in material) {
                    material.opacity = opacity;
                    material.transparent = opacity < 1;
                }
            };
            
            setOpacity(this.mesh.material, newOpacity);
            setOpacity(this.transitionMesh.material, oldOpacity);
        }
        
        // Transition complete
        if (this.transitionProgress >= 1) {
            this.completeTransition();
            return false;
        }
        
        return true;
    }
    
    // Completes the current transition
    private completeTransition(): void {
        if (this.transitionMesh) {
            // Dispose of the old mesh
            if (this.transitionMesh.geometry) this.transitionMesh.geometry.dispose();
            const ownedMaterial = this.transitionMesh.userData?.ownedMaterial || false;
            if (ownedMaterial && this.transitionMesh.material) {
                if (Array.isArray(this.transitionMesh.material)) {
                    this.transitionMesh.material.forEach(m => m.dispose());
                } else {
                    (this.transitionMesh.material as THREE.Material).dispose();
                }
            }
            this.transitionMesh = null;
        }
        
        this.transitionProgress = 0;
        this.currentLOD = this.mesh?.userData?.mode || 'detailed';
    }
    
    /**
     * Gets the chunk's mesh, creating it if necessary
     */
    public getMesh(mode: 'detailed' | 'greedy', world: import('./World').World): THREE.Mesh | null {
        // If we're already in a transition, continue with it
        if (this.currentLOD === 'transitioning' && this.mesh) {
            return this.mesh;
        }
        
        // If LOD mode is changing, start a transition
        if (this.mesh && this.mesh.userData?.mode !== mode) {
            this.startTransitionToLOD(mode);
        }
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
        const disposeMesh = (mesh: THREE.Mesh | null) => {
            if (!mesh) return;
            
            if (mesh.geometry) mesh.geometry.dispose();
            
            // Only dispose of materials if this chunk owns them
            const ownedMaterial = mesh.userData?.ownedMaterial || false;
            if (ownedMaterial && mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    (mesh.material as THREE.Material).dispose();
                }
            }
        };
        
        disposeMesh(this.mesh);
        disposeMesh(this.transitionMesh);
        this.transitionMesh = null;
    }
    
    /**
     * Updates the chunk's mesh based on its block data using simple face culling
     * @param mode The level of detail to use for mesh generation
     * @param world The world instance for querying neighboring blocks
     */
    private updateMesh(mode: 'detailed' | 'greedy', world: WorldLike): void {
        // Skip if chunk is empty
        if (this.isEmpty()) {
            if (this.mesh) {
                // Keep the mesh but make it invisible if we want to reuse it later
                this.mesh.visible = false;
            }
            this.isDirty = false;
            return;
        }

        // Ruta para generación de geometría 'greedy' usando Web Worker
        if (mode === 'greedy') {
            // Ensure world reference is passed for neighbor chunk queries
            if (!world || typeof world.getBlock !== 'function') {
                console.warn('World reference not available for greedy meshing');
                if (this.mesh) this.mesh.visible = false;
                this.isDirty = false;
                return;
            }
            
            // Get material from world (World will handle material management)
            const material = world.getMaterial ? world.getMaterial() : null;
            if (!material) {
                console.warn('No material available for chunk mesh');
                if (this.mesh) this.mesh.visible = false;
                this.isDirty = false;
                return;
            }
            const ownedMaterial = false; // World owns the material
            
            // Create a placeholder mesh if it doesn't exist
            if (!this.mesh) {
                this.mesh = new THREE.Mesh(
                    new THREE.BufferGeometry(),
                    material as THREE.Material
                );
                this.mesh.userData = { 
                    mode: 'greedy',
                    ownedMaterial: ownedMaterial
                };
                this.mesh.castShadow = true;
                this.mesh.receiveShadow = true;
                this.mesh.position.set(
                    this.x * Chunk.SIZE,
                    this.y * Chunk.HEIGHT,
                    this.z * Chunk.SIZE
                );
            } else {
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
                    if (material !== null) {
                        this.mesh.material = material;
                    } else {
                        console.warn('Cannot set null material on mesh');
                        this.mesh.visible = false;
                    }
                }
                this.mesh.userData.ownedMaterial = ownedMaterial;
                this.mesh.visible = true;
            }
            
            // Get the blocks as a Uint8Array for the worker
            const blocks = this.blocks.slice(); // Create a copy to avoid transfer issues
            
            // Store a reference to this chunk to ensure we're working with the latest state
            const chunkX = this.x;
            const chunkY = this.y;
            const chunkZ = this.z;
            
            // Use the worker to generate the mesh asynchronously
            const workerManager = WorkerManager.getInstance();
            
            // Create a function to handle mesh updates
            const updateMeshWithData = (meshData: MeshData | null) => {
                if (!meshData) {
                    console.error(`[Chunk ${chunkX},${chunkY},${chunkZ}] Failed to generate mesh in worker - no data`);
                    if (this.mesh) this.mesh.visible = false;
                    return;
                }
                
                if (!this.mesh) return;
                
                try {
                    let geometry: THREE.BufferGeometry;
                    
                    // Reuse existing geometry if possible, otherwise create a new one
                    if (this.mesh.geometry instanceof THREE.BufferGeometry) {
                        geometry = this.mesh.geometry;
                        // Clear any existing attributes to prevent memory leaks
                        geometry.dispose();
                    } else {
                        geometry = new THREE.BufferGeometry();
                    }
                    
                    // Set attributes with the transferred buffers
                    const positionAttr = new THREE.BufferAttribute(meshData.positions, 3);
                    const normalAttr = new THREE.BufferAttribute(meshData.normals, 3);
                    const uvAttr = new THREE.BufferAttribute(meshData.uvs, 2);
                    const indexAttr = new THREE.BufferAttribute(meshData.indices, 1);
                    
                    // Mark attributes as needing update
                    positionAttr.needsUpdate = true;
                    normalAttr.needsUpdate = true;
                    uvAttr.needsUpdate = true;
                    indexAttr.needsUpdate = true;
                    
                    // Set attributes on the geometry
                    geometry.setAttribute('position', positionAttr);
                    geometry.setAttribute('normal', normalAttr);
                    geometry.setAttribute('uv', uvAttr);
                    geometry.setIndex(indexAttr);
                    
                    // Only compute bounds if we have vertices
                    if (meshData.positions.length > 0) {
                        geometry.computeBoundingBox();
                        geometry.computeBoundingSphere();
                    }
                    
                    // Update the mesh
                    this.mesh.geometry = geometry;
                    this.mesh.visible = meshData.positions.length > 0;
                    
                } catch (error) {
                    console.error(`[Chunk ${chunkX},${chunkY},${chunkZ}] Error updating mesh:`, error);
                    if (this.mesh) this.mesh.visible = false;
                } finally {
                    // Only mark as not dirty after mesh generation is complete
                    if (this.x === chunkX && this.y === chunkY && this.z === chunkZ) {
                        this.isDirty = false;
                    }
                }
            };
            
            // Generate mesh in worker
            workerManager.generateMesh(blocks, this.x, this.y, this.z, 
                (x: number, y: number, z: number) => {
                    // World coordinate to chunk-relative coordinate conversion
                    const chunkX = Math.floor(x / Chunk.SIZE);
                    const chunkY = Math.floor(y / Chunk.HEIGHT);
                    const chunkZ = Math.floor(z / Chunk.SIZE);
                    
                    // If the block is in this chunk, get it directly
                    if (chunkX === this.x && chunkY === this.y && chunkZ === this.z) {
                        return this.getBlock(
                            x - (this.x * Chunk.SIZE),
                            y - (this.y * Chunk.HEIGHT),
                            z - (this.z * Chunk.SIZE)
                        );
                    }
                    
                    // Otherwise, get it from the world
                    if (world && typeof world.getBlock === 'function') {
                        return world.getBlock(x, y, z) || BlockType.AIR;
                    }
                    
                    return BlockType.AIR;
                }
            )
            .then(updateMeshWithData)
            .catch((error) => {
                console.error('Error generating mesh in worker:', error);
                if (this.mesh) this.mesh.visible = false;
                this.isDirty = true; // Mark as dirty to retry on next frame
            });
            
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

                // Check if we need 32-bit indices (more than 65535 indices)
                const needs32BitIndices = this.indexCount > 65535;

                if (geometry.index && this.indexCount > 0) {
                    // Check if we can reuse the existing index buffer
                    const currentIs32Bit = geometry.index.array instanceof Uint32Array;
                    const sizeMatches = geometry.index.count === this.indexCount;

                    if (currentIs32Bit === needs32BitIndices && sizeMatches) {
                        // Same type and size, just update the array
                        geometry.index.copyArray(indexArray);
                        geometry.index.needsUpdate = true;
                    } else {
                        // Size or type doesn't match, create new index buffer
                        geometry.setIndex(null); // Remove existing index
                        if (needs32BitIndices) {
                            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexArray), 1, false));
                        } else {
                            // Convert to Uint16Array if possible
                            if (this.indexCount > 65535) {
                                console.warn('Chunk has too many indices for 16-bit indices, but trying to use them anyway');
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
                } else {
                    // No indices, remove existing index buffer
                    geometry.setIndex(null);
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
            const needs32BitIndices = this.indexCount > 65535;
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
                    if (this.indexCount > 65535) {
                        console.warn('Chunk has too many indices for 16-bit indices, but trying to use them anyway');
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
        let material: THREE.Material | null = null;
        let ownedMaterial = false;
        
        if (world.getMaterial) {
            material = world.getMaterial();
            if (!material) {
                console.error('Failed to get material from world');
                return;
            }
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
        
        // Log mesh regeneration for profiling
        console.log(`[Mesh Generated] Chunk (${this.x},${this.y},${this.z}) ${mode}: ${this.vertexCount} verts, ${this.indexCount} indices`);

        // Marcar como actualizado
        this.isDirty = false;
    }
}
