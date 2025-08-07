import * as THREE from 'three';

// Define movement keys
const MOVEMENT_KEYS = {
    FORWARD: 'w',
    BACKWARD: 's',
    LEFT: 'a',
    RIGHT: 'd',
    JUMP: ' ',
    SPRINT: 'Shift'
};

export class Player {
    // Camera that this player controls
    private camera: THREE.PerspectiveCamera;
    
    // Movement properties
    private position: THREE.Vector3;
    private velocity: THREE.Vector3;
    private direction: THREE.Vector3;
    
    // Movement state
    private moveForward = false;
    private moveBackward = false;
    private moveLeft = false;
    private moveRight = false;
    private moveUp = false;
    private moveDown = false;
    private sprint = false;
    
    // Movement parameters
    private readonly MOVE_SPEED = 4.3; // Bloques por segundo
    private readonly SPRINT_MULTIPLIER = 1.3; // Ajustado para ser más sutil
    private readonly MOUSE_SENSITIVITY = 0.0015; // Sensibilidad del mouse reducida
    private readonly GRAVITY = 30.0; // Gravedad
    private readonly JUMP_FORCE = 7.0; // Fuerza de salto
    private isOnGround = false; // Si el jugador está en el suelo
    
    // Rotation
    private yaw = -Math.PI / 2; // Y-axis rotation (left/right)
    private pitch = 0;           // X-axis rotation (up/down)
    
    // Mouse control
    private isMouseLocked = false;
    
    // Key state tracking
    private keysPressed = new Set<string>();

    constructor(camera: THREE.PerspectiveCamera, startPosition: THREE.Vector3 = new THREE.Vector3(0, 1.6, 0)) {
        this.camera = camera;
        this.position = startPosition.clone();
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3(0, 0, -1);
        
        // Initialize camera position and rotation
        this.camera.position.copy(this.position);
        this.updateCameraRotation();
        
        // Set up event listeners
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Keyboard event listeners
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        
        // Mouse movement
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        
        // Mouse lock controls
        const canvas = document.querySelector('canvas');
        if (canvas) {
            canvas.addEventListener('click', () => {
                canvas.requestPointerLock = canvas.requestPointerLock || 
                    (canvas as any).mozRequestPointerLock || 
                    (canvas as any).webkitRequestPointerLock;
                canvas.requestPointerLock();
            });
        }

        document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this), false);
        document.addEventListener('mozpointerlockchange', this.onPointerLockChange.bind(this), false);
        document.addEventListener('webkitpointerlockchange', this.onPointerLockChange.bind(this), false);
    }

    private onKeyDown(event: KeyboardEvent): void {
        const key = event.key.toLowerCase();
        this.keysPressed.add(key);

        // Solo cambiar el estado si la tecla no estaba ya presionada
        if (!event.repeat) {
            switch (key) {
                case MOVEMENT_KEYS.FORWARD:
                    this.moveForward = true;
                    break;
                case MOVEMENT_KEYS.BACKWARD:
                    this.moveBackward = true;
                    break;
                case MOVEMENT_KEYS.LEFT:
                    this.moveLeft = true;
                    break;
                case MOVEMENT_KEYS.RIGHT:
                    this.moveRight = true;
                    break;
                case MOVEMENT_KEYS.JUMP:
                    this.moveUp = true;
                    break;
                case MOVEMENT_KEYS.SPRINT:
                    this.sprint = true;
                    break;
            }
        }
    }

    private onKeyUp(event: KeyboardEvent): void {
        const key = event.key.toLowerCase();
        this.keysPressed.delete(key);

        switch (key) {
            case MOVEMENT_KEYS.FORWARD:
                this.moveForward = false;
                break;
            case MOVEMENT_KEYS.BACKWARD:
                this.moveBackward = false;
                break;
            case MOVEMENT_KEYS.LEFT:
                this.moveLeft = false;
                break;
            case MOVEMENT_KEYS.RIGHT:
                this.moveRight = false;
                break;
            case MOVEMENT_KEYS.JUMP:
                this.moveUp = false;
                break;
            case MOVEMENT_KEYS.SPRINT:
                this.sprint = false;
                break;
        }
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.isMouseLocked) return;

        // Obtener el movimiento del mouse con compatibilidad entre navegadores
        const movementX = event.movementX || (event as any).mozMovementX || (event as any).webkitMovementX || 0;
        const movementY = event.movementY || (event as any).mozMovementY || (event as any).webkitMovementY || 0;

        // Actualizar rotación horizontal (izquierda/derecha)
        this.yaw -= movementX * this.MOUSE_SENSITIVITY;
        
        // Actualizar rotación vertical (arriba/abajo) con límites para evitar volteretas
        this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, 
            this.pitch - movementY * this.MOUSE_SENSITIVITY));

        // Actualizar la rotación de la cámara
        this.updateCameraRotation();
    }

    private onPointerLockChange(): void {
        this.isMouseLocked = document.pointerLockElement !== null;
    }

    private updateCameraRotation(): void {
        // Calcular el vector de dirección basado en los ángulos de rotación
        this.direction.x = Math.cos(this.pitch) * Math.sin(this.yaw);
        this.direction.y = Math.sin(this.pitch);
        this.direction.z = Math.cos(this.pitch) * Math.cos(this.yaw);
        this.direction.normalize();

        // Actualizar la rotación de la cámara
        this.camera.rotation.x = -this.pitch;
        this.camera.rotation.y = -this.yaw;
        this.camera.rotation.z = 0; // Evitar inclinación lateral
    }

    public update(deltaTime: number): void {
        // Calcular velocidad de movimiento base
        const moveSpeed = this.MOVE_SPEED * (this.sprint ? this.SPRINT_MULTIPLIER : 1.0);
        const actualSpeed = moveSpeed * deltaTime;
        
        // Calcular direcciones de movimiento basadas en la orientación de la cámara
        const forward = new THREE.Vector3(
            Math.sin(this.yaw),
            0,
            Math.cos(this.yaw)
        ).normalize();

        const right = new THREE.Vector3(
            Math.sin(this.yaw + Math.PI / 2),
            0,
            Math.cos(this.yaw + Math.PI / 2)
        ).normalize();

        // Aplicar movimiento horizontal
        const moveX = (this.moveRight ? 1 : 0) - (this.moveLeft ? 1 : 0);
        const moveZ = (this.moveForward ? 1 : 0) - (this.moveBackward ? 1 : 0);
        
        // Calcular velocidad horizontal
        const moveDirection = new THREE.Vector3();
        if (moveZ !== 0) moveDirection.add(forward.multiplyScalar(moveZ));
        if (moveX !== 0) moveDirection.add(right.multiplyScalar(moveX));
        
        // Normalizar para movimiento diagonal
        if (moveX !== 0 && moveZ !== 0) {
            moveDirection.normalize();
        }
        
        // Aplicar velocidad horizontal
        this.velocity.x = moveDirection.x * actualSpeed;
        this.velocity.z = moveDirection.z * actualSpeed;
        
        // Aplicar gravedad
        this.velocity.y -= this.GRAVITY * deltaTime;
        
        // Manejar salto
        if (this.moveUp && this.isOnGround) {
            this.velocity.y = this.JUMP_FORCE;
            this.isOnGround = false;
        }
        
        // Actualizar posición
        this.position.x += this.velocity.x;
        this.position.z += this.velocity.z;
        
        // Aplicar gravedad y movimiento vertical
        this.position.y += this.velocity.y * deltaTime;
        
        // Detección básica de suelo (simplificada)
        if (this.position.y <= 0) {
            this.position.y = 0;
            this.velocity.y = 0;
            this.isOnGround = true;
        } else {
            this.isOnGround = false;
        }
        
        // Update camera position
        this.camera.position.copy(this.position);
    }

    public getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    public dispose(): void {
        // Clean up event listeners
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
        document.removeEventListener('mozpointerlockchange', this.onPointerLockChange);
        document.removeEventListener('webkitpointerlockchange', this.onPointerLockChange);
    }
}