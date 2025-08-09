// WorkerManager handles communication with the GreedyMesher WebWorker

interface MeshData {
    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
}

type WorkerCallback = (meshData: MeshData | null, error?: string) => void;

class WorkerManager {
    private worker: Worker | null = null;
    private isWorkerInitialized = false;
    private callbacks: Map<string, WorkerCallback> = new Map();
    private nextId = 0;
    private static instance: WorkerManager;

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
            // Use webpack's worker-loader syntax
            const WorkerClass = require('worker-loader!./GreedyMesher.worker').default;
            this.worker = new WorkerClass();
            this.isWorkerInitialized = true;
            
            this.worker.onmessage = (e: MessageEvent<{
                id: string;
                error?: string;
                empty?: boolean;
                positions?: Float32Array;
                normals?: Float32Array;
                uvs?: Float32Array;
                indices?: Uint32Array;
            }>) => {
                const { id, error, empty, ...meshData } = e.data;
                const callback = this.callbacks.get(id);
                
                if (!callback) {
                    console.warn(`No callback found for message id: ${id}`);
                    return;
                }
                
                if (callback) {
                    if (error) {
                        console.error('Worker error:', error);
                        callback(null, error);
                    } else if (empty) {
                        callback(null);
                    } else if (meshData?.positions && meshData?.normals && meshData?.uvs && meshData?.indices) {
                        callback({
                            positions: meshData.positions,
                            normals: meshData.normals,
                            uvs: meshData.uvs,
                            indices: meshData.indices
                        });
                    } else {
                        const errorMessage = !meshData ? 'No mesh data received' : 'Incomplete mesh data received from worker';
                        console.error(errorMessage);
                        callback(null, errorMessage);
                    }
                    this.callbacks.delete(id);
                }
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
    public generateMesh(
        blocks: Uint8Array,
        chunkX: number,
        chunkY: number,
        chunkZ: number
    ): Promise<MeshData | null> {
        return new Promise((resolve) => {
            if (!this.worker) {
                console.warn('Worker not available, falling back to null');
                resolve(null);
                return;
            }

            const id = `task_${this.nextId++}`;
            
            this.callbacks.set(id, (meshData, error) => {
                if (error) {
                    console.error('Error generating mesh:', error);
                    resolve(null);
                } else {
                    resolve(meshData);
                }
            });

            // Transfer the blocks array to avoid copying
            this.worker.postMessage(
                {
                    id,
                    blocks: blocks.buffer,
                    chunkX,
                    chunkY,
                    chunkZ
                },
                [blocks.buffer] // Transfer ownership of the buffer
            );
        });
    }

    /**
     * Terminate the worker and clean up
     */
    public dispose(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.callbacks.clear();
    }
}

export { WorkerManager, type MeshData };
