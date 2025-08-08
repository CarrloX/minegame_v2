import * as THREE from 'three';
import { Chunk } from './Chunk';
import { BlockType } from './BlockType';

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
    public viewDistance = 4; // in chunks
    
    // Reference to the Three.js scene
    private scene: THREE.Scene | null = null;
    
    // Texture loader and atlas
    private textureLoader: THREE.TextureLoader;
    private textureAtlas: THREE.Texture | null = null;
    
    /**
     * Creates a new World instance
     * @param scene The Three.js scene to add chunk meshes to
     */
    constructor(scene?: THREE.Scene) {
        // Initialize texture loader
        this.textureLoader = new THREE.TextureLoader();
        
        // Load the texture atlas
        this.loadTextureAtlas();
        
        if (scene) {
            this.setScene(scene);
        }
    }
    
    /**
     * Loads the texture atlas
     */
    private loadTextureAtlas(): void {
        this.textureAtlas = this.textureLoader.load('/assets/textures/atlas.png');
        this.textureAtlas.magFilter = THREE.NearestFilter;
        this.textureAtlas.minFilter = THREE.NearestFilter;
    }
    
    /**
     * Sets the Three.js scene for this world
     * @param scene The Three.js scene to add chunk meshes to
     */
    public initialize(startPosition: THREE.Vector3): void {
        this.loadChunksAroundPlayer(startPosition);
    }

    public setScene(scene: THREE.Scene): void {
        // Remove all existing meshes from the old scene
        this.removeAllMeshes();
        
        // Set the new scene
        this.scene = scene;
        
        // Add all existing chunks to the new scene
        this.addAllChunksToScene();
    }
    
    /**
     * Generates a chunk at the specified chunk coordinates
     */
    public generateChunk(chunkX: number, chunkY: number, chunkZ: number): Chunk {
        const chunkKey = this.getChunkKey(chunkX, chunkY, chunkZ);
        
        // Return existing chunk if it already exists
        if (this.chunks.has(chunkKey)) {
            return this.chunks.get(chunkKey)!;
        }
        
        // Create a new chunk
        const chunk = new Chunk(chunkX, chunkY, chunkZ);
        this.chunks.set(chunkKey, chunk);
        
        // Generate chunk terrain
        this.generateChunkTerrain(chunk);
        
        // Create and add mesh for this chunk if we have a scene
        if (this.scene) {
            this.addChunkToScene(chunk);
        }
        
        return chunk;
    }
    
    /**
     * Generates terrain for a chunk
     */
    private generateChunkTerrain(chunk: Chunk): void {
        // Simple terrain generation: flat world with a layer of grass on top of dirt
        const localGroundLevel = this.GROUND_LEVEL - (chunk.y * Chunk.HEIGHT);
        
        // Only generate blocks if this chunk is at or below the ground level
        if (chunk.y <= 0) {
            // Fill the bottom of the world with stone
            chunk.fill(
                0, 0, 0,  // min x, y, z
                Chunk.SIZE - 1, Math.min(Chunk.HEIGHT - 1, localGroundLevel - 1), Chunk.SIZE - 1,  // max x, y, z
                BlockType.STONE
            );
            
            // Add a layer of dirt on top of the stone
            if (localGroundLevel >= 0 && localGroundLevel < Chunk.HEIGHT) {
                chunk.fill(
                    0, localGroundLevel, 0,  // min x, y, z
                    Chunk.SIZE - 1, localGroundLevel, Chunk.SIZE - 1,  // max x, y, z
                    BlockType.DIRT
                );
                
                // Add grass on the very top layer
                if (chunk.y === 0) {  // Only add grass to the top chunk
                    chunk.fill(
                        0, localGroundLevel, 0,  // min x, y, z
                        Chunk.SIZE - 1, localGroundLevel, Chunk.SIZE - 1,  // max x, y, z
                        BlockType.GRASS
                    );
                }
            }
        }
    }
    
    /**
     * Gets a chunk by its chunk coordinates
     */
    public getChunk(chunkX: number, chunkY: number, chunkZ: number): Chunk | undefined {
        const chunkKey = this.getChunkKey(chunkX, chunkY, chunkZ);
        return this.chunks.get(chunkKey);
    }
    
    /**
     * Gets or generates a chunk by its chunk coordinates
     */
    public getOrGenerateChunk(chunkX: number, chunkY: number, chunkZ: number): Chunk {
        return this.getChunk(chunkX, chunkY, chunkZ) || this.generateChunk(chunkX, chunkY, chunkZ);
    }
    
    /**
     * Gets the block at the specified world coordinates
     */
    public getHighestBlockY(x: number, z: number): number {
        for (let y = Chunk.HEIGHT - 1; y >= 0; y--) {
            if (this.getBlock(x, y, z) !== BlockType.AIR) {
                return y + 1;
            }
        }
        return 0; // Default to 0 if no block is found
    }

    public getBlock(x: number, y: number, z: number): BlockType {
        const chunkX = Math.floor(x / Chunk.SIZE);
        const chunkY = Math.floor(y / Chunk.HEIGHT);
        const chunkZ = Math.floor(z / Chunk.SIZE);
        
        const localX = x - (chunkX * Chunk.SIZE);
        const localY = y - (chunkY * Chunk.HEIGHT);
        const localZ = z - (chunkZ * Chunk.SIZE);
        
        const chunk = this.getChunk(chunkX, chunkY, chunkZ);
        return chunk ? chunk.getBlock(localX, localY, localZ) : BlockType.AIR;
    }
    
    /**
     * Sets the block at the specified world coordinates
     */
    public setBlock(x: number, y: number, z: number, blockType: BlockType): void {
        const chunkX = Math.floor(x / Chunk.SIZE);
        const chunkY = Math.floor(y / Chunk.HEIGHT);
        const chunkZ = Math.floor(z / Chunk.SIZE);
        
        const localX = x - (chunkX * Chunk.SIZE);
        const localY = y - (chunkY * Chunk.HEIGHT);
        const localZ = z - (chunkZ * Chunk.SIZE);
        
        // Get or generate the chunk if it doesn't exist
        const chunk = this.getOrGenerateChunk(chunkX, chunkY, chunkZ);
        chunk.setBlock(localX, localY, localZ, blockType);
    }
    
    /**
     * Gets a unique string key for a chunk based on its coordinates
     */
    private getChunkKey(x: number, y: number, z: number): string {
        return `${x},${y},${z}`;
    }
    
    /**
     * Gets all loaded chunks
     */
    public getChunkMeshes(): Map<string, THREE.Mesh> {
        return this.chunkMeshes;
    }

    public getAllChunks(): Chunk[] {
        return Array.from(this.chunks.values());
    }
    
    /**
     * Adds a chunk's mesh to the scene
     * @param chunk The chunk to add to the scene
     */
    private addChunkToScene(chunk: Chunk): void {
        if (!this.scene) return;
        
        const chunkKey = this.getChunkKey(chunk.x, chunk.y, chunk.z);
        
        // Remove existing mesh if it exists
        this.removeChunkFromScene(chunk.x, chunk.y, chunk.z);
        
        // Get or create the chunk's mesh
        const mesh = chunk.getMesh();
        
        if (mesh) {
            this.chunkMeshes.set(chunkKey, mesh);
            this.scene.add(mesh);
        }
    }
    
    /**
     * Removes a chunk's mesh from the scene
     */
    private removeChunkFromScene(chunkX: number, chunkY: number, chunkZ: number): void {
        if (!this.scene) return;
        
        const chunkKey = this.getChunkKey(chunkX, chunkY, chunkZ);
        const mesh = this.chunkMeshes.get(chunkKey);
        
        if (mesh) {
            this.scene.remove(mesh);
            this.chunkMeshes.delete(chunkKey);
        }
    }
    
    /**
     * Adds all chunks to the scene
     */
    private addAllChunksToScene(): void {
        if (!this.scene) return;
        
        for (const chunk of this.chunks.values()) {
            this.addChunkToScene(chunk);
        }
    }
    
    /**
     * Removes all chunk meshes from the scene
     */
    private removeAllMeshes(): void {
        if (!this.scene) return;
        
        for (const mesh of this.chunkMeshes.values()) {
            this.scene.remove(mesh);
        }
        
        this.chunkMeshes.clear();
    }
    
    /**
     * Updates the world (call this every frame)
     * @param deltaTime Time since last update in seconds
     */
    public update(playerPosition: THREE.Vector3): void {
        this.loadChunksAroundPlayer(playerPosition);
        this.updateDirtyChunks();
    }

    private unloadChunk(chunkX: number, chunkY: number, chunkZ: number): void {
        const chunkKey = this.getChunkKey(chunkX, chunkY, chunkZ);
        const chunk = this.chunks.get(chunkKey);
        if (chunk) {
            this.removeChunkFromScene(chunkX, chunkY, chunkZ);
            chunk.dispose();
            this.chunks.delete(chunkKey);
        }
    }

    private loadChunksAroundPlayer(playerPosition: THREE.Vector3): void {
        const playerChunkX = Math.floor(playerPosition.x / Chunk.SIZE);
        const playerChunkZ = Math.floor(playerPosition.z / Chunk.SIZE);
        const requiredChunks = new Set<string>();

        // Determine which chunks should be loaded
        for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
            for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
                const chunkX = playerChunkX + x;
                const chunkZ = playerChunkZ + z;
                // For now, we only consider y=0 for chunks
                const chunkKey = this.getChunkKey(chunkX, 0, chunkZ);
                requiredChunks.add(chunkKey);

                // Load new chunks if they don't exist
                if (!this.chunks.has(chunkKey)) {
                    this.generateChunk(chunkX, 0, chunkZ);
                }
            }
        }

        // Unload chunks that are no longer needed
        for (const chunkKey of this.chunks.keys()) {
            if (!requiredChunks.has(chunkKey)) {
                const [x, y, z] = chunkKey.split(',').map(Number);
                this.unloadChunk(x, y, z);
            }
        }
    }
    
    /**
     * Updates any chunks that have been marked as dirty
     */
    private updateDirtyChunks(): void {
        for (const chunk of this.chunks.values()) {
            const mesh = chunk.getMesh();
            const chunkKey = this.getChunkKey(chunk.x, chunk.y, chunk.z);
            
            // If the chunk has a new mesh, update it in the scene
            if (mesh && !this.chunkMeshes.has(chunkKey)) {
                this.addChunkToScene(chunk);
            }
        }
    }
    
    /**
     * Marks a chunk as dirty, forcing its mesh to be updated
     */
    public markChunkDirty(chunkX: number, chunkY: number, chunkZ: number): void {
        const chunkKey = this.getChunkKey(chunkX, chunkY, chunkZ);
        const chunk = this.chunks.get(chunkKey);
        
        if (chunk) {
            chunk.markDirty();
        }
    }
    
    /**
     * Disposes of all resources used by the world
     */
    public dispose(): void {
        // Remove all meshes from the scene
        this.removeAllMeshes();
        
        // Clear chunks
        this.chunks.clear();
        
        // Clear the scene reference
        this.scene = null;
    }
}