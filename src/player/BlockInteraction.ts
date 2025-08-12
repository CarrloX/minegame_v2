import { Player } from './Player';
import { World } from '../world/World';
import { BlockType } from '../world/BlockType';

/**
 * Handles player interaction with blocks (mining, placing, etc.)
 */
export class BlockInteraction {
    private player: Player;
    private world: World;
    private domElement: HTMLElement;

    // Configuration
    private readonly MAX_DISTANCE = 5; // Maximum distance for block interaction

    // Bound handler so we can remove it later
    private boundPointerDown = (e: PointerEvent) => this.onPointerDown(e);

    constructor(player: Player, world: World, domElement: HTMLElement) {
        this.player = player;
        this.world = world;
        this.domElement = domElement;

        this.initEventListeners();
    }

    /**
     * Initialize event listeners for block interaction
     */
    private initEventListeners(): void {
        // Use pointerdown (works better with pointer lock)
        this.domElement.addEventListener('pointerdown', this.boundPointerDown, { passive: false });

        // Prevent context menu on right click to allow for block placement
        this.domElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    /**
     * Handle pointer down events for block interaction
     */
    private onPointerDown(event: PointerEvent): void {
        // Only handle left mouse button for block destruction
        if (event.button !== 0) return;

        // Prevent default to avoid undesired browser behavior
        event.preventDefault();

        // Get the last raycast result from the player
        const raycastResult = this.player.getLastRaycastResult();

        if (!raycastResult) return;
        if (raycastResult.distance > this.MAX_DISTANCE) return;

        // Get the block position that was hit
        const blockX = Math.floor(raycastResult.position.x);
        const blockY = Math.floor(raycastResult.position.y);
        const blockZ = Math.floor(raycastResult.position.z);

        console.log(`Attempting to destroy block at (${blockX}, ${blockY}, ${blockZ})`);

        // Optional sanity check: confirm the block still matches the raycast info
        const current = this.world.getBlock(blockX, blockY, blockZ);
        if (current === undefined || current === BlockType.AIR) {
            console.warn('Target block already gone or undefined');
            return;
        }

        // Remove the block at the hit position (this marks chunks dirty via World.setBlock)
        this.world.setBlock(blockX, blockY, blockZ, BlockType.AIR);

        // IMPORTANT: don't force an immediate rebuild of all chunks here.
        // Let the main loop call world.updateDirtyChunks() to batch updates.
        console.log(`Block destroyed at (${blockX}, ${blockY}, ${blockZ})`);
    }

    /**
     * Clean up event listeners
     */
    public dispose(): void {
        this.domElement.removeEventListener('pointerdown', this.boundPointerDown);
    }
}
