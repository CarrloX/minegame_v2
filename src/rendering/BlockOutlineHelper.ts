import * as THREE from 'three';
import { World } from '../world/World';
import { BlockType } from '../world/BlockType';

// Clase auxiliar para crear líneas con ancho consistente usando mallas
export class FatLine {
  public mesh: THREE.Mesh;
  private width: number;

  constructor(start: THREE.Vector3, end: THREE.Vector3, width: number, material: THREE.Material) {
    this.width = width;
    const geometry = new THREE.BoxGeometry(1, 1, 1); // unit box, reused
    this.mesh = new THREE.Mesh(geometry, material);
    this.update(start, end);
  }

  public update(start: THREE.Vector3, end: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 1e-6) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    this.mesh.position.copy(center);

    // Align +X to dir
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0), dir.clone().normalize());
    this.mesh.quaternion.copy(q);

    // scale: geometry is unit-size -> scale x to length, y,z to width
    this.mesh.scale.set(len, this.width, this.width);
  }
}

export class BlockOutlineHelper {
  private scene: THREE.Scene;
  private world: World;
  private size = 0.5; // exact half-block
  
  // Elementos de renderizado
  private highlightBox: THREE.Group | null = null;
  private edgeMaterial: THREE.MeshBasicMaterial;
  private fatLines: FatLine[] = [];
  private faceGroups: THREE.Group[] = [];
  
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
    
    // Inicializar el grupo principal
    this.highlightBox = new THREE.Group();
    this.highlightBox.visible = false;
    this.highlightBox.renderOrder = 1;
    this.highlightBox.matrixAutoUpdate = true;
    
    // Crear el material para las líneas gruesas
    this.edgeMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });
    
    // Predicado por defecto que usa la lógica actual
    this.visibilityPredicate = (_, neighborType) => {
      // undefined o AIR se consideran vacíos
      if (neighborType === undefined || neighborType === BlockType.AIR) return true;
      // Si el vecino está en transparentNeighborTypes, también consideramos vacío
      if (this.transparentNeighborTypes.has(neighborType)) return true;
      // en otro caso, es sólido
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
    if (!this.highlightBox) {
      this.highlightBox = new THREE.Group();
      this.highlightBox.visible = false;
      this.highlightBox.renderOrder = 1;
      this.highlightBox.matrixAutoUpdate = true;
    }

    const s = this.size;
    // Definir los vértices del cubo
    const corners = [
      new THREE.Vector3(-s, -s, -s), // 0
      new THREE.Vector3(s, -s, -s),  // 1
      new THREE.Vector3(s, -s, s),   // 2
      new THREE.Vector3(-s, -s, s),  // 3
      new THREE.Vector3(-s, s, -s),  // 4
      new THREE.Vector3(s, s, -s),   // 5
      new THREE.Vector3(s, s, s),    // 6
      new THREE.Vector3(-s, s, s)    // 7
    ];

    // Definir las aristas del cubo (pares de índices de vértices)
    const edges = [
      // bottom (y-)
      [0, 1], [1, 2], [2, 3], [3, 0],
      // top (y+)
      [4, 5], [5, 6], [6, 7], [7, 4],
      // sides
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    // Limpiar líneas y grupos existentes
    this.fatLines.forEach(line => line.dispose());
    this.fatLines = [];
    this.faceGroups = [];
    
    // Limpiar grupos existentes
    while (this.highlightBox.children.length > 0) {
      const child = this.highlightBox.children[0];
      this.highlightBox.remove(child);
    }

    const lineWidth = 0.01; // Ancho de las líneas (reducido de 0.03 a 0.01)
    
    // Crear 6 grupos (uno por cara)
    for (let i = 0; i < 6; i++) {
      const group = new THREE.Group();
      this.faceGroups.push(group);
      this.highlightBox.add(group);
    }

    // Crear las líneas gruesas
    for (let i = 0; i < edges.length; i++) {
      const [startIdx, endIdx] = edges[i];
      const start = corners[startIdx];
      const end = corners[endIdx];
      
      // Determinar a qué grupo pertenece esta arista (4 aristas por cara)
      const groupIdx = Math.floor(i / 4);
      const group = this.faceGroups[groupIdx];
      
      // Crear la línea gruesa
      const line = new FatLine(start, end, lineWidth, this.edgeMaterial);
      this.fatLines.push(line);
      group.add(line.mesh);
    }

    // Asegurarse de que el highlightBox esté en la escena
    if (this.highlightBox.parent !== this.scene) {
      this.scene.add(this.highlightBox);
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

    let anyVisible = false;

    // Actualizar visibilidad de los grupos de caras
    for (let i = 0; i < faceChecks.length; i++) {
      const [dx, dy, dz] = faceChecks[i];
      const nx = blockX + dx;
      const ny = blockY + dy;
      const nz = blockZ + dz;
      
      const isVisible = shouldShowOutline(nx, ny, nz);
      if (isVisible) {
        anyVisible = true;
      }
      
      // Actualizar visibilidad del grupo de esta cara
      if (i < this.faceGroups.length) {
        this.faceGroups[i].visible = isVisible;
      }
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
    // Eliminar todas las líneas gruesas
    this.fatLines.forEach(line => line.mesh.geometry.dispose());
    this.fatLines = [];
    
    // Limpiar grupos
    this.faceGroups = [];
    
    // Eliminar el grupo principal
    if (this.highlightBox && this.highlightBox.parent) {
      this.highlightBox.parent.remove(this.highlightBox);
    }
    
    // No eliminamos el material aquí ya que podría ser compartido externamente
  }
}
