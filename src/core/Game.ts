import * as THREE from 'three';
import { Renderer } from '../rendering/Renderer';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { DebugManager } from '../debug/DebugManager';
import { CrosshairManager } from '../ui/CrosshairManager';
import { BlockType } from '../world/BlockType';
import { BlockOutlineHelper } from '../rendering/BlockOutlineHelper';

export class Game {
    private renderer: Renderer;
    private world: World;
    private player: Player;
    private debugManager: DebugManager;
    private crosshairManager: CrosshairManager | null = null;
    private isRunning: boolean = false;
    private lastTime: number = 0;
    private animationFrameId: number | null = null;
    private hoveredBlock: { position: THREE.Vector3; originalType: BlockType } | null = null;
    private blockOutlineHelper: BlockOutlineHelper | null = null;

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
        

        // Initialize crosshair manager
        this.initializeCrosshair();
        
        // Initialize block outline helper
        this.blockOutlineHelper = new BlockOutlineHelper(this.renderer.getScene(), this.world);
        
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
        this.world.update(this.player.position);
        
        // Actualizar el raycast y resaltar el bloque apuntado
        this.updateBlockHighlighting();
    }
    
    /**
     * Actualiza el resaltado del bloque apuntado por el jugador
     */
    private updateBlockHighlighting(): void {
        // Get the raycast result
        const raycastResult = this.player.getLastRaycastResult();
        
        console.log('Raycast result:', raycastResult);
        
        // If there was a previously highlighted block that's no longer being targeted, restore it
        if (this.hoveredBlock) {
            if (!raycastResult || !this.hoveredBlock.position.equals(raycastResult.position)) {
                console.log('Restoring previously highlighted block at:', this.hoveredBlock.position);
                // Restore the original block type
                this.world.setBlock(
                    this.hoveredBlock.position.x,
                    this.hoveredBlock.position.y,
                    this.hoveredBlock.position.z,
                    this.hoveredBlock.originalType
                );
                this.hoveredBlock = null;
                
                // Hide the highlight box
                this.updateHighlightBox(null);
            }
        }
        
        // If there's a new block being targeted, highlight it
        if (raycastResult && raycastResult.blockType !== null) {
            const { position, blockType } = raycastResult;
            console.log('Block targeted at position:', position, 'Type:', BlockType[blockType as number]);
            
            // Only if it's not the same block we're already highlighting
            if (!this.hoveredBlock || !this.hoveredBlock.position.equals(position)) {
                console.log('New block being highlighted');
                // Save the original block type
                const originalType = this.world.getBlock(position.x, position.y, position.z) || BlockType.AIR;
                
                // Save the information of the highlighted block
                this.hoveredBlock = {
                    position: position.clone(),
                    originalType
                };
                
                // Update the highlight box position
                this.updateHighlightBox(position);
            }
        } else if (raycastResult === null) {
            console.log('No block targeted (raycast returned null)');
            // No block is being targeted, hide the highlight box
            this.updateHighlightBox(null);
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
            
            // Update crosshair (debe ir después de renderizar la escena)
            if (this.crosshairManager) {
                this.crosshairManager.update();
            }
            
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
     * Initializes the crosshair manager
     */
    private initializeCrosshair(): void {
        try {
            const renderer = this.renderer.getRenderer();
            const scene = this.renderer.getScene();
            const camera = this.renderer.getCamera();
            
            this.crosshairManager = new CrosshairManager(
                renderer,
                scene,
                camera,
                {
                    mode: 'accurate',
                    onColorChange: (isLight: boolean, brightness: number) => {
                        const root = document.documentElement;
                        if (isLight) {
                            root.style.setProperty('--crosshair-color', 'rgba(0, 0, 0, 0.8)');
                            root.style.setProperty('--crosshair-border', 'rgba(255, 255, 255, 0.5)');
                        } else {
                            root.style.setProperty('--crosshair-color', 'rgba(255, 255, 255, 0.8)');
                            root.style.setProperty('--crosshair-border', 'rgba(0, 0, 0, 0.5)');
                        }
                    }
                }
            );
            
            console.log('CrosshairManager initialized');
        } catch (error) {
            console.error('Failed to initialize CrosshairManager:', error);
        }
    }

    /**
     * Updates the highlight box position and visibility
     * @param position The position to place the highlight box, or null to hide it
     */
    private updateHighlightBox(position: THREE.Vector3 | null): void {
        if (!this.blockOutlineHelper) {
            console.warn('BlockOutlineHelper not initialized');
            return;
        }
        this.blockOutlineHelper.updateHighlightBox(position);
    }

    /**
     * Disposes of resources used by the game
     */
    public dispose(): void {
        // Clean up resources
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Clean up block outline helper
        if (this.blockOutlineHelper) {
            this.blockOutlineHelper.dispose();
            this.blockOutlineHelper = null;
        }

        // Clean up crosshair manager
        if (this.crosshairManager) {
            this.crosshairManager.dispose();
            this.crosshairManager = null;
        }

        // Clean up other resources
        this.renderer.dispose();
        this.world.dispose();
        this.player.dispose();

        console.log('Game resources disposed');
    }
}