// World.ts (corregido)
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
    public detailedViewDistance = 6; // in chunks - Greedy Meshing starts after this distance
    
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
        side: THREE.DoubleSide,  // Render both sides so greedy/detailed mismatches are less visible
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
        
        // Load and initialize the texture atlas and materials
        this.loadTextureAtlas();
    }
    
    /**
     * Loads the texture atlas and initializes shared materials
     */
    private loadTextureAtlas(): void {
        try {
            console.log('Loading texture atlas...');
            
            // Load texture atlas
            this.textureAtlas = this.textureLoader.load(
                '/assets/textures/atlas.png',
                (texture) => {
                    console.log('Texture atlas loaded successfully');
                    texture.magFilter = THREE.NearestFilter;
                    texture.minFilter = THREE.NearestFilter;
                    texture.generateMipmaps = false;
                    texture.anisotropy = 1;
                    texture.wrapS = THREE.ClampToEdgeWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    texture.premultiplyAlpha = false;

                    // Create shared material with the loaded texture
                    this.materialSettings.map = texture;
                    this.sharedMaterial = new THREE.MeshBasicMaterial(this.materialSettings);
                    
                    // Create debug material (wireframe)
                    this.debugMaterial = this.sharedMaterial.clone();
                    this.debugMaterial.wireframe = true;
                    // wireframeLinewidth is not supported consistently; keep as informational
                    // this.debugMaterial.wireframeLinewidth = 1;
                    
                    console.log('Shared materials initialized');
                    
                    // Mark all chunks as dirty to regenerate with new material and force an update pass
                    this.markAllChunksDirty();
                    this.updateDirtyChunks();
                },
                undefined,
                (error) => {
                    console.error('Error loading texture atlas:', error);
                }
            );
        } catch (error) {
            console.error('Failed to load texture atlas:', error);
        }
    }
    
    /**
     * Marks all chunks as dirty to force regeneration with new materials
     */
    private markAllChunksDirty(): void {
        for (const chunk of this.chunks.values()) {
            chunk.markDirty();
        }
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
    public setScene(scene: THREE.Scene, debugManager: DebugManager, camera?: THREE.Camera): void {
        this.debugManager = debugManager;
        this.removeAllMeshes();
        this.scene = scene;

        // Store camera reference for frustum culling
        if (camera) {
            this.scene.userData.camera = camera;
        }

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
            const startY = Chunk.HEIGHT - 1;
            const endY = 0;
            for (let y = startY; y >= endY; y--) {
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
        const oldBlockType = chunk.getBlock(localX, localY, localZ);
        
        // If the block type hasn't changed, don't do anything
        if (oldBlockType === blockType) {
            return;
        }
        
        // Update the block
        chunk.setBlock(localX, localY, localZ, blockType);
        
        // Force the chunk to regenerate its mesh
        chunk.forceMeshRegeneration();
        
        // Mark the chunk as dirty
        this.markChunkDirty(chunkX, chunkY, chunkZ);
        
        // Mark adjacent chunks as dirty only if they're on chunk borders (optimization)
        // Only mark chunks that actually need updates to prevent excessive regeneration
        if (localX === 0 || localX === Chunk.SIZE - 1 ||
            localZ === 0 || localZ === Chunk.SIZE - 1) {
            const adjacentChunks: {x: number, y: number, z: number}[] = [];

            if (localX === 0) adjacentChunks.push({x: chunkX - 1, y: chunkY, z: chunkZ});
            if (localX === Chunk.SIZE - 1) adjacentChunks.push({x: chunkX + 1, y: chunkY, z: chunkZ});
            if (localZ === 0) adjacentChunks.push({x: chunkX, y: chunkY, z: chunkZ - 1});
            if (localZ === Chunk.SIZE - 1) adjacentChunks.push({x: chunkX, y: chunkY, z: chunkZ + 1});

            // Only mark as dirty, don't force immediate regeneration
            adjacentChunks.forEach(adjChunk => {
                this.markChunkDirty(adjChunk.x, adjChunk.y, adjChunk.z);
            });
        }

        // Don't force immediate update - let the normal update cycle handle it
        // This prevents massive CPU usage when destroying blocks
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
     * Adds a chunk's mesh to the scene with the specified level of detail.
     * Returns true if the mesh in the scene was updated/replaced, false if nothing changed.
     */
    private addChunkToScene(chunk: Chunk, mode: 'detailed' | 'greedy'): boolean {
        if (!this.scene || !this.sharedMaterial) return false;
        const chunkKey = this.getChunkKey(chunk.x, chunk.y, chunk.z);
        
        // Check if we need to update the LOD or regenerate due to dirty flag
        const existingMesh = this.chunkMeshes.get(chunkKey);
        const needsUpdate = chunk.isDirty || !existingMesh || existingMesh.userData?.mode !== mode;
        
        if (!needsUpdate) {
            // Nothing to do
            return false;
        }

        // If we already have a mesh, start a transition
        if (existingMesh) {
            chunk.startTransitionToLOD(mode);
        }
        
        // Remove old mesh from scene but keep it in chunk for transition handling
        if (existingMesh) {
            this.scene.remove(existingMesh);
        }
        
        try {
            // Get the mesh (this will handle the transition if needed) — pass world for neighbor queries
            const mesh = chunk.getMesh(mode, this);
            
            if (mesh) {
                // Store the LOD mode / chunk coords in the mesh for later reference
                mesh.userData = mesh.userData || {};
                mesh.userData.mode = mode;
                mesh.userData.chunkX = chunk.x;
                mesh.userData.chunkY = chunk.y;
                mesh.userData.chunkZ = chunk.z;
                
                // Apply the shared material (clone when necessary for transitions)
                const material = this.getMaterial();
                if (!material) {
                    console.warn(`Failed to get material for chunk ${chunkKey}`);
                    return false;
                }

                const clonedMaterial = this.cloneMaterialForTransition(material);
                mesh.material = clonedMaterial;

                // Ensure geometry attributes are flagged for update
                const geom = mesh.geometry as THREE.BufferGeometry;
                if (geom) {
                    // compute bounding box if needed
                    if (!geom.boundingBox) geom.computeBoundingBox();

                    if (geom.attributes.position) geom.attributes.position.needsUpdate = true;
                    if (geom.attributes.normal) geom.attributes.normal.needsUpdate = true;
                    if (geom.attributes.uv) geom.attributes.uv.needsUpdate = true;
                    if (geom.index) geom.index.needsUpdate = true;
                }

                // Add to scene and store reference
                this.chunkMeshes.set(chunkKey, mesh);
                this.scene.add(mesh);
                
                // If we have a transition mesh, add it to the scene too
                if ((chunk as any)['transitionMesh']) {
                    const transitionMesh = (chunk as any)['transitionMesh'] as THREE.Mesh;
                    const transitionMaterial = this.cloneMaterialForTransition(material);
                    transitionMesh.material = transitionMaterial;
                    this.scene.add(transitionMesh);
                    
                    // Set initial opacity for crossfade if supported
                    if ('opacity' in (transitionMaterial as any)) {
                        (transitionMaterial as any).opacity = 1.0;
                        (transitionMaterial as any).transparent = true;
                    }
                    
                    if ('opacity' in clonedMaterial) {
                        (clonedMaterial as any).opacity = 0.0;
                        (clonedMaterial as any).transparent = true;
                    }
                }

                // Apply debug visualization if debug manager is available
                if (this.debugManager) {
                    this.debugManager.applyWireframeToMesh(chunkKey, mesh);
                }

                return true; // updated
            } else {
                // Mesh generation returned null (empty chunk) -> ensure we remove any existing
                if (existingMesh) {
                    this.removeChunkFromScene(chunk.x, chunk.y, chunk.z);
                }
                return true;
            }
        } catch (error) {
            console.error(`Error generating mesh for chunk ${chunkKey}:`, error);
            return false;
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
            
            // Only dispose if this mesh is not part of an active transition
            const chunk = this.chunks.get(chunkKey);
            const isInTransition = chunk && chunk.currentLOD === 'transitioning';
            
            if (!isInTransition) {
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
    }
    
    // Creates a clone of a material for use in transitions
    private cloneMaterialForTransition(baseMaterial: THREE.Material): THREE.Material | THREE.Material[] {
        if (Array.isArray(baseMaterial)) {
            return baseMaterial.map(m => this.cloneMaterialForTransition(m) as THREE.Material);
        }
        
        // Create a clone of the material
        const material = baseMaterial.clone();
        
        // Ensure the material can handle transparency
        if ('opacity' in material) {
            material.opacity = 1;
            material.transparent = true;
        }
        
        return material;
    }
    
    // Updates all active LOD transitions
    private updateLODTransitions(): void {
        let needsUpdate = false;

        // Update all chunks that are in transition
        for (const chunk of this.chunks.values()) {
            if (chunk.currentLOD === 'transitioning') {
                const wasUpdated = chunk['updateTransition'] ? chunk['updateTransition']() : false;
                needsUpdate = needsUpdate || wasUpdated;

                // If transition is complete, clean up
                if (chunk.currentLOD !== 'transitioning' && chunk['transitionMesh']) {
                    this.scene?.remove(chunk['transitionMesh']);
                    chunk['transitionMesh'] = null;
                }
            }
        }

        // If any transitions were updated, request another frame
        if (needsUpdate) {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => this.updateLODTransitions());
            }
        }
    }

    /**
     * Updates frustum culling by hiding chunks that are outside the camera's view
     * This is more aggressive than Three.js automatic frustum culling
     */
    private updateFrustumCulling(playerPosition: THREE.Vector3): void {
        if (!this.scene) return;

        // Create a frustum from the camera
        const camera = this.scene.userData.camera as THREE.Camera;
        if (!camera) return;

        const frustum = new THREE.Frustum();
        const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(matrix);

        // Get player chunk coordinates
        const playerChunkX = Math.floor(playerPosition.x / Chunk.SIZE);
        const playerChunkZ = Math.floor(playerPosition.z / Chunk.SIZE);

        // Update visibility for all chunk meshes
        for (const [chunkKey, mesh] of this.chunkMeshes.entries()) {
            const [x, y, z] = chunkKey.split(',').map(Number);

            // Calculate chunk center position
            const chunkCenter = new THREE.Vector3(
                (x + 0.5) * Chunk.SIZE,
                (y + 0.5) * Chunk.HEIGHT,
                (z + 0.5) * Chunk.SIZE
            );

            // Create a bounding sphere for the chunk (approximation)
            const chunkRadius = Math.sqrt(Chunk.SIZE * Chunk.SIZE + Chunk.HEIGHT * Chunk.HEIGHT + Chunk.SIZE * Chunk.SIZE) * 0.5;
            const boundingSphere = new THREE.Sphere(chunkCenter, chunkRadius);

            // Check if chunk is in frustum
            const isInFrustum = frustum.intersectsSphere(boundingSphere);

            // Additional check: hide chunks that are too far or behind the player
            const distanceToPlayer = Math.sqrt(
                Math.pow(x - playerChunkX, 2) + Math.pow(z - playerChunkZ, 2)
            );

            // Hide chunks that are outside frustum or too far
            const shouldBeVisible = isInFrustum && distanceToPlayer <= this.viewDistance;

            // Only update visibility if it changed
            if (mesh.visible !== shouldBeVisible) {
                mesh.visible = shouldBeVisible;
            }
        }
    }
    
    public update(playerPosition: THREE.Vector3): void {
        this.loadChunksAroundPlayer(playerPosition);
        this.updateFrustumCulling(playerPosition);
        this.updateDirtyChunks();
        this.updateLODTransitions();
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

                const existingMesh = this.chunkMeshes.get(chunkKey);
                const chunk = this.chunks.get(chunkKey);
                
                if (!existingMesh) {
                    // If no mesh exists, queue the generation task
                    this.chunkQueue.addTask(chunkX, 0, chunkZ, mode, priority);
                } else if (existingMesh.userData.mode !== mode) {
                    // If the LOD mode changed, force update
                    if (chunk) {
                        chunk.markDirty();
                        this.chunkQueue.addTask(chunkX, 0, chunkZ, mode, priority - 0.5);
                    }
                } else if (chunk && chunk.isDirty) {
                    // If chunk is dirty, enqueue an update
                    this.chunkQueue.addTask(chunkX, 0, chunkZ, mode, priority);
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
    
    public updateDirtyChunks(): void {
        // Limit to 1 chunk per frame to prevent performance drops during heavy destruction
        const MAX_CHUNKS_PER_FRAME = 1;
        let processedChunks = 0;

        // First pass: collect all dirty chunks and prioritize by distance to player
        const dirtyChunks: {chunk: Chunk, mode: 'detailed' | 'greedy', priority: number}[] = [];

        for (const chunk of this.chunks.values()) {
            if (chunk.isDirty) {
                const chunkKey = this.getChunkKey(chunk.x, chunk.y, chunk.z);
                const mesh = this.chunkMeshes.get(chunkKey);
                const mode = mesh?.userData.mode || 'detailed';

                // Calculate priority based on distance from player (closer = higher priority)
                // This ensures visible chunks get updated first
                const distance = Math.abs(chunk.x) + Math.abs(chunk.z); // Manhattan distance for simplicity
                const priority = -distance; // Negative so closer chunks sort first

                dirtyChunks.push({chunk, mode, priority});
            }
        }

        // Sort by priority (closer chunks first)
        dirtyChunks.sort((a, b) => b.priority - a.priority);

        // Second pass: update limited number of highest priority chunks
        for (const {chunk, mode} of dirtyChunks) {
            if (processedChunks >= MAX_CHUNKS_PER_FRAME) {
                break; // Limit processing to prevent FPS drops
            }

            try {
                const updated = this.addChunkToScene(chunk, mode);
                if (updated) {
                    chunk.isDirty = false;
                    processedChunks++;
                } else {
                    // Keep marked as dirty so we will retry later
                    chunk.isDirty = true;
                }
            } catch (error) {
                console.error(`Error updating chunk (${chunk.x},${chunk.y},${chunk.z}):`, error);
                // Keep the chunk marked as dirty so we can try again later
                chunk.isDirty = true;
            }
        }
        
        // If we're in the browser, ensure the scene is marked for update and flag other attributes
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                if (this.scene) {
                    this.scene.traverse(obj => {
                        if (obj instanceof THREE.Mesh) {
                            const geom = obj.geometry as THREE.BufferGeometry | undefined;
                            if (!geom) return;
                            if (geom.attributes.position) geom.attributes.position.needsUpdate = true;
                            if (geom.attributes.normal) geom.attributes.normal.needsUpdate = true;
                            if (geom.attributes.uv) geom.attributes.uv.needsUpdate = true;
                            if (geom.index) geom.index.needsUpdate = true;
                        }
                    });
                }
            });
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
     * @param debug Optional flag to get the debug wireframe material
     * @returns The shared material or null if not loaded yet
     */
    public getMaterial(debug: boolean = false): THREE.Material | null {
        if (debug) {
            return this.debugMaterial || this.sharedMaterial;
        }
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
