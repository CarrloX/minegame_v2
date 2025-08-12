import * as THREE from 'three';
import { CrosshairManager } from '../ui/CrosshairManager';

/**
 * Handles all rendering for the game using Three.js
 */
export class Renderer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private crosshairManager: CrosshairManager;

    /**
     * Creates a new Renderer instance
     */
    constructor() {
        // Create the scene
        this.scene = new THREE.Scene();
        
        // Set up the camera
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        
        // Set up the renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            canvas: document.createElement('canvas')
        });
        
        // Configure renderer
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for better performance
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Add the canvas to the app container
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.appendChild(this.renderer.domElement);
        } else {
            document.body.appendChild(this.renderer.domElement);
        }
        
        // Initial resize
        this.onWindowResize();
        
        // Set the background color (sky blue)
        this.scene.background = new THREE.Color(0x87CEEB);
        
        // Add lights
        this.setupLights();
        
        
        // Initialize crosshair manager
        this.crosshairManager = new CrosshairManager(this.renderer);
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    /**
     * Handles window resize events
     */
    public onWindowResize(): void {
        // Get the container dimensions
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // Update camera aspect ratio
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        // Update renderer size
        this.renderer.setSize(width, height);
        
        // Ensure the canvas fills the container
        const canvas = this.renderer.domElement;
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
    }
    
    /**
     * Cleans up resources when the renderer is no longer needed
     */
    public dispose(): void {
        // Remove event listeners
        window.removeEventListener('resize', () => this.onWindowResize());
        
        // Dispose of the renderer
        this.renderer.dispose();
        
        // Remove the canvas from the DOM
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }

    /**
     * Gets the camera instance
     * @returns The camera instance
     */
    public getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }
    
    /**
     * Renders the scene
     */
    public render(): void {
        this.renderer.render(this.scene, this.camera);
        
        // Update crosshair based on what's behind it
        if (this.crosshairManager) {
            this.crosshairManager.update();
        }
    }
    
    /**
     * Gets the Three.js scene
     * @returns The scene
     */
    public getScene(): THREE.Scene {
        return this.scene;
    }
    
    /**
     * Gets the WebGL renderer
     * @returns The renderer
     */
    public getRenderer(): THREE.WebGLRenderer {
        return this.renderer;
    }
    
    /**
     * Sets up the lighting for the scene
     */
    private setupLights(): void {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        // Directional light (sun)
        const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        sunLight.position.set(100, 100, 50);
        sunLight.castShadow = true;
        
        // Configure shadow properties
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 500;
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        
        this.scene.add(sunLight);
    }
}
