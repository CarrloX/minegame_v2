import * as THREE from 'three';
import { FirstPersonControls } from './FirstPersonControls';

export class Player {
    public camera: THREE.Camera;
    public controls: FirstPersonControls;

    public position: THREE.Vector3;
    public velocity: THREE.Vector3;
    public onGround = false;

    private readonly speed = 5.0;
    private readonly jumpForce = 8.0;
    private readonly gravity = -20.0;

    private keys: { [key: string]: boolean } = {};

    constructor(camera: THREE.Camera, controls: FirstPersonControls) {
        this.camera = camera;
        this.controls = controls;

        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();

        this.initEventListeners();
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

    public update(deltaTime: number) {
        const moveSpeed = this.speed * deltaTime;

        if (this.keys['w']) this.controls.moveForward(moveSpeed);
        if (this.keys['s']) this.controls.moveForward(-moveSpeed);
        if (this.keys['a']) this.controls.moveRight(-moveSpeed);
        if (this.keys['d']) this.controls.moveRight(moveSpeed);

        if (this.keys[' '] && this.onGround) {
            this.velocity.y = this.jumpForce;
            this.onGround = false;
        }

        this.velocity.y += this.gravity * deltaTime;
        this.camera.position.y += this.velocity.y * deltaTime;

        if (this.camera.position.y < 1.8) {
            this.velocity.y = 0;
            this.camera.position.y = 1.8;
            this.onGround = true;
        }

        this.position.copy(this.camera.position);
    }

    public dispose() {
        this.controls.disconnect();
        document.removeEventListener('keydown', (event) => this.onKeyDown(event));
        document.removeEventListener('keyup', (event) => this.onKeyUp(event));
    }
}