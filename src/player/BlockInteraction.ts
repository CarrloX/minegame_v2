import * as THREE from 'three';
import { Player } from './Player';
import { World } from '../world/World';
import { BlockType } from '../world/BlockType';
export class BlockInteraction {
    private player: Player;
    private world: World;
    private domElement: HTMLElement;
    private game: any; // Reference to Game instance if needed

    // Configuration
    private readonly MAX_DISTANCE = 5; // Maximum distance for block interaction

    constructor(player: Player, world: World, domElement: HTMLElement, game?: any) {
        this.player = player;
        this.world = world;
        this.domElement = domElement;
        this.game = game;

        // Bind methods
        this.onPointerDown = this.onPointerDown.bind(this);
        
        this.initEventListeners();
    }

    private initEventListeners(): void {
        // Use pointerdown with passive: false to allow preventDefault()
        this.domElement.addEventListener('pointerdown', this.onPointerDown, { passive: false });
        
        // Prevent context menu on right click
        this.domElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    private onPointerDown(event: PointerEvent): void {
        if (event.button !== 0) return; // Only left click
        event.preventDefault();

        // Get fresh raycast data
        const raycastResult = this.player.getLastRaycastResult(true); // Force fresh raycast

        if (!raycastResult || raycastResult.distance > this.MAX_DISTANCE) {
            this.clearHighlight();
            return;
        }

        // Get block position
        const blockPos = new THREE.Vector3(
            Math.floor(raycastResult.position.x),
            Math.floor(raycastResult.position.y),
            Math.floor(raycastResult.position.z)
        );

        // Verify the block exists and isn't air
        const currentBlock = this.world.getBlock(blockPos.x, blockPos.y, blockPos.z);
        if (currentBlock === undefined || currentBlock === BlockType.AIR) {
            this.clearHighlight();
            return;
        }

        console.log(`Destroying block at (${blockPos.x}, ${blockPos.y}, ${blockPos.z})`);

        // Remove the block
        this.world.setBlock(blockPos.x, blockPos.y, blockPos.z, BlockType.AIR);
        
        // Force update chunks
        this.world.updateDirtyChunks();
        
        // Clear highlight
        this.clearHighlight();
    }

    private clearHighlight(): void {
        // Clear highlight through game if available
        if (this.game && typeof this.game.updateHighlightBox === 'function') {
            this.game.updateHighlightBox(null);
        }
    }

    public dispose(): void {
        this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    }
}