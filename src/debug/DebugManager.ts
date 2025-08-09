import * as THREE from 'three';
import Stats from 'stats.js';
import { World } from '../world/World';

export class DebugManager {
    private world: World;
    private wireframeEnabled = false;
    private originalMaterials: Map<string, THREE.Material | THREE.Material[]> = new Map();
    private stats: Stats;

    constructor(world: World) {
        this.world = world;
        this.stats = new Stats();
        this.initStatsPanel();
    }

    private onKeyDown = (event: KeyboardEvent) => {
        if (event.key.toLowerCase() === 'm') {
            this.toggleWireframe();
        }
        if (event.key.toLowerCase() === 'f3') {
            event.preventDefault();
            this.toggleStatsPanel();
        }
    };

    public initKeyboardControls(): void {
        window.addEventListener('keydown', this.onKeyDown);
    }

    public dispose(): void {
        window.removeEventListener('keydown', this.onKeyDown);
        document.body.removeChild(this.stats.dom);
    }

    private initStatsPanel(): void {
        this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
        document.body.appendChild(this.stats.dom);
        this.stats.dom.style.display = 'none'; // Ocultar por defecto
    }

    public toggleStatsPanel(): void {
        const isVisible = this.stats.dom.style.display !== 'none';
        this.stats.dom.style.display = isVisible ? 'none' : 'block';
    }

    public updateStats(): void {
        this.stats.update();
    }

    public toggleWireframe(): void {
        this.wireframeEnabled = !this.wireframeEnabled;
        const chunkMeshes = this.world.getChunkMeshes();

        for (const [key, mesh] of chunkMeshes.entries()) {
            if (this.wireframeEnabled) {
                this.applyWireframeToMesh(key, mesh);
            } else {
                if (this.originalMaterials.has(key)) {
                    mesh.material = this.originalMaterials.get(key)!;
                }
            }
        }
    }

    public applyWireframeToMesh(key: string, mesh: THREE.Mesh): void {
        if (this.wireframeEnabled) {
            if (!this.originalMaterials.has(key)) {
                this.originalMaterials.set(key, mesh.material);
            }
            const color = mesh.userData.mode === 'greedy' ? 0xffa500 : 0x00ff00;
            mesh.material = new THREE.MeshBasicMaterial({
                wireframe: true,
                color
            });
        }
    }
}