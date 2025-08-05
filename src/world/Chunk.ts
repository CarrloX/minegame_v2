import * as THREE from 'three';
import { BlockType } from './BlockType';
import { GreedyMesher } from '../meshing/GreedyMesher';

/**
 * Represents a 16x16x16 chunk of blocks in the world
 */
export class Chunk {
    public static readonly SIZE = 16;
    public static readonly HEIGHT = 16;
    
    // Using a flat array for better memory locality and performance
    // Indexed as [x + z * SIZE + y * SIZE * SIZE]
    private blocks: Uint8Array;
    private mesh: THREE.Mesh | null;
    private needsUpdate: boolean;
    
    // Chunk position in chunk coordinates (not block coordinates)
    constructor(public readonly x: number, public readonly y: number, public readonly z: number) {
        this.blocks = new Uint8Array(Chunk.SIZE * Chunk.SIZE * Chunk.HEIGHT);
        this.mesh = null;
        this.needsUpdate = true;
    }
    
    /**
     * Converts 3D chunk coordinates to flat array index
     */
    private getIndex(x: number, y: number, z: number): number {
        if (x < 0 || x >= Chunk.SIZE || y < 0 || y >= Chunk.HEIGHT || z < 0 || z >= Chunk.SIZE) {
            throw new Error(`Coordinates (${x}, ${y}, ${z}) are out of chunk bounds`);
        }
        return x + z * Chunk.SIZE + y * Chunk.SIZE * Chunk.SIZE;
    }
    
    /**
     * Gets the block type at the specified local chunk coordinates
     */
    public getBlock(x: number, y: number, z: number): BlockType {
        return this.blocks[this.getIndex(x, y, z)];
    }
    
    /**
     * Sets the block type at the specified local chunk coordinates
     */
    public setBlock(x: number, y: number, z: number, blockType: BlockType): void {
        this.blocks[this.getIndex(x, y, z)] = blockType;
    }
    
    /**
     * Fills a 3D region within the chunk with a specific block type
     */
    public fill(
        x1: number, y1: number, z1: number,
        x2: number, y2: number, z2: number,
        blockType: BlockType
    ): void {
        // Ensure coordinates are in the correct order
        const minX = Math.max(0, Math.min(x1, x2));
        const maxX = Math.min(Chunk.SIZE - 1, Math.max(x1, x2));
        const minY = Math.max(0, Math.min(y1, y2));
        const maxY = Math.min(Chunk.HEIGHT - 1, Math.max(y1, y2));
        const minZ = Math.max(0, Math.min(z1, z2));
        const maxZ = Math.min(Chunk.SIZE - 1, Math.max(z1, z2));
        
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                for (let x = minX; x <= maxX; x++) {
                    this.setBlock(x, y, z, blockType);
                }
            }
        }
    }
    
    /**
     * Checks if the chunk is empty (contains only air blocks)
     */
    /**
     * Checks if the chunk is empty (contains only air blocks)
     */
    public isEmpty(): boolean {
        return this.blocks.every(block => block === BlockType.AIR);
    }
    
    /**
     * Marks the chunk as needing a mesh update
     */
    public markDirty(): void {
        this.needsUpdate = true;
    }
    
    /**
     * Gets the chunk's mesh, creating it if necessary
     */
    public getMesh(): THREE.Mesh | null {
        if (this.needsUpdate) {
            this.updateMesh();
        }
        return this.mesh;
    }
    
    /**
     * Updates the chunk's mesh based on its block data using Greedy Meshing
     */
    private updateMesh(): void {
        // Dispose of the old mesh if it exists
        if (this.mesh) {
            const geometry = this.mesh.geometry as THREE.BufferGeometry;
            geometry.dispose();
            
            // Dispose of materials
            if (Array.isArray(this.mesh.material)) {
                (this.mesh.material as THREE.Material[]).forEach(material => material.dispose());
            } else if (this.mesh.material) {
                (this.mesh.material as THREE.Material).dispose();
            }
        }
        
        if (this.isEmpty()) {
            this.mesh = null;
            this.needsUpdate = false;
            return;
        }
        
        // Convert chunk data to 3D array format expected by GreedyMesher
        const blocks: number[][][] = [];
        
        for (let x = 0; x < Chunk.SIZE; x++) {
            blocks[x] = [];
            for (let y = 0; y < Chunk.HEIGHT; y++) {
                blocks[x][y] = [];
                for (let z = 0; z < Chunk.SIZE; z++) {
                    blocks[x][y][z] = this.getBlock(x, y, z);
                }
            }
        }
        
        // Generate optimized mesh data using GreedyMesher
        const meshData = GreedyMesher.generateMesh(blocks);
        
        // Create a new geometry
        const geometry = new THREE.BufferGeometry();
        
        // Set up the geometry with the computed attributes
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(meshData.uvs, 2));
        geometry.setIndex(meshData.indices);
        
        // Compute normals if needed (shouldn't be necessary as we provide them, but just in case)
        if (meshData.normals.length === 0) {
            geometry.computeVertexNormals();
        }
        
        // Compute bounding box for frustum culling
        geometry.computeBoundingBox();
        
        // Cargar textura del atlas
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load('/assets/textures/atlas.png');
        
        // Configuración óptima para texturas pixeladas
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.anisotropy = 1;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.premultiplyAlpha = false;
        
        // Usar MeshBasicMaterial para mostrar las texturas exactamente como son
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.FrontSide,
            color: 0xFFFFFF, // Color base blanco puro
            fog: false, // Desactivar niebla para mantener colores puros
            toneMapped: false, // Desactivar mapeo de tonos para colores más brillantes
            transparent: true,
            alphaTest: 0.1
        });
        
        // Create the mesh with the geometry and material
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.position.set(
            this.x * Chunk.SIZE,
            this.y * Chunk.HEIGHT,
            this.z * Chunk.SIZE
        );
        
        // Mark as updated
        this.needsUpdate = false;
    }
}
