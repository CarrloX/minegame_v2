import * as THREE from 'three';
import { FirstPersonControls } from './FirstPersonControls';
import { World } from '../world/World';
import { BlockType } from '../world/BlockType';

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

    public constructor(camera: THREE.PerspectiveCamera, controls: FirstPersonControls, world: World) {
        this.camera = camera;
        this.controls = controls;
        this.world = world;

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

    public update(deltaTime: number): void {
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