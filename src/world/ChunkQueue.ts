import { Chunk } from './Chunk';

type ChunkTask = {
    chunkX: number;
    chunkY: number;
    chunkZ: number;
    priority: number; // Lower number = higher priority
    mode: 'detailed' | 'greedy';
};

export class ChunkQueue {
    private queue: ChunkTask[] = [];
    private processing = false;
    private maxTasksPerFrame: number;
    private world: any; // Reference to World class
    private frameId: number | null = null;

    constructor(world: any, maxTasksPerFrame = 2) {
        this.world = world;
        this.maxTasksPerFrame = maxTasksPerFrame;
    }

    public addTask(
        chunkX: number,
        chunkY: number,
        chunkZ: number,
        mode: 'detailed' | 'greedy',
        priority: number = 1
    ): void {
        // Check if task already exists
        const existingIndex = this.queue.findIndex(
            t => t.chunkX === chunkX && t.chunkY === chunkY && t.chunkZ === chunkZ
        );

        const task = { chunkX, chunkY, chunkZ, priority, mode };

        if (existingIndex >= 0) {
            const existingTask = this.queue[existingIndex];
            // Update existing task if new one has higher priority or if the mode has changed
            if (existingTask.priority > priority || existingTask.mode !== mode) {
                this.queue[existingIndex] = task;
                this.sortQueue();
                console.log(`Updated task for chunk [${chunkX},${chunkY},${chunkZ}] to mode: ${mode}`);
            }
        } else {
            this.queue.push(task);
            this.sortQueue();
            console.log(`Added new task for chunk [${chunkX},${chunkY},${chunkZ}] with mode: ${mode}`);
        }

        this.startProcessing();
    }

    private sortQueue(): void {
        // Sort by priority (ascending) and then by distance to player
        this.queue.sort((a, b) => a.priority - b.priority);
    }

    private startProcessing(): void {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        this.processQueue();
    }

    private stopProcessing(): void {
        this.processing = false;
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }

    private processQueue = (): void => {
        if (!this.processing || this.queue.length === 0) {
            this.stopProcessing();
            return;
        }

        // Process up to maxTasksPerFrame chunks per frame
        let processed = 0;
        while (processed < this.maxTasksPerFrame && this.queue.length > 0) {
            const task = this.queue.shift()!;
            this.processTask(task);
            processed++;
        }

        // Schedule next batch for next frame
        if (this.queue.length > 0) {
            this.frameId = requestAnimationFrame(this.processQueue);
        } else {
            this.stopProcessing();
        }
    };

    private processTask(task: ChunkTask): void {
        try {
            const { chunkX, chunkY, chunkZ, mode } = task;
            const chunk = this.world.getChunk(chunkX, chunkY, chunkZ) || 
                         this.world.generateChunk(chunkX, chunkY, chunkZ);
            
            if (chunk) {
                this.world.addChunkToScene(chunk, mode);
            }
        } catch (error) {
            console.error('Error processing chunk task:', error);
        }
    }

    public clear(): void {
        this.queue = [];
        this.stopProcessing();
    }

    public getQueueSize(): number {
        return this.queue.length;
    }
}
