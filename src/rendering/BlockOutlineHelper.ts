import * as THREE from 'three';
import { World } from '../world/World';
import { BlockType } from '../world/BlockType';

// Shared geometry for all edge instances (unit box along X axis)
const EDGE_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

// Maximum number of edges in a cube
const MAX_EDGES = 12;

export class BlockOutlineHelper {
  private scene: THREE.Scene;
  private world: World;
  private size = 0.5; // exact half-block
  
  // Rendering elements
  private highlightBox: THREE.Group | null = null;
  private edgeMaterial: THREE.MeshBasicMaterial;
  private instanceMesh: THREE.InstancedMesh;
  private edgeMatrices: THREE.Matrix4[] = [];
  private visibleCount: number = 0;
  
  // Reusable objects to avoid allocations
  private tmpMatrix = new THREE.Matrix4();
  private tmpPosition = new THREE.Vector3();
  private tmpQuaternion = new THREE.Quaternion();
  private tmpScale = new THREE.Vector3(1, 1, 1);
  private tmpDir = new THREE.Vector3();
  private tmpCenter = new THREE.Vector3();
  private xAxis = new THREE.Vector3(1, 0, 0);
  private tmpBlockPos = new THREE.Vector3();

  // Configuration
  private ignoredBlockTypes = new Set<number>();            // si el bloque objetivo está en este set => no dibujar
  private transparentNeighborTypes = new Set<number>();     // si el vecino está en este set => tratar como AIR al decidir visibilidad
  private visibilityPredicate: (
    targetType: number | undefined,
    neighborType: number | undefined,
    nx: number,
    ny: number,
    nz: number
  ) => boolean;

  public onHighlightChange?: (pos: THREE.Vector3 | null) => void;

  constructor(scene: THREE.Scene, world: World, color = 0x000000) {
    this.scene = scene;
    this.world = world;
    
    // Initialize the main group
    this.highlightBox = new THREE.Group();
    this.highlightBox.visible = false;
    this.highlightBox.renderOrder = 1;
    this.highlightBox.matrixAutoUpdate = true;
    
    // Create material for the edges
    this.edgeMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    
    // Create instanced mesh for all edges
    this.instanceMesh = new THREE.InstancedMesh(
      EDGE_GEOMETRY,
      this.edgeMaterial,
      MAX_EDGES
    );
    this.instanceMesh.frustumCulled = false;
    this.instanceMesh.renderOrder = 1000; // Ensure it renders on top
    this.highlightBox.add(this.instanceMesh);
    
    // Add highlight box to the scene and ensure it's visible
    this.scene.add(this.highlightBox);
    this.highlightBox.visible = true;
    
    // Initialize edge matrices
    this.edgeMatrices = Array(MAX_EDGES).fill(null).map(() => new THREE.Matrix4());
    
    // Default visibility predicate
    this.visibilityPredicate = (_, neighborType) => {
      if (neighborType === undefined || neighborType === BlockType.AIR) return true;
      if (this.transparentNeighborTypes.has(neighborType)) return true;
      return false;
    };
    
    this.initializeHighlightBox();
  }

  // -------------------
  // API de configuración
  // -------------------
  /** Ignorar por completo un tipo de bloque (no dibujar outline sobre él) */
  public addIgnoredBlockType(type: BlockType): void {
    this.ignoredBlockTypes.add(type);
  }
  public removeIgnoredBlockType(type: BlockType): void {
    this.ignoredBlockTypes.delete(type);
  }
  public clearIgnoredBlockTypes(): void {
    this.ignoredBlockTypes.clear();
  }
  public setIgnoredBlockTypes(types: BlockType[]): void {
    this.ignoredBlockTypes = new Set(types);
  }

  /** 
   * Establece un predicado personalizado para decidir la visibilidad de los contornos.
   * @param predicate Función que recibe (targetType, neighborType, nx, ny, nz) y devuelve true si el contorno debe mostrarse
   */
  public setVisibilityPredicate(
    predicate: (
      targetType: number | undefined,
      neighborType: number | undefined,
      nx: number,
      ny: number,
      nz: number
    ) => boolean
  ): void {
    this.visibilityPredicate = predicate;
  }

  /** 
   * Restablece el predicado de visibilidad al comportamiento por defecto.
   * El comportamiento por defecto considera transparentes a AIR y a los tipos en transparentNeighborTypes.
   */
  public resetVisibilityPredicate(): void {
    this.visibilityPredicate = (_, neighborType) => {
      if (neighborType === undefined || neighborType === BlockType.AIR) return true;
      if (this.transparentNeighborTypes.has(neighborType)) return true;
      return false;
    };
  }

  /** 
   * @deprecated Usa setVisibilityPredicate en su lugar para mayor flexibilidad
   * Tratar el tipo de vecino como transparente (equivalente a AIR) para decidir visibilidad de caras 
   */
  public addTransparentNeighborType(type: BlockType): void {
    this.transparentNeighborTypes.add(type);
  }
  
  /** @deprecated Usa setVisibilityPredicate en su lugar para mayor flexibilidad */
  public removeTransparentNeighborType(type: BlockType): void {
    this.transparentNeighborTypes.delete(type);
  }
  
  /** @deprecated Usa setVisibilityPredicate en su lugar para mayor flexibilidad */
  public clearTransparentNeighborTypes(): void {
    this.transparentNeighborTypes.clear();
  }
  
  /** @deprecated Usa setVisibilityPredicate en su lugar para mayor flexibilidad */
  public setTransparentNeighborTypes(types: BlockType[]): void {
    this.transparentNeighborTypes = new Set(types);
  }

  // -------------------
  // Inicialización
  // -------------------
  private initializeHighlightBox(): void {
    if (!this.highlightBox) return;
    
    // Define cube dimensions
    const s = 0.5; // Half of block size (1x1x1 cube)
    const lineWidth = 0.01; // Thickness of the outline
    
    // Define the 12 edges of the cube
    const edges = [
      // Bottom face
      { start: new THREE.Vector3(-s, -s, -s), end: new THREE.Vector3(s, -s, -s) },
      { start: new THREE.Vector3(s, -s, -s), end: new THREE.Vector3(s, -s, s) },
      { start: new THREE.Vector3(s, -s, s), end: new THREE.Vector3(-s, -s, s) },
      { start: new THREE.Vector3(-s, -s, s), end: new THREE.Vector3(-s, -s, -s) },
      // Top face
      { start: new THREE.Vector3(-s, s, -s), end: new THREE.Vector3(s, s, -s) },
      { start: new THREE.Vector3(s, s, -s), end: new THREE.Vector3(s, s, s) },
      { start: new THREE.Vector3(s, s, s), end: new THREE.Vector3(-s, s, s) },
      { start: new THREE.Vector3(-s, s, s), end: new THREE.Vector3(-s, s, -s) },
      // Vertical edges
      { start: new THREE.Vector3(-s, -s, -s), end: new THREE.Vector3(-s, s, -s) },
      { start: new THREE.Vector3(s, -s, -s), end: new THREE.Vector3(s, s, -s) },
      { start: new THREE.Vector3(s, -s, s), end: new THREE.Vector3(s, s, s) },
      { start: new THREE.Vector3(-s, -s, s), end: new THREE.Vector3(-s, s, s) }
    ];
    
    // Calculate the transformation matrix for each edge
    for (let i = 0; i < edges.length && i < this.edgeMatrices.length; i++) {
      const { start, end } = edges[i];
      
      // Calculate direction and length
      this.tmpDir.subVectors(end, start);
      const length = this.tmpDir.length();
      
      if (length < 1e-6) continue;
      
      // Calculate center point
      this.tmpCenter.addVectors(start, end).multiplyScalar(0.5);
      
      // Calculate rotation to align with edge
      this.tmpDir.normalize();
      this.tmpQuaternion.setFromUnitVectors(
        new THREE.Vector3(1, 0, 0), // Original direction of the edge geometry
        this.tmpDir.clone()         // Desired direction
      );
      
      // Set scale (length, width, width)
      this.tmpScale.set(length, lineWidth, lineWidth);
      
      // Create and store the transformation matrix
      this.edgeMatrices[i].compose(
        this.tmpCenter,
        this.tmpQuaternion,
        this.tmpScale
      );
    }
  }

  // -------------------
  // Lógica principal
  // -------------------
  /**
   * Actualiza el contorno. Si position === null oculta el helper.
   * position: punto en el mundo (puede ser coordenadas flotantes), se hace snap a entero.
   */
  public updateHighlightBox(position: THREE.Vector3 | null): void {
    if (!this.highlightBox) return;

    if (!position) {
      this.highlightBox.visible = false;
      this.onHighlightChange?.(null);
      return;
    }

    const blockX = Math.floor(position.x);
    const blockY = Math.floor(position.y);
    const blockZ = Math.floor(position.z);

    // Check if target block is in the ignored list
    const targetType = this.world.getBlock(blockX, blockY, blockZ);
    if (targetType !== undefined && this.ignoredBlockTypes.has(targetType)) {
      this.highlightBox.visible = false;
      this.onHighlightChange?.(null);
      return;
    }

    // Position the highlight box at the block center
    this.tmpPosition.set(blockX + 0.5, blockY + 0.5, blockZ + 0.5);
    this.highlightBox.position.copy(this.tmpPosition);

    // For now, just show all edges for testing
    this.visibleCount = 0;
    for (let i = 0; i < Math.min(MAX_EDGES, this.edgeMatrices.length); i++) {
      if (this.edgeMatrices[i]) {
        this.instanceMesh.setMatrixAt(i, this.edgeMatrices[i]);
        this.visibleCount++;
      }
    }
    
    // Update instance count and mark as needing update
    this.instanceMesh.count = this.visibleCount;
    if (this.visibleCount > 0) {
      this.instanceMesh.instanceMatrix.needsUpdate = true;
      this.highlightBox.visible = true;
    } else {
      this.highlightBox.visible = false;
    }
    
    // Notify about highlight change
    this.tmpBlockPos.set(blockX, blockY, blockZ);
    this.onHighlightChange?.(this.tmpBlockPos);
    
    // Notify about highlight change
    this.tmpBlockPos.set(blockX, blockY, blockZ);
    this.onHighlightChange?.(this.tmpBlockPos);
  }

  // -------------------
  // Utilidades estéticas
  // -------------------
  public setColor(hex: number, opacity = 0.95) {
    if (this.edgeMaterial) {
      this.edgeMaterial.color.setHex(hex);
      this.edgeMaterial.opacity = opacity;
      this.edgeMaterial.needsUpdate = true;
    }
  }

  public pulse(time: number) {
    if (this.edgeMaterial) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      this.edgeMaterial.opacity = 0.5 + 0.5 * pulse;
      this.edgeMaterial.needsUpdate = true;
    }
  }

  // -------------------
  // Limpieza
  // -------------------
  public dispose(): void {
    // Clean up instanced mesh
    if (this.instanceMesh) {
      this.highlightBox?.remove(this.instanceMesh);
      this.instanceMesh.dispose();
    }
    
    // Clean up the main group
    if (this.highlightBox && this.highlightBox.parent) {
      this.highlightBox.parent.remove(this.highlightBox);
    }
    
    // Don't dispose the material as it might be shared
  }
}
