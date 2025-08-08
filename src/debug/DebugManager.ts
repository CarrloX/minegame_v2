import * as THREE from 'three';
import { World } from '../world/World';

export class DebugManager {
    private world: World;
    private wireframeEnabled = false;
    private originalMaterials: Map<string, THREE.Material | THREE.Material[]> = new Map();

    constructor(world: World) {
        this.world = world;
    }

    private onKeyDown = (event: KeyboardEvent) => {
        if (event.key.toLowerCase() === 'm') {
            this.toggleWireframe();
        }
    };

    public initKeyboardControls(): void {
        window.addEventListener('keydown', this.onKeyDown);
    }

    public dispose(): void {
        window.removeEventListener('keydown', this.onKeyDown);
    }

    public toggleWireframe(): void {
        this.wireframeEnabled = !this.wireframeEnabled;
        const chunkMeshes = this.world.getChunkMeshes();

        for (const [key, mesh] of chunkMeshes.entries()) {
            if (this.wireframeEnabled) {
                if (!this.originalMaterials.has(key)) {
                    this.originalMaterials.set(key, mesh.material);
                }
                mesh.material = new THREE.MeshBasicMaterial({ 
                    wireframe: true,
                    color: 0x00ff00
                });
            } else {
                if (this.originalMaterials.has(key)) {
                    mesh.material = this.originalMaterials.get(key)!;
                }
            }
        }
    }
}