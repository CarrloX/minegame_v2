import * as THREE from 'three';
import Stats from 'stats.js';
import { World } from '../world/World';
import { ResourcePool } from '../core/ResourcePool';

export class DebugManager {
    private world: World;
    private wireframeEnabled = false;
    private originalMaterials: Map<string, THREE.Material | THREE.Material[]> = new Map();
    private stats: Stats;
    private geometryStats: { vertices: number; indices: number; chunks: number } = { vertices: 0, indices: 0, chunks: 0 };
    private vertsElement: HTMLDivElement | null = null;
    private chunksElement: HTMLDivElement | null = null;

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

        // Clean up custom geometry stats
        const customStats = document.getElementById('custom-geometry-stats');
        if (customStats) {
            document.body.removeChild(customStats);
        }
    }

    private initStatsPanel(): void {
        this.stats.showPanel(0); // Only show FPS panel

        this.stats.dom.classList.add('statsjs');
        document.body.appendChild(this.stats.dom);
        this.stats.dom.style.display = 'none';

        // Create custom elements for geometry stats (clean, no graphs)
        this.createCustomGeometryElements();
    }

    private createCustomGeometryElements(): void {
        // Create container for custom stats
        const customContainer = document.createElement('div');
        customContainer.id = 'custom-geometry-stats';
        customContainer.style.cssText = `
            position: absolute;
            top: 0;
            right: 80px;
            background: rgba(0, 0, 0, 0.9);
            border: 1px solid #555;
            border-radius: 5px;
            padding: 5px;
            font-family: monospace;
            font-size: 12px;
            color: white;
            z-index: 10000;
            display: none;
        `;

        // Create verts element
        this.vertsElement = document.createElement('div');
        this.vertsElement.style.cssText = `
            margin-bottom: 2px;
        `;
        const vertsLabel = document.createElement('div');
        vertsLabel.textContent = 'Verts:';
        vertsLabel.style.cssText = 'font-size: 10px; color: #ccc; margin-bottom: 2px;';
        const vertsValue = document.createElement('div');
        vertsValue.textContent = '0';
        vertsValue.style.cssText = 'font-size: 14px; font-weight: bold; color: white;';
        vertsValue.id = 'verts-value';
        this.vertsElement.appendChild(vertsLabel);
        this.vertsElement.appendChild(vertsValue);

        // Create chunks element
        this.chunksElement = document.createElement('div');
        const chunksLabel = document.createElement('div');
        chunksLabel.textContent = 'Chunks:';
        chunksLabel.style.cssText = 'font-size: 10px; color: #ccc; margin-bottom: 2px;';
        const chunksValue = document.createElement('div');
        chunksValue.textContent = '0';
        chunksValue.style.cssText = 'font-size: 14px; font-weight: bold; color: white;';
        chunksValue.id = 'chunks-value';
        this.chunksElement.appendChild(chunksLabel);
        this.chunksElement.appendChild(chunksValue);

        customContainer.appendChild(this.vertsElement);
        customContainer.appendChild(this.chunksElement);
        document.body.appendChild(customContainer);
    }

    public toggleStatsPanel(): void {
        const isVisible = this.stats.dom.style.display !== 'none';
        this.stats.dom.style.display = isVisible ? 'none' : 'block';

        // Also toggle custom geometry stats
        const customStats = document.getElementById('custom-geometry-stats');
        if (customStats) {
            customStats.style.display = isVisible ? 'none' : 'block';
        }
    }

    public updateStats(): void {
        this.updateGeometryStats();
        this.updatePoolStats();
        this.stats.update();
    }

    private updateGeometryStats(): void {
        const chunkMeshes = this.world.getChunkMeshes();
        let totalVertices = 0;
        let totalIndices = 0;
        let visibleChunks = 0;

        for (const mesh of chunkMeshes.values()) {
            if (mesh.visible && mesh.geometry) {
                const geometry = mesh.geometry as THREE.BufferGeometry;
                if (geometry.attributes.position) {
                    totalVertices += geometry.attributes.position.count;
                }
                if (geometry.index) {
                    totalIndices += geometry.index.count;
                }
                visibleChunks++;
            }
        }

        this.geometryStats.vertices = totalVertices;
        this.geometryStats.indices = totalIndices;
        this.geometryStats.chunks = visibleChunks;

        // Update custom HTML elements
        const vertsValue = document.getElementById('verts-value');
        const chunksValue = document.getElementById('chunks-value');

        if (vertsValue) {
            vertsValue.textContent = totalVertices.toLocaleString();
        }
        if (chunksValue) {
            chunksValue.textContent = visibleChunks.toString();
        }
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

    public getGeometryStats(): { vertices: number; indices: number; chunks: number } {
        return { ...this.geometryStats };
    }

    public logChunkRegeneration(chunkX: number, chunkY: number, chunkZ: number, mode: string, vertices: number): void {
        console.log(`[Chunk Regen] (${chunkX},${chunkY},${chunkZ}) ${mode}: ${vertices} verts`);
    }

    public updatePoolStats(): void {
        const pool = ResourcePool.getInstance();
        const stats = pool.getStats();

        // Create or update pool stats display
        let poolStatsElement = document.getElementById('pool-stats');
        if (!poolStatsElement) {
            poolStatsElement = document.createElement('div');
            poolStatsElement.id = 'pool-stats';
            poolStatsElement.style.cssText = `
                position: absolute;
                top: 80px;
                right: 80px;
                background: rgba(0, 0, 0, 0.9);
                border: 1px solid #555;
                border-radius: 5px;
                padding: 5px;
                font-family: monospace;
                font-size: 11px;
                color: white;
                z-index: 10000;
                display: none;
                max-width: 200px;
            `;
            document.body.appendChild(poolStatsElement);
        }

        // Update pool stats content
        const totalGeometries = Object.values(stats.geometries).reduce((sum, count) => sum + count, 0);
        const totalAttributes = Object.values(stats.attributes.positions).reduce((sum, count) => sum + count, 0) +
                              Object.values(stats.attributes.normals).reduce((sum, count) => sum + count, 0) +
                              Object.values(stats.attributes.uvs).reduce((sum, count) => sum + count, 0) +
                              Object.values(stats.attributes.indices).reduce((sum, count) => sum + count, 0);

        poolStatsElement.innerHTML = `
            <div style="font-size: 10px; color: #ccc; margin-bottom: 3px;">Resource Pool:</div>
            <div style="font-size: 12px; font-weight: bold; color: #4CAF50;">Geoms: ${totalGeometries}</div>
            <div style="font-size: 12px; font-weight: bold; color: #2196F3;">Attrs: ${totalAttributes}</div>
            <div style="font-size: 9px; color: #888; margin-top: 2px;">
                S:${stats.geometries.small}|${stats.attributes.positions.small}<br>
                M:${stats.geometries.medium}|${stats.attributes.positions.medium}<br>
                L:${stats.geometries.large}|${stats.attributes.positions.large}<br>
                XL:${stats.geometries.xlarge}|${stats.attributes.positions.xlarge}
            </div>
        `;

        // Toggle visibility with F3
        const isVisible = this.stats.dom.style.display !== 'none';
        poolStatsElement.style.display = isVisible ? 'block' : 'none';
    }

}
