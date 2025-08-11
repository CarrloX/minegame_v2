import * as THREE from 'three';
import { Chunk } from './Chunk';
import { BlockType } from './BlockType';
import { DebugManager } from '../debug/DebugManager';
import { ChunkQueue } from './ChunkQueue';
import { WorkerManager } from '../workers/WorkerManager';

/**
 * Represents the game world containing chunks of blocks
 */
export class World {
    // Store chunks in a map for quick lookup by chunk coordinates
    private chunks: Map<string, Chunk> = new Map();
    
    // Store chunk meshes for rendering
    private chunkMeshes: Map<string, THREE.Mesh> = new Map();
    
    // World generation parameters
    private readonly GROUND_LEVEL = 4; // Y-level of the ground surface
    public viewDistance = 8; // in chunks
    public detailedViewDistance = 1; // in chunks - Greedy Meshing starts after this distance
    
    // Reference to the Three.js scene
    private scene: THREE.Scene | null = null;
    private debugManager: DebugManager | null = null;
    
    // Texture loader for loading block textures
    private textureLoader: THREE.TextureLoader;
    private textureAtlas: THREE.Texture | null = null;
    private sharedMaterial: THREE.MeshBasicMaterial | null = null;
    private debugMaterial: THREE.MeshBasicMaterial | null = null;
    
    // Chunk generation queue for async processing
    private chunkQueue: ChunkQueue;
    
    // Worker manager for async mesh generation
    private workerManager: WorkerManager;
    
    // Material settings
    private readonly materialSettings = {
        map: null as THREE.Texture | null,
        side: THREE.DoubleSide,  // Renderizar ambos lados de las caras
        color: 0xFFFFFF,
        fog: false,
        toneMapped: false,
        transparent: true,
        alphaTest: 0.1,
        wireframe: false
    };
    
    /**
     * Creates a new World instance
     */
    constructor() {
        // Initialize texture loader
        this.textureLoader = new THREE.TextureLoader();
        
        // Initialize chunk queue
        this.chunkQueue = new ChunkQueue(this);
        
        // Initialize worker manager
        this.workerManager = WorkerManager.getInstance();
        
        // Load the texture atlas
        this.loadTextureAtlas();
    }
    
    /**
     * Loads the texture atlas
     */
    /**
     * Loads the texture atlas and initializes shared materials
     */
    private loadTextureAtlas(): void {
        // Load texture atlas
        this.textureAtlas = this.textureLoader.load('/assets/textures/atlas.png');
        this.textureAtlas.magFilter = THREE.NearestFilter;
        this.textureAtlas.minFilter = THREE.NearestFilter;
        this.textureAtlas.generateMipmaps = false;
        this.textureAtlas.anisotropy = 1;
        this.textureAtlas.wrapS = THREE.ClampToEdgeWrapping;
        this.textureAtlas.wrapT = THREE.ClampToEdgeWrapping;
        this.textureAtlas.premultiplyAlpha = false;

        // Create shared material with the loaded texture
        this.materialSettings.map = this.textureAtlas;
        this.sharedMaterial = new THREE.MeshBasicMaterial(this.materialSettings);
        
        // Create debug material (wireframe)
        this.debugMaterial = this.sharedMaterial.clone();
        this.debugMaterial.wireframe = true;
        this.debugMaterial.wireframeLinewidth = 1;
    }
    
    /**
     * Initializes the world and loads initial chunks
     */
    public initialize(startPosition: THREE.Vector3): void {
        const playerChunkX = Math.floor(startPosition.x / Chunk.SIZE);
        const playerChunkZ = Math.floor(startPosition.z / Chunk.SIZE);

        for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
            for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
                const chunkX = playerChunkX + x;
                const chunkZ = playerChunkZ + z;

                const chunk = this.generateChunk(chunkX, 0, chunkZ);
                const distance = Math.sqrt(x*x + z*z);
                const mode = distance <= this.detailedViewDistance ? 'detailed' : 'greedy';
                this.addChunkToScene(chunk, mode);
            }
        }
    }

    /**
     * Sets the Three.js scene and debug manager for this world
     */
    public setScene(scene: THREE.Scene, debugManager: DebugManager): void {
        this.debugManager = debugManager;
        this.removeAllMeshes();
        this.scene = scene;
        this.addAllChunksToScene();
    }

    private addAllChunksToScene(): void {
        if (!this.scene) return;
        for (const chunk of this.chunks.values()) {
            const mesh = this.chunkMeshes.get(this.getChunkKey(chunk.x, chunk.y, chunk.z));
            const mode = mesh?.userData.mode || 'detailed';
            this.addChunkToScene(chunk, mode);
        }
    }

    /**
     * Removes and disposes of all chunk meshes from the scene
     */
    private removeAllMeshes(): void {
        if (!this.scene) return;
        
        // Create a copy of the keys to avoid modification during iteration
        const chunkKeys = Array.from(this.chunkMeshes.keys());
        
        for (const key of chunkKeys) {
            const [x, y, z] = key.split(',').map(Number);
            this.removeChunkFromScene(x, y, z);
        }
        
        this.chunkMeshes.clear();
    }
    
    /**
     * Generates a chunk at the specified chunk coordinates
     */
    public generateChunk(chunkX: number, chunkY: number, chunkZ: number): Chunk {
        const chunkKey = this.getChunkKey(chunkX, chunkY, chunkZ);
        if (this.chunks.has(chunkKey)) {
            return this.chunks.get(chunkKey)!;
        }
        
        const chunk = new Chunk(chunkX, chunkY, chunkZ);
        this.chunks.set(chunkKey, chunk);
        this.generateChunkTerrain(chunk);
        return chunk;
    }
    
    /**
     * Generates terrain for a chunk
     */
    private generateChunkTerrain(chunk: Chunk): void {
        const localGroundLevel = this.GROUND_LEVEL - (chunk.y * Chunk.HEIGHT);
        if (chunk.y <= 0) {
            chunk.fill(0, 0, 0, Chunk.SIZE - 1, Math.min(Chunk.HEIGHT - 1, localGroundLevel - 2), Chunk.SIZE - 1, BlockType.STONE);
            if (localGroundLevel -1 >= 0 && localGroundLevel -1 < Chunk.HEIGHT) {
                chunk.fill(0, localGroundLevel -1, 0, Chunk.SIZE - 1, localGroundLevel -1, Chunk.SIZE - 1, BlockType.DIRT);
            }
            if (localGroundLevel >= 0 && localGroundLevel < Chunk.HEIGHT) {
                chunk.fill(0, localGroundLevel, 0, Chunk.SIZE - 1, localGroundLevel, Chunk.SIZE - 1, BlockType.GRASS);
            }
        }
    }
    
    public getChunk(chunkX: number, chunkY: number, chunkZ: number): Chunk | undefined {
        return this.chunks.get(this.getChunkKey(chunkX, chunkY, chunkZ));
    }
    
    public getOrGenerateChunk(chunkX: number, chunkY: number, chunkZ: number): Chunk {
        return this.getChunk(chunkX, chunkY, chunkZ) || this.generateChunk(chunkX, chunkY, chunkZ);
    }
    
    /**
     * Gets the highest non-air block at the given world coordinates (x,z)
     * @param x World X coordinate
     * @param z World Z coordinate
     * @returns The Y coordinate of the highest non-air block + 1, or 0 if no blocks found
     */
    public getHighestBlockY(x: number, z: number): number {
        // Get all chunk Y coordinates that exist in the world
        const chunkYCoords = new Set<number>();
        for (const key of this.chunks.keys()) {
            const [chunkX, chunkY, chunkZ] = key.split(',').map(Number);
            if (Math.floor(x / Chunk.SIZE) === chunkX && Math.floor(z / Chunk.SIZE) === chunkZ) {
                chunkYCoords.add(chunkY);
            }
        }

        // If no chunks found at this (x,z), return 0
        if (chunkYCoords.size === 0) {
            return 0;
        }

        // Sort chunk Y coordinates in descending order
        const sortedChunkYs = Array.from(chunkYCoords).sort((a, b) => b - a);

        // Check chunks from top to bottom
        for (const chunkY of sortedChunkYs) {
            const startY = (chunkY === sortedChunkYs[0]) ? Chunk.HEIGHT - 1 : Chunk.HEIGHT - 1;
            const endY = 0;
            const step = -1;
            
            for (let y = startY; y >= endY; y += step) {
                const worldY = chunkY * Chunk.HEIGHT + y;
                if (this.getBlock(x, worldY, z) !== BlockType.AIR) {
                    return worldY + 1; // +1 because we want the block above
                }
            }
        }

        return 0; // No solid blocks found
    }

    /**
     * Gets the block at the specified world coordinates
     * This is used by the worker to query neighboring chunks
     */
    public getBlock(x: number, y: number, z: number): BlockType | undefined {
        const chunkX = Math.floor(x / Chunk.SIZE);
        const chunkY = Math.floor(y / Chunk.HEIGHT);
        const chunkZ = Math.floor(z / Chunk.SIZE);
        
        const localX = x - (chunkX * Chunk.SIZE);
        const localY = y - (chunkY * Chunk.HEIGHT);
        const localZ = z - (chunkZ * Chunk.SIZE);
        
        const chunk = this.getChunk(chunkX, chunkY, chunkZ);
        return chunk ? chunk.getBlock(localX, localY, localZ) : BlockType.AIR;
    }
    
    public setBlock(x: number, y: number, z: number, blockType: BlockType): void {
        const chunkX = Math.floor(x / Chunk.SIZE);
        const chunkY = Math.floor(y / Chunk.HEIGHT);
        const chunkZ = Math.floor(z / Chunk.SIZE);
        
        const localX = x - (chunkX * Chunk.SIZE);
        const localY = y - (chunkY * Chunk.HEIGHT);
        const localZ = z - (chunkZ * Chunk.SIZE);
        
        const chunk = this.getOrGenerateChunk(chunkX, chunkY, chunkZ);
        chunk.setBlock(localX, localY, localZ, blockType);
        this.markChunkDirty(chunkX, chunkY, chunkZ);

        const adjacentChunks = this.getAdjacentChunks(chunkX, chunkY, chunkZ, localX, localY, localZ);
        adjacentChunks.forEach(adjChunk => this.markChunkDirty(adjChunk.x, adjChunk.y, adjChunk.z));
    }

    private getAdjacentChunks(chunkX: number, chunkY: number, chunkZ: number, localX: number, localY: number, localZ: number): Chunk[] {
        const adjacentChunks: Chunk[] = [];
        if (localX === 0) adjacentChunks.push(this.getOrGenerateChunk(chunkX - 1, chunkY, chunkZ));
        if (localX === Chunk.SIZE - 1) adjacentChunks.push(this.getOrGenerateChunk(chunkX + 1, chunkY, chunkZ));
        if (localY === 0) adjacentChunks.push(this.getOrGenerateChunk(chunkX, chunkY - 1, chunkZ));
        if (localY === Chunk.HEIGHT - 1) adjacentChunks.push(this.getOrGenerateChunk(chunkX, chunkY + 1, chunkZ));
        if (localZ === 0) adjacentChunks.push(this.getOrGenerateChunk(chunkX, chunkY, chunkZ - 1));
        if (localZ === Chunk.SIZE - 1) adjacentChunks.push(this.getOrGenerateChunk(chunkX, chunkY, chunkZ + 1));
        return adjacentChunks;
    }
    
    private getChunkKey(x: number, y: number, z: number): string {
        return `${x},${y},${z}`;
    }
    
    public getChunkMeshes(): Map<string, THREE.Mesh> {
        return this.chunkMeshes;
    }

    public getAllChunks(): Chunk[] {
        return Array.from(this.chunks.values());
    }
    
    /**
     * Adds a chunk's mesh to the scene with the specified level of detail
     * @param chunk The chunk to add to the scene
     * @param mode The level of detail to use for this chunk
     */
    private addChunkToScene(chunk: Chunk, mode: 'detailed' | 'greedy'): void {
        if (!this.scene || !this.sharedMaterial) return;
        const chunkKey = this.getChunkKey(chunk.x, chunk.y, chunk.z);
        
        // Verificar si el chunk ya tiene un mesh con un modo diferente
        const existingMesh = this.chunkMeshes.get(chunkKey);
        const needsUpdate = !existingMesh || existingMesh.userData?.mode !== mode;
        
        // Solo actualizar si es necesario
        if (needsUpdate) {
            this.removeChunkFromScene(chunk.x, chunk.y, chunk.z); // Remove old mesh if it exists
            
            try {
                console.log(`Generating ${mode} mesh for chunk [${chunk.x},${chunk.y},${chunk.z}]`);
                // Forzar la actualización del mesh con el nuevo modo
                chunk.markDirty();
                const mesh = chunk.getMesh(mode, this);
                
                if (mesh) {
                    // Store the LOD mode in the mesh for later reference
                    mesh.userData = mesh.userData || {};
                    mesh.userData.mode = mode;
                    mesh.userData.chunkX = chunk.x;
                    mesh.userData.chunkY = chunk.y;
                    mesh.userData.chunkZ = chunk.z;
                    
                    // Apply the shared material
                    const material = this.getMaterial();
                    if (material) {
                        mesh.material = material;
                        this.chunkMeshes.set(chunkKey, mesh);
                        this.scene.add(mesh);
                        
                        // Apply debug visualization if debug manager is available
                        if (this.debugManager) {
                            this.debugManager.applyWireframeToMesh(chunkKey, mesh);
                        }
                    } else {
                        console.warn(`Failed to get material for chunk ${chunkKey}`);
                        return;
                    }
                }
            } catch (error) {
                console.error(`Error generating mesh for chunk ${chunkKey}:`, error);
            }
        }
    }
    
    /**
     * Removes a chunk's mesh from the scene and disposes of its resources
     * @param chunkX Chunk X coordinate
     * @param chunkY Chunk Y coordinate
     * @param chunkZ Chunk Z coordinate
     */
    private removeChunkFromScene(chunkX: number, chunkY: number, chunkZ: number): void {
        if (!this.scene) return;
        const chunkKey = this.getChunkKey(chunkX, chunkY, chunkZ);
        const mesh = this.chunkMeshes.get(chunkKey);
        if (mesh) {
            // Remove from scene and map
            this.scene.remove(mesh);
            this.chunkMeshes.delete(chunkKey);
            
            // Dispose of geometry and materials
            if (mesh.geometry) {
                mesh.geometry.dispose();
            }
            
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(material => material.dispose());
            } else if (mesh.material) {
                mesh.material.dispose();
            }
        }
    }
    
    public update(playerPosition: THREE.Vector3): void {
        this.loadChunksAroundPlayer(playerPosition);
        this.updateDirtyChunks();
    }

    /**
     * Unloads a chunk, disposing of all its resources
     * @param chunkX Chunk X coordinate
     * @param chunkY Chunk Y coordinate
     * @param chunkZ Chunk Z coordinate
     */
    private unloadChunk(chunkX: number, chunkY: number, chunkZ: number): void {
        const chunkKey = this.getChunkKey(chunkX, chunkY, chunkZ);
        const chunk = this.chunks.get(chunkKey);
        if (!chunk) return;

        // Remove from scene and clean up mesh resources
        this.removeChunkFromScene(chunkX, chunkY, chunkZ);
        
        // Clean up chunk resources
        chunk.dispose();
        
        // Remove from chunks map
        this.chunks.delete(chunkKey);
    }



    /**
     * Loads and unloads chunks around the player based on view distance
     */
    private loadChunksAroundPlayer(playerPosition: THREE.Vector3): void {
        const playerChunkX = Math.floor(playerPosition.x / Chunk.SIZE);
        const playerChunkZ = Math.floor(playerPosition.z / Chunk.SIZE);
        const requiredChunks = new Set<string>();

        // First pass: Update or queue chunks that need to be loaded/updated
        for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
            for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
                const chunkX = playerChunkX + x;
                const chunkZ = playerChunkZ + z;
                const chunkKey = this.getChunkKey(chunkX, 0, chunkZ);
                requiredChunks.add(chunkKey);

                // Calculate distance from player for priority
                const dx = Math.abs(x);
                const dz = Math.abs(z);
                const distance = Math.sqrt(dx * dx + dz * dz);
                const priority = Math.floor(distance * 10); // Higher priority for closer chunks
                
                // Determine LOD based on distance from player
                const mode = distance <= this.detailedViewDistance ? 'detailed' : 'greedy';
                console.log(`Chunk [${chunkX},0,${chunkZ}], Distance: ${distance.toFixed(2)}, Mode: ${mode}`);

                const existingMesh = this.chunkMeshes.get(chunkKey);
                const chunk = this.chunks.get(chunkKey);
                
                if (!existingMesh) {
                    // Si no hay un mesh existente, encolar la tarea de generación
                    this.chunkQueue.addTask(chunkX, 0, chunkZ, mode, priority);
                    console.log(`Queued new ${mode} chunk [${chunkX},0,${chunkZ}]`);
                } else if (existingMesh.userData.mode !== mode) {
                    // Si el modo de LOD ha cambiado, forzar una actualización
                    console.log(`LOD change for chunk [${chunkX},0,${chunkZ}]: ${existingMesh.userData.mode} -> ${mode}`);
                    if (chunk) {
                        // Marcar el chunk como sucio para forzar la regeneración
                        chunk.markDirty();
                        // Asegurarse de que el chunk se actualice con el nuevo modo
                        this.chunkQueue.addTask(chunkX, 0, chunkZ, mode, priority - 0.5);
                    }
                } else if (chunk && chunk.isDirty) {
                    // Si el chunk está marcado como sucio, encolar una actualización
                    this.chunkQueue.addTask(chunkX, 0, chunkZ, mode, priority);
                    console.log(`Queued update for dirty chunk [${chunkX},0,${chunkZ}]`);
                }
            }
        }

        for (const chunkKey of this.chunks.keys()) {
            if (!requiredChunks.has(chunkKey)) {
                const [x, y, z] = chunkKey.split(',').map(Number);
                this.unloadChunk(x, y, z);
            }
        }
    }
    
    private updateDirtyChunks(): void {
        for (const chunk of this.chunks.values()) {
            if (chunk.isDirty) {
                const chunkKey = this.getChunkKey(chunk.x, chunk.y, chunk.z);
                const mesh = this.chunkMeshes.get(chunkKey);
                const mode = mesh?.userData.mode || 'detailed';
                
                console.log(`Updating dirty chunk [${chunk.x},${chunk.y},${chunk.z}] in ${mode} mode`);
                this.addChunkToScene(chunk, mode);
                chunk.isDirty = false;
            }
        }
    }
    
    public markChunkDirty(chunkX: number, chunkY: number, chunkZ: number): void {
        const chunk = this.chunks.get(this.getChunkKey(chunkX, chunkY, chunkZ));
        if (chunk) {
            chunk.markDirty();
        }
    }
    
    /**
     * Gets the shared material for chunk meshes
     */
    public getMaterial(): THREE.Material | null {
        return this.sharedMaterial;
    }

    /**
     * Gets the worker manager instance
     */
    public getWorkerManager(): WorkerManager {
        return this.workerManager;
    }

    public dispose(): void {
        // Clean up all chunk meshes
        this.chunkMeshes.forEach(mesh => {
            mesh.geometry.dispose();
            // Don't dispose of shared material here
        });
        this.chunkMeshes.clear();
        
        // Clean up texture atlas
        if (this.textureAtlas) {
            this.textureAtlas.dispose();
            this.textureAtlas = null;
        }
        
        // Clean up materials
        if (this.sharedMaterial) {
            this.sharedMaterial.dispose();
            this.sharedMaterial = null;
        }
        
        if (this.debugMaterial) {
            this.debugMaterial.dispose();
            this.debugMaterial = null;
        }
        
        // Clean up worker manager
        this.workerManager.dispose();
        
        // Clear chunks
        this.chunks.clear();
    }
}