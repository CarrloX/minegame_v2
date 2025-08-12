// WorkerManager handles communication with the GreedyMesher WebWorker
import * as THREE from 'three';

interface MeshData {
    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    groups?: Array<{
        key: string;
        blockType: number;
        face: 'top' | 'bottom' | 'side';
        start: number;
        count: number;
    }>;
}

type WorkerCallback = (meshData: MeshData | null, error?: string) => void;

class WorkerManager {
    private worker: Worker | null = null;
    private isWorkerInitialized = false;
    private callbacks: Map<string, WorkerCallback> = new Map();
    private nextId = 0;
    private static instance: WorkerManager;
    
    // Cache for material keys and their indices
    private materialKeys: string[] = [];
    private materialKeyToIndex = new Map<string, number>();

    private constructor() {
        this.initializeWorker();
    }

    public static getInstance(): WorkerManager {
        if (!WorkerManager.instance) {
            WorkerManager.instance = new WorkerManager();
        }
        return WorkerManager.instance;
    }

    private initializeWorker(): void {
        try {
            // In Vite, we can use the ?worker import syntax
            // This tells Vite to handle the worker file correctly
            this.worker = new Worker(new URL('./GreedyMesher.worker.ts', import.meta.url), {
                type: 'module',
                name: 'greedy-mesher-worker'
            });
            
            this.isWorkerInitialized = true;
            console.log('[WorkerManager] Worker initialized successfully with Vite');
            
            this.worker.onmessage = (e: MessageEvent<{
                id: string;
                error?: string;
                empty?: boolean;
                positions?: ArrayBuffer;
                normals?: ArrayBuffer;
                uvs?: ArrayBuffer;
                indices?: ArrayBuffer;
                groups?: Array<{
                    key: string;
                    blockType: number;
                    face: 'top' | 'bottom' | 'side';
                    start: number;
                    count: number;
                }>;
            }>) => {
                const { id, error, empty, ...meshData } = e.data;
                const callback = this.callbacks.get(id);
                
                if (!callback) {
                    console.warn(`No callback found for message id: ${id}`);
                    return;
                }
                
                if (error) {
                    console.error('Worker error:', error);
                    callback(null, error);
                } else if (empty) {
                    console.log('[WorkerManager] Worker returned empty mesh');
                    callback(null);
                } else if (meshData.positions && meshData.normals && meshData.uvs && meshData.indices) {
                    // Convert ArrayBuffers back to typed arrays
                    const positions = new Float32Array(meshData.positions);
                    const normals = new Float32Array(meshData.normals);
                    const uvs = new Float32Array(meshData.uvs);
                    const indices = new Uint32Array(meshData.indices);

                    // Include groups data if available
                    const result: MeshData = {
                        positions,
                        normals,
                        uvs,
                        indices,
                        groups: meshData.groups
                    };
                    
                    callback(result);
                } else {
                    const errorMessage = !meshData ? 'No mesh data received' : 'Incomplete mesh data received from worker';
                    console.error(errorMessage);
                    callback(null, errorMessage);
                }
                
                // Clean up the callback
                this.callbacks.delete(id);
            };

            this.worker.onerror = (error: ErrorEvent | null) => {
                console.error('Worker error:', error);
                this.isWorkerInitialized = false;
                
                // Reject all pending callbacks
                const errorMessage = error?.message || 'Unknown worker error';
                this.callbacks.forEach((callback) => {
                    callback(null, errorMessage);
                });
                this.callbacks.clear();
                
                // Try to reinitialize the worker after a delay
                setTimeout(() => {
                    if (!this.isWorkerInitialized) {
                        console.log('Attempting to reinitialize worker...');
                        this.initializeWorker();
                    }
                }, 1000);
            };
        } catch (error) {
            console.error('Failed to initialize worker:', error);
        }
    }

    /**
     * Generate mesh data asynchronously using a WebWorker
     * @param blocks The chunk's block data
     * @param chunkX Chunk X coordinate
     * @param chunkY Chunk Y coordinate
     * @param chunkZ Chunk Z coordinate
     * @returns A promise that resolves with the mesh data or null if no geometry was generated
     */
    /**
     * Generate mesh data asynchronously using a WebWorker
     * @param blocks The chunk's block data
     * @param chunkX Chunk X coordinate
     * @param chunkY Chunk Y coordinate
     * @param chunkZ Chunk Z coordinate
     * @param worldGetBlock Optional function to get block data from world (for chunk borders)
     */
    public generateMesh(
        blocks: Uint8Array,
        chunkX: number,
        chunkY: number,
        chunkZ: number,
        worldGetBlock?: (x: number, y: number, z: number) => number | undefined
    ): Promise<MeshData | null> {
        return new Promise((resolve) => {
            if (!this.worker) {
                console.warn('Worker not available, falling back to null');
                resolve(null);
                return;
            }

            const id = `task_${this.nextId++}`;
            
            // Store chunk coordinates for logging in the callback
            const chunkCoords = { x: chunkX, y: chunkY, z: chunkZ };
            
            this.callbacks.set(id, (meshData, error) => {
                if (error) {
                    resolve(null);
                } else {
                    resolve(meshData);
                }
            });

            try {
                // Transfer the blocks array to avoid copying
                this.worker.postMessage(
                    {
                        id,
                        blocks: blocks.buffer,
                        chunkX,
                        chunkY,
                        chunkZ,
                        worldGetBlock: worldGetBlock ? true : undefined
                    },
                    [blocks.buffer] // Transfer ownership of the buffer
                );
                
            } catch (error) {
                resolve(null);
            }
        });
    }

    /**
     * Terminate the worker and clean up
     */
    /**
     * Get or create material index for a given block type and face
     * @param blockType Block type number
     * @param face Face type ('top', 'bottom', or 'side')
     * @returns Material index
     */
    public getMaterialIndex(blockType: number, face: 'top' | 'bottom' | 'side'): number {
        const key = `${blockType}:${face}`;
        
        // Return existing index if found
        if (this.materialKeyToIndex.has(key)) {
            return this.materialKeyToIndex.get(key)!;
        }
        
        // Add new material key and return its index
        const index = this.materialKeys.length;
        this.materialKeys.push(key);
        this.materialKeyToIndex.set(key, index);
        return index;
    }
    
    /**
     * Get all material keys in order of their indices
     */
    public getMaterialKeys(): string[] {
        return [...this.materialKeys];
    }
    
    /**
     * Clear all material keys and indices
     */
    public clearMaterialCache(): void {
        this.materialKeys = [];
        this.materialKeyToIndex.clear();
    }
    
    /**
     * Process mesh groups and return material indices for each group
     * @param groups Array of mesh groups
     * @returns Array of material indices for each group
     */
    public processGroups(groups: Array<{blockType: number, face: 'top' | 'bottom' | 'side'}>): number[] {
        return groups.map(group => 
            this.getMaterialIndex(group.blockType, group.face)
        );
    }
    
    /**
     * Apply material groups to a THREE.js BufferGeometry
     * @param geometry The geometry to add groups to
     * @param groups Array of groups with start, count, and material key
     */
/**
     * Apply material groups to a THREE.js BufferGeometry
     * @param geometry The geometry to add groups to
     * @param groups Array of groups with start, count, and material key
     */
    public applyMaterialGroups(geometry: THREE.BufferGeometry, groups: Array<{
        key: string;
        start: number;
        count: number;
    }>): void {
        if (!groups || groups.length === 0) return;
        
        // Clear any existing groups
        geometry.groups = [];
        
        // Add each group with the correct material index
        for (const group of groups) {
            const materialIndex = this.materialKeyToIndex.get(group.key);
            if (materialIndex !== undefined) {
                geometry.addGroup(group.start, group.count, materialIndex);
            } else {
                console.warn(`Material key not found: ${group.key}`);
            }
        }
    }
    
    /**
     * Create a single THREE.Mesh with multiple materials from mesh data
     * @param meshData The mesh data from the worker
     * @param createMaterial Function that creates a material from a block type and face
     * @returns A THREE.Mesh with the geometry and materials
     */
    public createMesh(
        meshData: MeshData,
        createMaterial: (blockType: number, face: 'top' | 'bottom' | 'side') => THREE.Material
    ): THREE.Mesh {
        // Create geometry
        const geometry = new THREE.BufferGeometry();
        
        // Set attributes
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(meshData.uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
        
        // Apply material groups if available
        if (meshData.groups && meshData.groups.length > 0) {
            this.applyMaterialGroups(geometry, meshData.groups);
        }
        
        // Create materials array in the correct order
        const materialKeys = this.getMaterialKeys();
        const materials = materialKeys.map(key => {
            const [blockType, face] = key.split(':');
            return createMaterial(parseInt(blockType, 10), face as 'top' | 'bottom' | 'side');
        });
        
        // Create and return a single mesh with all materials
        return new THREE.Mesh(geometry, materials);
    }
    
    public dispose(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.callbacks.clear();
        this.clearMaterialCache();
    }
}

export { WorkerManager, type MeshData };
