import { Renderer } from '../rendering/Renderer';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { DebugManager } from '../debug/DebugManager';

export class Game {
    private renderer: Renderer;
    private world: World;
    private player: Player;
    private debugManager: DebugManager;
    private isRunning: boolean = false;
    private lastTime: number = 0;
    private animationFrameId: number | null = null;

    /**
     * Creates an instance of Game
     * @param renderer - The renderer instance that will handle the rendering
     * @param world - The world instance that contains the game world
     * @param player - The player instance that controls the camera
     */
    constructor(renderer: Renderer, world: World, player: Player, debugManager: DebugManager) {
        this.renderer = renderer;
        this.world = world;
        this.player = player;
        this.debugManager = debugManager;
        
        // Bind the game loop to maintain 'this' context
        this.gameLoop = this.gameLoop.bind(this);
    }
    
    /**
     * Gets the player instance
     * @returns The player instance
     */
    public getPlayer(): Player {
        return this.player;
    }
    
    /**
     * Updates the game state
     * @param deltaTime - Time in seconds since the last update
     */
    private update(deltaTime: number): void {
        // Update the world (this will handle chunk updates)
        this.world.update();
        
        // Update other game systems here (player, physics, etc.)
        // For now, we'll just log the FPS
        const fps = 1 / deltaTime;
        if (fps < 55) {  // Only log if FPS drops below 55
            console.log(`FPS: ${fps.toFixed(1)}`);
        }
    }
    
    /**
     * Starts the game loop
     */
    public start(): void {
        if (this.isRunning) {
            console.warn('Game is already running!');
            return;
        }
        
        this.isRunning = true;
        this.lastTime = performance.now();
        
        console.log('Game started!');
        
        // Start the game loop
        this.gameLoop(0);
    }
    
    /**
     * The main game loop
     * @param time - The current timestamp from requestAnimationFrame
     */
    private gameLoop(time: number): void {
        this.debugManager.updateStats();
        if (!this.isRunning) return;
        
        // Calculate delta time in seconds
        const deltaTime = Math.min((time - this.lastTime) / 1000, 0.1);
        this.lastTime = time;
        
        try {
            // Update game state
            this.update(deltaTime);
            
            // Update player (handles camera movement)
            this.player.update(deltaTime);
            
            // Render the scene
            this.renderer.render();
            
            // Continue the game loop
            this.animationFrameId = requestAnimationFrame(this.gameLoop);
        } catch (error) {
            console.error('Error in game loop:', error);
            this.stop();
        }
    }
    
    /**
     * Stops the game loop and cleans up resources
     */
    public stop(): void {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        
        // Cancel any pending animation frame
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // Clean up the world
        this.world.dispose();
        
        console.log('Game stopped');
    }
    
    /**
     * Disposes of game resources
     */
    public dispose(): void {
        // Stop the game loop
        this.stop();
        
        // Dispose of resources
        this.player.dispose();
        this.world.dispose();
        this.renderer.dispose();
        this.debugManager.dispose();
    }
}