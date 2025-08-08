/**
 * Main entry point for the Minecraft Clone
 */

import { Renderer } from './rendering/Renderer';
import { Game } from './core/Game';
import { World } from './world/World';
import { Player } from './player/Player';
import { FirstPersonControls } from './player/FirstPersonControls';
import { DebugManager } from './debug/DebugManager';

// Wait for the DOM to be fully loaded before starting the game
window.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('Initializing Minecraft Clone...');
        
        // Create and initialize the renderer
        const renderer = new Renderer();
        
        // Create the world instance with the renderer's scene
        const world = new World(renderer.getScene());
        
        // Create player instance with the renderer's camera
        const camera = renderer.getCamera();

        const controls = new FirstPersonControls(camera, renderer.getRenderer().domElement);
        const player = new Player(camera, controls, world);
        const spawnX = 8;
        const spawnZ = 8;
        const spawnY = world.getHighestBlockY(spawnX, spawnZ);

        // Set player's initial position (feet)
        player.position.set(spawnX, spawnY, spawnZ);

        // Set camera's initial position (eyes)
        camera.position.set(spawnX, spawnY + 1.6, spawnZ);
        
        // Create the game instance with the renderer, world, and player
        const debugManager = new DebugManager(world);
        const game = new Game(renderer, world, player, debugManager);

        debugManager.initKeyboardControls();
        
        // Start the game
        game.start();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            renderer.onWindowResize();
        }, false);
        
        // Handle page unload
        window.addEventListener('beforeunload', () => {
            game.dispose();
        });
        
        // Handle mouse click to lock pointer
        const canvas = renderer.getRenderer().domElement;
        canvas.addEventListener('click', () => {
            controls.lock();
        });
        
        console.log('Game initialized successfully!');
    } catch (error) {
        console.error('Failed to initialize the game:', error);
        
        // Display an error message to the user
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '0';
        errorDiv.style.left = '0';
        errorDiv.style.width = '100%';
        errorDiv.style.padding = '20px';
        errorDiv.style.backgroundColor = '#ff6b6b';
        errorDiv.style.color = 'white';
        errorDiv.style.fontFamily = 'Arial, sans-serif';
        errorDiv.style.zIndex = '1000';
        errorDiv.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
        
        document.body.appendChild(errorDiv);
    }
});