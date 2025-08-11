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
    
    // Chunk position in chunk coordinates (not block coordinates)
    constructor(public readonly x: number, public readonly y: number, public readonly z: number) {
        this.blocks = new Uint8Array(Chunk.SIZE * Chunk.SIZE * Chunk.HEIGHT);
        this.mesh = null;
        this.isDirty = true;
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
        
        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        
        // Reuse this array to reduce garbage collection
        const uvTemp: number[][] = [[0, 0], [0, 0], [0, 0], [0, 0]];
        
        // Función para agregar una cara al mesh
        const addFace = (vertices: number[], normal: number[], blockType: BlockType, face: string) => {
            const vertexCount = positions.length / 3;
            for (let i = 0; i < vertices.length; i += 3) {
                positions.push(vertices[i], vertices[i + 1], vertices[i + 2]);
                normals.push(normal[0], normal[1], normal[2]);
            }
            // Get UV coordinates using the centralized texture atlas
            TextureAtlas.getUvCoordsReusable(blockType, face, uvTemp);
            for (let i = 0; i < 4; i++) {
                uvs.push(uvTemp[i][0], uvTemp[i][1]);
            }
            indices.push(vertexCount, vertexCount + 1, vertexCount + 2, vertexCount, vertexCount + 2, vertexCount + 3);
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
        
        if (this.mesh && this.mesh.userData.mode === 'detailed') {
            // Reuse existing geometry
            geometry = this.mesh.geometry as THREE.BufferGeometry;
            
            // Update existing attributes if they exist
            if (positions.length > 0) {
                // Get or create attributes
                let positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
                let normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;
                let uvAttr = geometry.getAttribute('uv') as THREE.BufferAttribute;
                
                // Update position attribute
                if (positionAttr) {
                    positionAttr.copyArray(new Float32Array(positions));
                    positionAttr.needsUpdate = true;
                }
                
                // Update normal attribute
                if (normalAttr) {
                    normalAttr.copyArray(new Float32Array(normals));
                    normalAttr.needsUpdate = true;
                }
                
                // Update UV attribute
                if (uvAttr) {
                    uvAttr.copyArray(new Float32Array(uvs));
                    uvAttr.needsUpdate = true;
                }
                
                // Update index if it exists
                if (geometry.index) {
                    geometry.index.copyArray(new Uint32Array(indices));
                    geometry.index.needsUpdate = true;
                }
                
                geometry.computeBoundingSphere();
                geometry.computeBoundingBox();
            } else {
                // No geometry to show, make mesh invisible
                this.mesh.visible = false;
                this.isDirty = false;
                return;
            }
        } else if (positions.length > 0) {
            // Create new geometry if none exists or if switching from greedy mode
            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setIndex(indices);
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
