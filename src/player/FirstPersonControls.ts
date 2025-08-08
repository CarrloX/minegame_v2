import * as THREE from 'three';

export class FirstPersonControls {
    public camera: THREE.Camera;
    public domElement: HTMLElement;

    public isLocked = false;

    private euler = new THREE.Euler(0, 0, 0, 'YXZ');

    public minPolarAngle = 0;
    public maxPolarAngle = Math.PI;

    constructor(camera: THREE.Camera, domElement: HTMLElement) {
        this.camera = camera;
        this.domElement = domElement;

        this.connect();
    }

    private onMouseMove = (event: MouseEvent) => {
        if (!this.isLocked) return;

        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        this.euler.setFromQuaternion(this.camera.quaternion);

        this.euler.y -= movementX * 0.002;
        this.euler.x -= movementY * 0.002;

        this.euler.x = Math.max(Math.PI / 2 - this.maxPolarAngle, Math.min(Math.PI / 2 - this.minPolarAngle, this.euler.x));

        this.camera.quaternion.setFromEuler(this.euler);
    };

    private onPointerLockChange = () => {
        this.isLocked = this.domElement.ownerDocument.pointerLockElement === this.domElement;
    };

    private onPointerLockError = () => {
        console.error('FirstPersonControls: Unable to lock pointer');
    };

    public connect() {
        this.domElement.ownerDocument.addEventListener('mousemove', this.onMouseMove);
        this.domElement.ownerDocument.addEventListener('pointerlockchange', this.onPointerLockChange);
        this.domElement.ownerDocument.addEventListener('pointerlockerror', this.onPointerLockError);
    }

    public disconnect() {
        this.domElement.ownerDocument.removeEventListener('mousemove', this.onMouseMove);
        this.domElement.ownerDocument.removeEventListener('pointerlockchange', this.onPointerLockChange);
        this.domElement.ownerDocument.removeEventListener('pointerlockerror', this.onPointerLockError);
    }

    public lock() {
        this.domElement.requestPointerLock();
    }

    public unlock() {
        this.domElement.ownerDocument.exitPointerLock();
    }

    public getDirection(forward: THREE.Vector3, right: THREE.Vector3) {
        // Get the camera's forward direction
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        // Get the camera's right direction
        right.copy(forward);
        right.cross(this.camera.up);
    }
}
