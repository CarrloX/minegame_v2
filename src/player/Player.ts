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
    private readonly MOVE_SPEED = 5.0;
    private readonly SPRINT_MULTIPLIER = 2.0;
    private readonly MOUSE_SENSITIVITY = 0.002;
    
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

        const movementX = event.movementX || (event as any).mozMovementX || 0;
        const movementY = event.movementY || (event as any).mozMovementY || 0;

        // Update yaw and pitch based on mouse movement
        // Invert Y-axis for more intuitive mouse movement
        this.yaw -= movementX * this.MOUSE_SENSITIVITY;
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch + movementY * this.MOUSE_SENSITIVITY));

        // Update camera rotation
        this.updateCameraRotation();
        
        // Debug: Log current rotation
        // console.log(`Yaw: ${(this.yaw * 180 / Math.PI).toFixed(1)}°, Pitch: ${(this.pitch * 180 / Math.PI).toFixed(1)}°`);
    }

    private onPointerLockChange(): void {
        this.isMouseLocked = document.pointerLockElement !== null;
    }

    private updateCameraRotation(): void {
        // Calculate new direction vector from yaw and pitch
        this.direction.x = Math.cos(this.pitch) * Math.cos(this.yaw);
        this.direction.y = Math.sin(this.pitch);
        this.direction.z = Math.cos(this.pitch) * Math.sin(this.yaw);
        this.direction.normalize();

        // Update camera rotation
        this.camera.rotation.x = -this.pitch;
        this.camera.rotation.y = -this.yaw;
    }

    public update(deltaTime: number): void {
        // Calculate movement speed
        const speed = (this.sprint ? this.SPRINT_MULTIPLIER : 1.0) * this.MOVE_SPEED * deltaTime;
        
        // Reset velocity
        this.velocity.set(0, 0, 0);

        // Calculate movement direction based on camera orientation
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

        // Apply movement based on key states
        if (this.moveForward) this.velocity.add(forward.multiplyScalar(speed));
        if (this.moveBackward) this.velocity.sub(forward.multiplyScalar(speed));
        if (this.moveLeft) this.velocity.sub(right.multiplyScalar(speed));
        if (this.moveRight) this.velocity.add(right.multiplyScalar(speed));
        if (this.moveUp) this.velocity.y += speed;
        if (!this.moveUp && !this.moveDown) this.velocity.y = 0;

        // Update position
        this.position.add(this.velocity);
        
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