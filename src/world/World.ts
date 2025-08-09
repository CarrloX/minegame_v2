import * as THREE from 'three';
import { Chunk } from './Chunk';
import { BlockType } from './BlockType';
import { DebugManager } from '../debug/DebugManager';

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
    public detailedViewDistance = 2; // in chunks
    
    // Reference to the Three.js scene
    private scene: THREE.Scene | null = null;
    private debugManager: DebugManager | null = null;
    
    // Texture loader and atlas
    private textureLoader: THREE.TextureLoader;
    private textureAtlas: THREE.Texture | null = null;
    
    /**
     * Creates a new World instance
     */
    constructor() {
        // Initialize texture loader
        this.textureLoader = new THREE.TextureLoader();
        
        // Load the texture atlas
        this.loadTextureAtlas();
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

    private removeAllMeshes(): void {
        if (!this.scene) return;
        for (const mesh of this.chunkMeshes.values()) {
            this.scene.remove(mesh);
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
    
    public getHighestBlockY(x: number, z: number): number {
        for (let y = Chunk.HEIGHT - 1; y >= 0; y--) {
            if (this.getBlock(x, y, z) !== BlockType.AIR) {
                return y + 1;
            }
        }
        return 0;
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
    
    private addChunkToScene(chunk: Chunk, mode: 'detailed' | 'greedy'): void {
        if (!this.scene) return;
        const chunkKey = this.getChunkKey(chunk.x, chunk.y, chunk.z);
        
        this.removeChunkFromScene(chunk.x, chunk.y, chunk.z); // Remove old mesh if it exists

        const mesh = chunk.getMesh(mode, this);
        if (mesh) {
            mesh.userData.mode = mode;
            this.chunkMeshes.set(chunkKey, mesh);
            this.scene.add(mesh);
            if (this.debugManager) {
                this.debugManager.applyWireframeToMesh(chunkKey, mesh);
            }
        }
    }
    
    private removeChunkFromScene(chunkX: number, chunkY: number, chunkZ: number): void {
        if (!this.scene) return;
        const chunkKey = this.getChunkKey(chunkX, chunkY, chunkZ);
        const mesh = this.chunkMeshes.get(chunkKey);
        if (mesh) {
            this.scene.remove(mesh);
            this.chunkMeshes.delete(chunkKey);
        }
    }
    
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

        for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
            for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
                const chunkX = playerChunkX + x;
                const chunkZ = playerChunkZ + z;
                const chunkKey = this.getChunkKey(chunkX, 0, chunkZ);
                requiredChunks.add(chunkKey);

                const distance = Math.sqrt(x*x + z*z);
                const mode = distance <= this.detailedViewDistance ? 'detailed' : 'greedy';

                const existingMesh = this.chunkMeshes.get(chunkKey);
                if (!existingMesh) {
                    const chunk = this.generateChunk(chunkX, 0, chunkZ);
                    this.addChunkToScene(chunk, mode);
                } else if (existingMesh.userData.mode !== mode) {
                    const chunk = this.chunks.get(chunkKey)!;
                    this.addChunkToScene(chunk, mode);
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
                const mesh = this.chunkMeshes.get(this.getChunkKey(chunk.x, chunk.y, chunk.z));
                const mode = mesh?.userData.mode || 'detailed';
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
    
    public dispose(): void {
        this.removeAllMeshes();
        this.chunks.clear();
        this.scene = null;
    }
}