import * as THREE from 'three';
import { Renderer } from '../rendering/Renderer';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { DebugManager } from '../debug/DebugManager';
import { CrosshairManager } from '../ui/CrosshairManager';
import { BlockType } from '../world/BlockType';
import { BlockOutlineHelper } from '../rendering/BlockOutlineHelper';
import { BlockInteraction } from '../player/BlockInteraction';

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
    private blockInteraction: BlockInteraction | null = null;

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
        
        // Initialize block interaction for block destruction
        this.blockInteraction = new BlockInteraction(
            this.player,
            this.world,
            this.renderer.getRenderer().domElement
        );
        // Event listeners are initialized in the BlockInteraction constructor
        
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
     * @param _deltaTime - Time in seconds since the last update
     */
    private update(_deltaTime: number): void {
        // Update the world (this will handle chunk loading/unloading)
        this.world.update(this.player.position);
        
        // Force update all dirty chunks immediately
        this.world.updateDirtyChunks();
        
        // Update block highlighting and raycasting
        this.updateBlockHighlighting();
        
        // Force a render update to ensure changes are visible
        this.renderer.render();
    }
    
    /**
     * Actualiza el resaltado del bloque apuntado por el jugador
     */
    private updateBlockHighlighting(): void {
        // Get the raycast result
        const raycastResult = this.player.getLastRaycastResult();
        
        // If there was a previously highlighted block that's no longer being targeted, restore it
        // Reemplaza el bloque de "restauración" por esto:
        if (this.hoveredBlock) {
            const currentType = this.world.getBlock(this.hoveredBlock.position.x, this.hoveredBlock.position.y, this.hoveredBlock.position.z);
            if (!raycastResult || !this.hoveredBlock.position.equals(raycastResult.position)) {
            // Si el bloque fue modificado por otra acción (minado / colocado), NO restauramos.
            // Sólo limpiamos nuestro estado local y ocultamos el outline.
            this.hoveredBlock = null;
            this.updateHighlightBox(null);
            }
        }
        
        // If there's a new block being targeted, highlight it
        if (raycastResult && raycastResult.blockType !== null) {
            const { position } = raycastResult;
            
            // Only if it's not the same block we're already highlighting
            if (!this.hoveredBlock || !this.hoveredBlock.position.equals(position)) {
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
    
        const deltaTime = Math.min((time - this.lastTime) / 1000, 0.1);
        this.lastTime = time;
    
        try {
            // IMPORTANT: update player *before* update() so raycasts are fresh for highlighting and interactions
            this.player.update(deltaTime);
    
            // Now update world / highlighting / chunk-loading etc
            this.update(deltaTime);
    
            // Render the scene
            this.renderer.render();
    
            // Update crosshair after render if needed
            if (this.crosshairManager) {
                this.crosshairManager.update();
            }
    
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
                    onColorChange: (isLight: boolean) => {
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
        this.stop();
        
        // Clean up block interaction
        if (this.blockInteraction) {
            this.blockInteraction.dispose();
            this.blockInteraction = null;
        }
        
        // Clean up the world
        this.world.dispose();
        
        // Clean up the renderer
        this.renderer.dispose();
        
        // Clean up the player
        this.player.dispose();
        
        // Clean up debug manager
        this.debugManager.dispose();
        
        console.log('Game disposed');
    }
}