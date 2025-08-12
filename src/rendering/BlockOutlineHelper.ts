import * as THREE from 'three';
import { World } from '../world/World';
import { BlockType } from '../world/BlockType';

export class BlockOutlineHelper {
  private scene: THREE.Scene;
  private world: World;

  private highlightBox: THREE.Group | null = null;
  private faceGroups: THREE.Group[] = []; // 6 groups, one per face
  private edgeMaterial: THREE.LineBasicMaterial;
  private size = 0.5; // exact half-block

  // Configurables
  private ignoredBlockTypes: Set<number> = new Set();            // si el bloque objetivo está en este set => no dibujar
  private transparentNeighborTypes: Set<number> = new Set();     // si el vecino está en este set => tratar como AIR al decidir visibilidad

  public onHighlightChange?: (pos: THREE.Vector3 | null) => void;

  constructor(scene: THREE.Scene, world: World, color = 0x000000) {
    this.scene = scene;
    this.world = world;
    this.edgeMaterial = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 1.0, // Aumentar opacidad
      depthTest: true,  // Habilitar depth test
      depthWrite: true, // Habilitar escritura de profundidad
      toneMapped: false,
      linewidth: 2     // Asegurar que las líneas sean visibles
    });

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

  /** Tratar el tipo de vecino como transparente (equivalente a AIR) para decidir visibilidad de caras */
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

  // -------------------
  // Inicialización
  // -------------------
  private initializeHighlightBox(): void {
    this.highlightBox = new THREE.Group();
    this.highlightBox.visible = false;
    this.highlightBox.renderOrder = 1; // Valor bajo para que se dibuje antes
    this.highlightBox.matrixAutoUpdate = true; // Permitir actualización automática

    const s = this.size;
    const corners = [
      new THREE.Vector3(-s, -s, -s), // 0
      new THREE.Vector3( s, -s, -s), // 1
      new THREE.Vector3( s, -s,  s), // 2
      new THREE.Vector3(-s, -s,  s), // 3
      new THREE.Vector3(-s,  s, -s), // 4
      new THREE.Vector3( s,  s, -s), // 5
      new THREE.Vector3( s,  s,  s), // 6
      new THREE.Vector3(-s,  s,  s)  // 7
    ];

    // Coincide con los checks que usaremos en update (ver abajo)
    const faceCornerIndices: number[][] = [
      [0,1,2,3], // bottom (y-)
      [7,6,5,4], // top (y+)
      [0,3,7,4], // left (x-)
      [1,5,6,2], // right (x+)
      [3,2,6,7], // front (z+)
      [0,4,5,1]  // back (z-)
    ];

    this.faceGroups = [];
    for (let f = 0; f < faceCornerIndices.length; f++) {
      const group = new THREE.Group();
      const idx = faceCornerIndices[f];
      for (let i = 0; i < 4; i++) {
        const a = corners[idx[i]];
        const b = corners[idx[(i + 1) % 4]];
        const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
        const line = new THREE.Line(geo, this.edgeMaterial);
        group.add(line);
      }
      group.visible = false;
      this.faceGroups.push(group);
      this.highlightBox.add(group);
    }

    this.scene.add(this.highlightBox);
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

    // Si el bloque objetivo está en la lista de ignorados => ocultar
    const targetType = this.world.getBlock(blockX, blockY, blockZ);
    if (targetType !== undefined && this.ignoredBlockTypes.has(targetType)) {
      this.highlightBox.visible = false;
      this.onHighlightChange?.(null);
      return;
    }

    // Posicionar en el centro del bloque
    this.highlightBox.position.set(blockX + 0.5, blockY + 0.5, blockZ + 0.5);

    // Helper para decidir si un vecino se considera "vacío" a efectos del outline
    const neighborIsEmptyForOutline = (nx: number, ny: number, nz: number): boolean => {
      const neighbor = this.world.getBlock(nx, ny, nz);
      // undefined o AIR se consideran vacíos
      if (neighbor === undefined || neighbor === BlockType.AIR) return true;
      // Si el vecino está en transparentNeighborTypes, también consideramos vacío
      if (this.transparentNeighborTypes.has(neighbor)) return true;
      // en otro caso, es sólido
      return false;
    };

    // Orden de checks debe corresponder con faceGroups:
    // bottom, top, left, right, front, back
    const faceChecks: [number, number, number][] = [
      [0,-1,0], // bottom (y-)
      [0, 1,0], // top    (y+)
      [-1,0,0], // left   (x-)
      [1, 0,0], // right  (x+)
      [0, 0, 1],// front  (z+)
      [0, 0,-1] // back   (z-)
    ];

    let anyVisible = false;
    for (let f = 0; f < this.faceGroups.length; f++) {
      const [dx, dy, dz] = faceChecks[f];
      const nx = blockX + dx;
      const ny = blockY + dy;
      const nz = blockZ + dz;
      const visible = neighborIsEmptyForOutline(nx, ny, nz);
      this.faceGroups[f].visible = visible;
      anyVisible = anyVisible || visible;
    }
    const EPS = 0.001; // Reducir el offset para que no sea tan notorio
    this.highlightBox.scale.set(1 + EPS, 1 + EPS, 1 + EPS);
    this.highlightBox.visible = anyVisible;
    this.onHighlightChange?.(new THREE.Vector3(blockX, blockY, blockZ));
  }

  // -------------------
  // Utilidades estéticas
  // -------------------
  public setColor(hex: number, opacity = 0.95) {
    this.edgeMaterial.color.setHex(hex);
    this.edgeMaterial.opacity = opacity;
    this.edgeMaterial.needsUpdate = true;
  }

  public pulse(time: number) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    this.edgeMaterial.opacity = 0.5 + 0.5 * pulse;
    this.edgeMaterial.needsUpdate = true;
  }

  // -------------------
  // Limpieza
  // -------------------
  public dispose(): void {
    if (!this.highlightBox) return;
    this.scene.remove(this.highlightBox);

    // dispose geometries; material es compartido y se libera aquí
    this.faceGroups.forEach(group => {
      group.children.forEach(child => {
        const line = child as THREE.Line;
        line.geometry.dispose();
        // no dispose del material por child (compartido)
      });
    });

    this.edgeMaterial.dispose();
    this.faceGroups = [];
    this.highlightBox = null;
  }
}
