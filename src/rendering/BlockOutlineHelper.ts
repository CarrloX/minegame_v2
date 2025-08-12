// BlockOutlineHelper.ts
import * as THREE from 'three';
import { World } from '../world/World';
import { BlockType } from '../world/BlockType';

// Shared base geometry (unit box along +X). We'll clone it per helper so dispose() es seguro.
const BASE_EDGE_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

// Maximum number of edges in a cube
const MAX_EDGES = 12;

export class BlockOutlineHelper {
  private scene: THREE.Scene;
  private world: World;

  // Rendering elements
  private highlightBox: THREE.Group | null = null;
  private edgeMaterial: THREE.MeshBasicMaterial;
  private instanceMesh: THREE.InstancedMesh | null = null;
  private edgeMatrices: THREE.Matrix4[] = [];
  private visibleCount = 0;

  // temporaries (reutilizados)
  private tmpPosition = new THREE.Vector3();
  private tmpQuaternion = new THREE.Quaternion();
  private tmpScale = new THREE.Vector3(1, 1, 1);
  private tmpDir = new THREE.Vector3();
  private tmpCenter = new THREE.Vector3();
  private tmpBlockPos = new THREE.Vector3();

  // Configuration
  private ignoredBlockTypes = new Set<number>();
  private transparentNeighborTypes = new Set<number>();

  // Predicate configurable: recibe (targetType, neighborType, nx, ny, nz) y decide si la cara es "vacía" (mostrar contorno)
  private visibilityPredicate: (
    targetType: number | undefined,
    neighborType: number | undefined,
    nx: number,
    ny: number,
    nz: number
  ) => boolean;

  public onHighlightChange?: (pos: THREE.Vector3 | null) => void;

  /**
   * @param scene Three scene
   * @param world World instance (must expose getBlock(x,y,z): BlockType | undefined)
   * @param color outline color (hex)
   * @param overlay if true, outline is rendered as overlay (depthTest=false) to always be visible
   */
  constructor(scene: THREE.Scene, world: World, color = 0x000000, overlay = true) {
    this.scene = scene;
    this.world = world;

    // Create a per-helper material (safe to dispose later)
    this.edgeMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthTest: !overlay,   // if overlay => disable depth test so it always draws on top
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });

    // default visibility predicate (same behaviour as before)
    this.visibilityPredicate = (_, neighborType) => {
      if (neighborType === undefined || neighborType === BlockType.AIR) return true;
      if (this.transparentNeighborTypes.has(neighborType)) return true;
      return false;
    };

    this.initializeHighlightBox();
  }

  // -------------------
  // API configuración
  // -------------------
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

  // Transparencia de vecinos
  public addTransparentNeighborType(type: BlockType): void {
    this.transparentNeighborTypes.add(type);
  }
  public removeTransparentNeighborType(type: BlockType): void {
    this.transparentNeighborTypes.delete(type);
  }
  public clearTransparentNeighborTypes(): void {
    this.transparentNeighborTypes.clear();
  }
  public setTransparentNeighborTypes(types: BlockType[]): void {
    this.transparentNeighborTypes = new Set(types);
  }

  // Visibility predicate API
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
  public resetVisibilityPredicate(): void {
    this.visibilityPredicate = (_, neighborType) => {
      if (neighborType === undefined || neighborType === BlockType.AIR) return true;
      if (this.transparentNeighborTypes.has(neighborType)) return true;
      return false;
    };
  }

  // -------------------
  // Inicialización
  // -------------------
  private initializeHighlightBox(): void {
    // create main group
    this.highlightBox = new THREE.Group();
    this.highlightBox.visible = false;
    this.highlightBox.renderOrder = 10000; // high so overlay draws after world
    this.highlightBox.matrixAutoUpdate = true;

    // Create an instanced mesh for up to 12 edges (we clone base geometry per helper)
    const geom = BASE_EDGE_GEOMETRY.clone();
    this.instanceMesh = new THREE.InstancedMesh(geom, this.edgeMaterial, MAX_EDGES);
    // We will dynamically update instances
    this.instanceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instanceMesh.frustumCulled = false;
    this.instanceMesh.count = 0;

    this.highlightBox.add(this.instanceMesh);
    this.scene.add(this.highlightBox);

    // Prepare transformation matrices for each of the 12 edges (compose once)
    this.edgeMatrices = new Array(MAX_EDGES);
    for (let i = 0; i < MAX_EDGES; i++) this.edgeMatrices[i] = new THREE.Matrix4();

    // Define cube half-size and edges (consistent with previous ordering)
    const s = 0.5;
    const lineWidth = 0.01;

    // Edges defined by start/end as previously:
    const edges = [
      // bottom face
      { start: new THREE.Vector3(-s, -s, -s), end: new THREE.Vector3( s, -s, -s) }, // 0
      { start: new THREE.Vector3( s, -s, -s), end: new THREE.Vector3( s, -s,  s) }, // 1
      { start: new THREE.Vector3( s, -s,  s), end: new THREE.Vector3(-s, -s,  s) }, // 2
      { start: new THREE.Vector3(-s, -s,  s), end: new THREE.Vector3(-s, -s, -s) }, // 3
      // top face
      { start: new THREE.Vector3(-s,  s, -s), end: new THREE.Vector3( s,  s, -s) }, // 4
      { start: new THREE.Vector3( s,  s, -s), end: new THREE.Vector3( s,  s,  s) }, // 5
      { start: new THREE.Vector3( s,  s,  s), end: new THREE.Vector3(-s,  s,  s) }, // 6
      { start: new THREE.Vector3(-s,  s,  s), end: new THREE.Vector3(-s,  s, -s) }, // 7
      // vertical edges
      { start: new THREE.Vector3(-s, -s, -s), end: new THREE.Vector3(-s,  s, -s) }, // 8
      { start: new THREE.Vector3( s, -s, -s), end: new THREE.Vector3( s,  s, -s) }, // 9
      { start: new THREE.Vector3( s, -s,  s), end: new THREE.Vector3( s,  s,  s) }, // 10
      { start: new THREE.Vector3(-s, -s,  s), end: new THREE.Vector3(-s,  s,  s) }  // 11
    ];

    // Compose matrices for each edge (center, rotation, scale)
    for (let i = 0; i < edges.length && i < this.edgeMatrices.length; i++) {
      const { start, end } = edges[i];

      // direction and length
      this.tmpDir.subVectors(end, start);
      const length = this.tmpDir.length();
      if (length < 1e-8) {
        this.edgeMatrices[i].identity();
        continue;
      }

      // center
      this.tmpCenter.copy(start).add(end).multiplyScalar(0.5);

      // rotation: align +X to tmpDir
      this.tmpDir.normalize();
      this.tmpQuaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.tmpDir);

      // scale: length in X, thickness in Y/Z
      this.tmpScale.set(length, lineWidth, lineWidth);

      this.edgeMatrices[i].compose(this.tmpCenter, this.tmpQuaternion, this.tmpScale);
    }
  }

  // -------------------
  // Lógica principal
  // -------------------
  /**
   * Actualiza el contorno para la posición dada (null oculta)
   */
  public updateHighlightBox(position: THREE.Vector3 | null): void {
    if (!this.highlightBox || !this.instanceMesh) return;

    if (!position) {
      this.highlightBox.visible = false;
      this.instanceMesh.count = 0;
      this.instanceMesh.instanceMatrix.needsUpdate = true;
      this.onHighlightChange?.(null);
      return;
    }

    const blockX = Math.floor(position.x);
    const blockY = Math.floor(position.y);
    const blockZ = Math.floor(position.z);

    // Ignorados
    const targetType = this.world.getBlock(blockX, blockY, blockZ);
    if (targetType !== undefined && this.ignoredBlockTypes.has(targetType)) {
      this.highlightBox.visible = false;
      this.instanceMesh.count = 0;
      this.instanceMesh.instanceMatrix.needsUpdate = true;
      this.onHighlightChange?.(null);
      return;
    }

    // Posicionar en centro del bloque
    this.tmpPosition.set(blockX + 0.5, blockY + 0.5, blockZ + 0.5);
    this.highlightBox.position.copy(this.tmpPosition);

    // face checks: bottom, top, left, right, front, back
    const faceChecks: [number, number, number][] = [
      [0, -1, 0], // bottom (y-)
      [0,  1, 0], // top    (y+)
      [-1, 0, 0], // left   (x-)
      [ 1, 0, 0], // right  (x+)
      [ 0, 0, 1], // front  (z+)
      [ 0, 0,-1]  // back   (z-)
    ];

    // Map faces -> edge indices (matches edges[] ordering above)
    const faceToEdges: number[][] = [
      [0, 1, 2, 3],     // bottom
      [4, 5, 6, 7],     // top
      [3, 11, 7, 8],    // left  (x-)
      [1, 9, 10, 5],    // right (x+)
      [2, 10, 6, 11],   // front (z+)
      [0, 8, 4, 9]      // back  (z-)
    ];

    // Decide visible faces using visibilityPredicate
    const visibleEdgesSet = new Set<number>();
    for (let f = 0; f < faceChecks.length; f++) {
      const [dx, dy, dz] = faceChecks[f];
      const nx = blockX + dx, ny = blockY + dy, nz = blockZ + dz;
      const neighborType = this.world.getBlock(nx, ny, nz);
      const shouldShow = this.visibilityPredicate(targetType, neighborType, nx, ny, nz);
      if (shouldShow) {
        for (const e of faceToEdges[f]) visibleEdgesSet.add(e);
      }
    }

    // Write matrices for visible edges into instanced mesh sequentially
    let idx = 0;
    visibleEdgesSet.forEach((edgeIndex) => {
      // Compose final matrix: base edgeMatrices[edgeIndex] is in local cube-space;
      // we want instance placed relative to highlightBox position — since highlightBox is positioned at block center,
      // just set the instance matrix without additional translation (matrices already represent positions relative to origin).
      this.instanceMesh!.setMatrixAt(idx++, this.edgeMatrices[edgeIndex]);
    });

    this.visibleCount = idx;
    this.instanceMesh.count = this.visibleCount;
    this.instanceMesh.instanceMatrix.needsUpdate = true;

    this.highlightBox.visible = this.visibleCount > 0;
    this.tmpBlockPos.set(blockX, blockY, blockZ);
    this.onHighlightChange?.(this.tmpBlockPos);
  }

  // -------------------
  // Utilidades estéticas
  // -------------------
  public setColor(hex: number, opacity = 0.85) {
    if (this.edgeMaterial) {
      this.edgeMaterial.color.setHex(hex);
      this.edgeMaterial.opacity = opacity;
      this.edgeMaterial.needsUpdate = true;
    }
  }

  public pulse(time: number) {
    if (this.edgeMaterial) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      this.edgeMaterial.opacity = 0.4 + 0.6 * pulse;
      this.edgeMaterial.needsUpdate = true;
    }
  }

  // -------------------
  // Limpieza
  // -------------------
  public dispose(): void {
    if (this.instanceMesh) {
      // remove from group and dispose the instanced mesh (it owns its cloned geometry and material)
      this.highlightBox?.remove(this.instanceMesh);
      this.instanceMesh.dispose();
      this.instanceMesh = null;
    }

    if (this.highlightBox && this.highlightBox.parent) {
      this.highlightBox.parent.remove(this.highlightBox);
    }
    this.highlightBox = null;

    // dispose material (owned by this helper)
    if (this.edgeMaterial) {
      this.edgeMaterial.dispose();
    }
    this.edgeMatrices = [];
  }
}
