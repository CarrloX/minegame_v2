import * as THREE from 'three';

/**
 * Manages the crosshair appearance and behavior
 */
export class CrosshairManager {
    private renderer: THREE.WebGLRenderer;
    private pixelBuffer: Uint8Array;

    /**
     * Creates a new CrosshairManager instance
     * @param renderer The WebGL renderer
     */
    constructor(renderer: THREE.WebGLRenderer) {
        this.renderer = renderer;
        this.pixelBuffer = new Uint8Array(4);
    }

    /**
     * Updates the crosshair color based on the background
     */
    public update(): void {
        // Get the center of the screen
        const centerX = Math.floor(this.renderer.domElement.width / 2);
        const centerY = Math.floor(this.renderer.domElement.height / 2);

        // Create a temporary buffer if needed
        if (!this.pixelBuffer) {
            this.pixelBuffer = new Uint8Array(4);
        }

        try {
            // Read the pixel color at the center of the screen
            const renderTarget = this.renderer.getRenderTarget();
            
            // Only proceed if we have a valid render target
            if (renderTarget) {
                this.renderer.readRenderTargetPixels(
                    renderTarget,
                    centerX,
                    centerY,
                    1,
                    1,
                    this.pixelBuffer
                );

                // Calculate brightness (using relative luminance formula)
                const [r, g, b] = this.pixelBuffer;
                const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

                // Update crosshair color based on background brightness
                this.updateCrosshairColor(brightness > 0.5);
            }
        } catch (error) {
            // Silently handle any errors during pixel reading
            console.debug('Error reading pixel data:', error);
        }
    }

    /**
     * Updates the crosshair color based on background brightness
     * @param isLightBackground Whether the background is light
     */
    private updateCrosshairColor(isLightBackground: boolean): void {
        const root = document.documentElement;
        
        if (isLightBackground) {
            // Dark crosshair for light backgrounds
            root.style.setProperty('--crosshair-color', 'rgba(0, 0, 0, 0.8)');
            root.style.setProperty('--crosshair-border', 'rgba(255, 255, 255, 0.5)');
        } else {
            // Light crosshair for dark backgrounds
            root.style.setProperty('--crosshair-color', 'rgba(255, 255, 255, 0.8)');
            root.style.setProperty('--crosshair-border', 'rgba(0, 0, 0, 0.5)');
        }
    }
}
