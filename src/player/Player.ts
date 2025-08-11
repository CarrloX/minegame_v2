import * as THREE from 'three';
import { FirstPersonControls } from './FirstPersonControls';
import { World } from '../world/World';
import { BlockType } from '../world/BlockType';

export interface RaycastResult {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  blockType: BlockType | null;
  distance: number;
}

export class Player {
    public camera: THREE.PerspectiveCamera;
    private controls: FirstPersonControls;
    private world: World;

    public position: THREE.Vector3;
    public velocity: THREE.Vector3;
    public onGround = false;

    private readonly speed = 5.0;
    private readonly jumpForce = 8.0;
    private readonly gravity = -20.0;

    private keys: { [key: string]: boolean } = {};
    private raycaster: THREE.Raycaster;
    private lastRaycastResult: RaycastResult | null = null;
    private readonly RAYCAST_DISTANCE = 5; // Distancia máxima del rayo

    public constructor(camera: THREE.PerspectiveCamera, controls: FirstPersonControls, world: World) {
        this.camera = camera;
        this.controls = controls;
        this.world = world;

        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();

        this.initEventListeners();
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = this.RAYCAST_DISTANCE;
    }

    private initEventListeners() {
        document.addEventListener('keydown', (event) => this.onKeyDown(event));
        document.addEventListener('keyup', (event) => this.onKeyUp(event));
    }

    private onKeyDown(event: KeyboardEvent) {
        this.keys[event.key.toLowerCase()] = true;
    }

    private onKeyUp(event: KeyboardEvent) {
        this.keys[event.key.toLowerCase()] = false;
    }

    private checkCollision(position: THREE.Vector3): boolean {
        const playerBoundingBox = new THREE.Box3(
            new THREE.Vector3(position.x - 0.3, position.y, position.z - 0.3),
            new THREE.Vector3(position.x + 0.3, position.y + 1.8, position.z + 0.3)
        );

        const minX = Math.floor(playerBoundingBox.min.x);
        const maxX = Math.ceil(playerBoundingBox.max.x);
        const minY = Math.floor(playerBoundingBox.min.y);
        const maxY = Math.ceil(playerBoundingBox.max.y);
        const minZ = Math.floor(playerBoundingBox.min.z);
        const maxZ = Math.ceil(playerBoundingBox.max.z);

        for (let y = minY; y < maxY; y++) {
            for (let x = minX; x < maxX; x++) {
                for (let z = minZ; z < maxZ; z++) {
                    const block = this.world.getBlock(x, y, z);
                    if (block !== BlockType.AIR) {
                        const blockBoundingBox = new THREE.Box3(
                            new THREE.Vector3(x, y, z),
                            new THREE.Vector3(x + 1, y + 1, z + 1)
                        );
                        if (playerBoundingBox.intersectsBox(blockBoundingBox)) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * Realiza un raycast desde la cámara en la dirección de la mirada
     * @returns Información sobre el bloque apuntado o null si no hay colisión
     */
    public raycast(): RaycastResult | null {
        if (!this.world) {
            console.log('Raycast: No world available');
            return null;
        }

        // Configurar el rayo desde la cámara en la dirección de la mirada
        const mouse = new THREE.Vector2(0, 0); // Centro de la pantalla
        this.raycaster.setFromCamera(mouse, this.camera);
        
        // Obtener la dirección del rayo
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        
        // Mostrar información de depuración
        console.log('Camera position:', this.camera.position);
        console.log('Ray direction:', direction);
        
        // Crear un rayo desde la posición de la cámara en la dirección de la mirada
        const ray = new THREE.Ray(this.camera.position, direction);
        
        // Parámetros para el raycasting
        const step = 0.1; // Tamaño del paso para el raycasting (más pequeño = más preciso pero más costoso)
        const maxDistance = this.RAYCAST_DISTANCE;
        
        console.log(`Starting raycast from ${this.camera.position.x}, ${this.camera.position.y}, ${this.camera.position.z}`);
        
        // Realizar el raycasting manualmente para detectar bloques
        for (let distance = 0; distance <= maxDistance; distance += step) {
            // Calcular la posición actual del rayo
            const position = new THREE.Vector3();
            ray.at(distance, position);
            
            // Obtener la posición del bloque en coordenadas enteras
            const blockPos = new THREE.Vector3(
                Math.floor(position.x + 0.5 * Math.sign(direction.x)),
                Math.floor(position.y + 0.5 * Math.sign(direction.y)),
                Math.floor(position.z + 0.5 * Math.sign(direction.z))
            );
            
            // Verificar si hay un bloque en esta posición
            const blockType = this.world.getBlock(blockPos.x, blockPos.y, blockPos.z);
            
            console.log(`Checking block at ${blockPos.x}, ${blockPos.y}, ${blockPos.z}:`, 
                       blockType !== undefined ? BlockType[blockType] : 'undefined');
            
            if (blockType !== undefined && blockType !== BlockType.AIR) {
                // Calcular la normal de la cara del bloque
                const normal = new THREE.Vector3(
                    Math.round(position.x - blockPos.x),
                    Math.round(position.y - blockPos.y),
                    Math.round(position.z - blockPos.z)
                );
                
                // Si la normal es cero (raro, pero por si acaso)
                if (normal.lengthSq() === 0) normal.set(0, 1, 0);
                
                // Crear y devolver el resultado
                const result: RaycastResult = {
                    position: blockPos,
                    normal: normal.normalize(),
                    blockType,
                    distance
                };
                
                console.log('Block hit!', result);
                this.lastRaycastResult = result;
                return result;
            }
        }
        
        this.lastRaycastResult = null;
        return null;
    }
    
    /**
     * Obtiene el resultado del último raycast realizado
     */
    public getLastRaycastResult(): RaycastResult | null {
        return this.lastRaycastResult;
    }

    public update(deltaTime: number): void {
        // Actualizar el raycast en cada fotograma
        this.raycast();
        
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        this.controls.getDirection(forward, right);

        const moveDirection = new THREE.Vector3();
        if (this.keys['w']) moveDirection.add(forward);
        if (this.keys['s']) moveDirection.sub(forward);
        if (this.keys['d']) moveDirection.add(right);
        if (this.keys['a']) moveDirection.sub(right);

        if (moveDirection.length() > 0) {
            moveDirection.normalize();
        }

        this.velocity.x = moveDirection.x * this.speed;
        this.velocity.z = moveDirection.z * this.speed;

        if (this.keys[' '] && this.onGround) {
            this.velocity.y = this.jumpForce;
            this.onGround = false;
        }

        this.velocity.y += this.gravity * deltaTime;

        const newPosition = this.position.clone();

        // Y-axis collision
        newPosition.y += this.velocity.y * deltaTime;
        if (this.checkCollision(newPosition)) {
            if (this.velocity.y < 0) {
                this.onGround = true;
            }
            this.velocity.y = 0;
            newPosition.y = this.position.y;
        } else {
            this.onGround = false;
        }

        // X-axis collision
        newPosition.x += this.velocity.x * deltaTime;
        if (this.checkCollision(newPosition)) {
            this.velocity.x = 0;
            newPosition.x = this.position.x;
        }

        // Z-axis collision
        newPosition.z += this.velocity.z * deltaTime;
        if (this.checkCollision(newPosition)) {
            this.velocity.z = 0;
            newPosition.z = this.position.z;
        }

        this.position.copy(newPosition);



        this.camera.position.copy(this.position);
        this.camera.position.y += 1.6; // Player eye height
    }

    public dispose() {
        this.controls.disconnect();
        document.removeEventListener('keydown', (event) => this.onKeyDown(event));
        document.removeEventListener('keyup', (event) => this.onKeyUp(event));
    }
}