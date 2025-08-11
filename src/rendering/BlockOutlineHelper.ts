import * as THREE from 'three';
import { World } from '../world/World';
import { BlockType } from '../world/BlockType';

export interface HighlightedBlock {
    position: THREE.Vector3;
    originalType: BlockType;
}

export class BlockOutlineHelper {
    private scene: THREE.Scene;
    private world: World;
    private highlightBox: THREE.Group | null = null;
    private highlightEdges: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];

    constructor(scene: THREE.Scene, world: World) {
        this.scene = scene;
        this.world = world;
        this.initializeHighlightBox();
    }

    /**
     * Inicializa el contorno del bloque
     */
    private initializeHighlightBox(): void {
        try {
            console.log('Initializing highlight box...');
            
            // Crear un grupo para contener los bordes visibles
            this.highlightBox = new THREE.Group();
            this.highlightBox.visible = false;
            
            // Crear materiales para los bordes
            const edgeMaterial = new THREE.LineBasicMaterial({ 
                color: 0x000000, // Color negro
                linewidth: 2,    // Grosor de la línea
                transparent: true,
                opacity: 0.9,    // Ligeramente transparente
                depthTest: false,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });
            
            // Crear geometrías para cada borde del cubo
            const size = 0.501; // Mitad del tamaño del bloque + un pequeño offset
            
            // Función para crear un borde entre dos puntos
            const createEdge = (start: THREE.Vector3, end: THREE.Vector3) => {
                const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
                return new THREE.Line(geometry, edgeMaterial);
            };
            
            // Crear los 12 bordes del cubo
            const edges = [
                // Bordes inferiores (y = -size)
                createEdge(
                    new THREE.Vector3(-size, -size, -size),
                    new THREE.Vector3(size, -size, -size)
                ),
                createEdge(
                    new THREE.Vector3(size, -size, -size),
                    new THREE.Vector3(size, -size, size)
                ),
                createEdge(
                    new THREE.Vector3(size, -size, size),
                    new THREE.Vector3(-size, -size, size)
                ),
                createEdge(
                    new THREE.Vector3(-size, -size, size),
                    new THREE.Vector3(-size, -size, -size)
                ),
                // Bordes superiores (y = size)
                createEdge(
                    new THREE.Vector3(-size, size, -size),
                    new THREE.Vector3(size, size, -size)
                ),
                createEdge(
                    new THREE.Vector3(size, size, -size),
                    new THREE.Vector3(size, size, size)
                ),
                createEdge(
                    new THREE.Vector3(size, size, size),
                    new THREE.Vector3(-size, size, size)
                ),
                createEdge(
                    new THREE.Vector3(-size, size, size),
                    new THREE.Vector3(-size, size, -size)
                ),
                // Bordes verticales
                createEdge(
                    new THREE.Vector3(-size, -size, -size),
                    new THREE.Vector3(-size, size, -size)
                ),
                createEdge(
                    new THREE.Vector3(size, -size, -size),
                    new THREE.Vector3(size, size, -size)
                ),
                createEdge(
                    new THREE.Vector3(size, -size, size),
                    new THREE.Vector3(size, size, size)
                ),
                createEdge(
                    new THREE.Vector3(-size, -size, size),
                    new THREE.Vector3(-size, size, size)
                )
            ];
            
            // Almacenar referencias a los bordes para su manipulación posterior
            this.highlightEdges = edges;
            
            // Añadir todos los bordes al grupo
            edges.forEach(edge => this.highlightBox?.add(edge));
            
            // Añadir el grupo a la escena
            this.scene.add(this.highlightBox);
            
            console.log('BlockOutlineHelper initialized with', edges.length, 'edges');
        } catch (error) {
            console.error('Error initializing BlockOutlineHelper:', error);
        }
    }

    /**
     * Actualiza la posición y visibilidad del contorno del bloque
     * @param position Posición del bloque a resaltar, o null para ocultar el contorno
     */
    public updateHighlightBox(position: THREE.Vector3 | null): void {
        if (!this.highlightBox || !this.highlightEdges.length) {
            console.warn('BlockOutlineHelper not properly initialized');
            return;
        }
        
        if (!position) {
            this.highlightBox.visible = false;
            return;
        }
        
        const blockX = Math.floor(position.x);
        const blockY = Math.floor(position.y);
        const blockZ = Math.floor(position.z);
        const centerX = blockX + 0.5;
        const centerY = blockY + 0.5;
        const centerZ = blockZ + 0.5;
        
        // Posicionar el grupo de bordes en el centro del bloque
        this.highlightBox.position.set(centerX, centerY, centerZ);
        
        // Verificar qué caras del bloque son visibles
        const isFaceVisible = (dx: number, dy: number, dz: number): boolean => {
            const checkX = blockX + dx;
            const checkY = blockY + dy;
            const checkZ = blockZ + dz;
            
            // Verificar si hay un bloque en la dirección opuesta a la normal de la cara
            const block = this.world.getBlock(checkX, checkY, checkZ);
            return block === BlockType.AIR || block === undefined;
        };
        
        // Definir qué bordes pertenecen a cada cara
        const faceEdges = [
            [0, 1, 2, 3],   // Cara inferior (Y-)
            [4, 5, 6, 7],   // Cara superior (Y+)
            [0, 4, 8, 9],   // Cara frontal (Z-)
            [2, 6, 10, 11], // Cara trasera (Z+)
            [0, 2, 4, 6],   // Cara izquierda (X-)
            [1, 3, 5, 7]    // Cara derecha (X+)
        ];
        
        // Normales para cada cara (X, Y, Z)
        const faceNormals = [
            [0, -1, 0],  // Abajo
            [0, 1, 0],   // Arriba
            [0, 0, -1],  // Frente
            [0, 0, 1],   // Atrás
            [-1, 0, 0],  // Izquierda
            [1, 0, 0]    // Derecha
        ];
        
        // Determinar qué caras son visibles
        const visibleFaces = faceNormals.map(([dx, dy, dz], i) => {
            return isFaceVisible(dx, dy, dz) ? i : -1;
        }).filter(i => i !== -1);
        
        // Determinar qué bordes son visibles (sin duplicados)
        const visibleEdges = new Set<number>();
        visibleFaces.forEach(faceIdx => {
            faceEdges[faceIdx].forEach(edgeIdx => visibleEdges.add(edgeIdx));
        });
        
        // Actualizar visibilidad de cada borde
        this.highlightEdges.forEach((edge, index) => {
            edge.visible = visibleEdges.has(index);
        });
        
        // Mostrar el grupo de bordes
        this.highlightBox.visible = true;
        this.highlightBox.updateMatrix();
        this.highlightBox.updateMatrixWorld(true);
    }

    /**
     * Limpia los recursos utilizados por el helper
     */
    public dispose(): void {
        if (this.highlightBox) {
            // Eliminar bordes de la escena
            this.highlightBox.clear();
            this.scene.remove(this.highlightBox);
            
            // Liberar recursos de los bordes
            this.highlightEdges.forEach(edge => {
                edge.geometry.dispose();
                if (Array.isArray(edge.material)) {
                    edge.material.forEach(material => material.dispose());
                } else {
                    edge.material.dispose();
                }
            });
            
            this.highlightEdges = [];
            this.highlightBox = null;
        }
    }
}
