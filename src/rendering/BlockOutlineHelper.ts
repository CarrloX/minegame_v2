import * as THREE from 'three';
import { World } from '../world/World';
import { BlockType } from '../world/BlockType';

export class BlockOutlineHelper {
  private scene: THREE.Scene;
  private world: World;

  private highlightBox: THREE.LineSegments | null = null;
  private edgeMaterial: THREE.LineBasicMaterial;
  private size = 0.5; // exact half-block
  private geometry: THREE.BufferGeometry | null = null;
  private faceRanges: { start: number; count: number }[] = [];
  
  // Variables temporales para evitar crear nuevos objetos en el bucle de actualización
  private tmpPosition = new THREE.Vector3();
  private tmpBlockPos = new THREE.Vector3();

  // Configurables
  private ignoredBlockTypes: Set<number> = new Set();            // si el bloque objetivo está en este set => no dibujar
  private transparentNeighborTypes: Set<number> = new Set();     // si el vecino está en este set => tratar como AIR al decidir visibilidad
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
    
    // Predicado por defecto que usa la lógica actual
    this.visibilityPredicate = (_, neighborType) => {
      // undefined o AIR se consideran vacíos
      if (neighborType === undefined || neighborType === BlockType.AIR) return true;
      // Si el vecino está en transparentNeighborTypes, también consideramos vacío
      if (this.transparentNeighborTypes.has(neighborType)) return true;
      // en otro caso, es sólido
      return false;
    };
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
    const s = this.size;
    // 8 vértices del cubo
    const vertices = [
      -s, -s, -s,  // 0
       s, -s, -s,  // 1
       s, -s,  s,  // 2
      -s, -s,  s,  // 3
      -s,  s, -s,  // 4
       s,  s, -s,  // 5
       s,  s,  s,  // 6
      -s,  s,  s   // 7
    ];

    // Índices para los 12 segmentos (2 vértices por arista, 4 aristas por cara, 6 caras)
    // Cada grupo de 2 índices forma un segmento de línea
    const indices = [
      // bottom (y-)
      0, 1,  1, 2,  2, 3,  3, 0,
      // top (y+)
      4, 5,  5, 6,  6, 7,  7, 4,
      // sides
      0, 4,  1, 5,  2, 6,  3, 7
    ];

    // Crear la geometría
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setIndex(indices);
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    // Crear el material
    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 1.0,
      depthTest: true,
      depthWrite: true,
      linewidth: 2
    });

    // Crear el LineSegments
    this.highlightBox = new THREE.LineSegments(this.geometry, this.edgeMaterial);
    this.highlightBox.visible = false;
    this.highlightBox.renderOrder = 1;
    this.highlightBox.matrixAutoUpdate = true;

    // Definir los rangos de dibujo para cada cara
    // Cada cara tiene 4 segmentos (8 índices)
    for (let i = 0; i < 6; i++) {
      this.faceRanges.push({
        start: i * 8,
        count: 8
      });
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
    if (!this.highlightBox || !this.geometry) return;

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

    // Posicionar en el centro del bloque usando el vector temporal
    this.tmpPosition.set(blockX + 0.5, blockY + 0.5, blockZ + 0.5);
    this.highlightBox.position.copy(this.tmpPosition);

    // Usar el predicado de visibilidad para determinar si mostrar el contorno
    const shouldShowOutline = (nx: number, ny: number, nz: number): boolean => {
      const neighborType = this.world.getBlock(nx, ny, nz);
      return this.visibilityPredicate(targetType, neighborType, nx, ny, nz);
    };

    // Orden de checks: bottom, top, left, right, front, back
    const faceChecks: [number, number, number][] = [
      [0,-1,0], // bottom (y-)
      [0, 1,0], // top    (y+)
      [-1,0,0], // left   (x-)
      [1, 0,0], // right  (x+)
      [0, 0, 1],// front  (z+)
      [0, 0,-1] // back   (z-)
    ];

    // Crear un array con los rangos de dibujo visibles
    const drawRanges: { start: number; count: number }[] = [];
    let anyVisible = false;

    for (let f = 0; f < faceChecks.length; f++) {
      const [dx, dy, dz] = faceChecks[f];
      const nx = blockX + dx;
      const ny = blockY + dy;
      const nz = blockZ + dz;
      
      if (shouldShowOutline(nx, ny, nz)) {
        drawRanges.push(this.faceRanges[f]);
        anyVisible = true;
      }
    }

    // Actualizar la geometría con los rangos visibles
    if (anyVisible && drawRanges.length > 0) {
      // Combinar todos los rangos en uno solo
      const start = Math.min(...drawRanges.map(r => r.start));
      const end = Math.max(...drawRanges.map(r => r.start + r.count));
      this.geometry.setDrawRange(start, end - start);
    }

    const EPS = 0.001; // Pequeño offset para evitar z-fighting
    this.highlightBox.scale.set(1 + EPS, 1 + EPS, 1 + EPS);
    this.highlightBox.visible = anyVisible;
    // Usar vector temporal para la notificación
    this.tmpBlockPos.set(blockX, blockY, blockZ);
    this.onHighlightChange?.(this.tmpBlockPos);
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

    if (this.geometry) {
      this.geometry.dispose();
      this.geometry = null;
    }

    if (this.edgeMaterial) {
      this.edgeMaterial.dispose();
    }

    this.highlightBox = null;
    this.faceRanges = [];
  }
}
