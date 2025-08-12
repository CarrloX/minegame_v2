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

    // Bound listeners so we can remove them correctly
    private boundOnKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    private boundOnKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);

    private lastRaycastResult: RaycastResult | null = null;
    private readonly RAYCAST_DISTANCE = 5; // Distancia máxima del rayo

    public constructor(camera: THREE.PerspectiveCamera, controls: FirstPersonControls, world: World) {
        this.camera = camera;
        this.controls = controls;
        this.world = world;

        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();

        this.initEventListeners();
    }

    private initEventListeners() {
        document.addEventListener('keydown', this.boundOnKeyDown);
        document.addEventListener('keyup', this.boundOnKeyUp);
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
     * Raycast using 3D DDA (Amanatides & Woo) which is precise and fast for voxels.
     */
    public raycast(): RaycastResult | null {
        const origin = this.camera.position.clone();
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        direction.normalize();

        const maxDistance = this.RAYCAST_DISTANCE;

        // Starting voxel
        let vx = Math.floor(origin.x);
        let vy = Math.floor(origin.y);
        let vz = Math.floor(origin.z);

        // If origin is exactly on integer boundary and direction negative, shift starting voxel
        // (not strictly necessary but helps edge cases)
        if (origin.x === vx && direction.x < 0) vx--;
        if (origin.y === vy && direction.y < 0) vy--;
        if (origin.z === vz && direction.z < 0) vz--;

        // Pre-check: if starting inside a solid block, skip it only if distance 0 (we probably want blocks in front)
        const startBlock = this.world.getBlock(vx, vy, vz);
        if (startBlock !== undefined && startBlock !== BlockType.AIR) {
            // If camera is inside a block, advance a tiny bit along direction
            // so we don't immediately hit the block we're inside.
            origin.add(direction.clone().multiplyScalar(0.01));
            vx = Math.floor(origin.x);
            vy = Math.floor(origin.y);
            vz = Math.floor(origin.z);
        }

        // Setup DDA
        const stepX = direction.x > 0 ? 1 : (direction.x < 0 ? -1 : 0);
        const stepY = direction.y > 0 ? 1 : (direction.y < 0 ? -1 : 0);
        const stepZ = direction.z > 0 ? 1 : (direction.z < 0 ? -1 : 0);

        const tDeltaX = stepX !== 0 ? Math.abs(1 / direction.x) : Infinity;
        const tDeltaY = stepY !== 0 ? Math.abs(1 / direction.y) : Infinity;
        const tDeltaZ = stepZ !== 0 ? Math.abs(1 / direction.z) : Infinity;

        const fracX = origin.x - Math.floor(origin.x);
        const fracY = origin.y - Math.floor(origin.y);
        const fracZ = origin.z - Math.floor(origin.z);

        let tMaxX = stepX > 0 ? (1 - fracX) * tDeltaX : (fracX) * tDeltaX;
        let tMaxY = stepY > 0 ? (1 - fracY) * tDeltaY : (fracY) * tDeltaY;
        let tMaxZ = stepZ > 0 ? (1 - fracZ) * tDeltaZ : (fracZ) * tDeltaZ;

        // current traveled distance
        let traveled = 0;

        // If direction component is zero, tMax might be NaN; ensure Infinity
        if (!isFinite(tMaxX)) tMaxX = Infinity;
        if (!isFinite(tMaxY)) tMaxY = Infinity;
        if (!isFinite(tMaxZ)) tMaxZ = Infinity;

        // DDA loop
        const maxIterations = 1000; // safety cap
        for (let i = 0; i < maxIterations && traveled <= maxDistance; i++) {
            // Check block at current voxel
            const block = this.world.getBlock(vx, vy, vz);
            if (block !== undefined && block !== BlockType.AIR) {
                // We hit a block at voxel (vx,vy,vz).
                // The hit distance is traveled (approx). Build normal based on last stepped axis.
                // But we need to determine which face we entered from. When starting, none stepped yet;
                // approximate by looking at which tMax was smallest in previous iteration — easier is:
                // Determine the minimal of the three tMax values (the one causing the step).
                // We can reconstruct normal by checking which side the ray came from:
                const nx = 0, ny = 0, nz = 0;
                let normal = new THREE.Vector3();

                // To infer normal, look at which tMax was smallest in the step that placed us here.
                // Since we haven't stored that, easier approach: compute signed distances to block center:
                const hitPos = origin.clone().add(direction.clone().multiplyScalar(traveled));
                const localX = hitPos.x - vx - 0.5;
                const localY = hitPos.y - vy - 0.5;
                const localZ = hitPos.z - vz - 0.5;
                const ax = Math.abs(localX), ay = Math.abs(localY), az = Math.abs(localZ);
                if (ax > ay && ax > az) {
                    normal.set(localX > 0 ? 1 : -1, 0, 0);
                } else if (ay > az) {
                    normal.set(0, localY > 0 ? 1 : -1, 0);
                } else {
                    normal.set(0, 0, localZ > 0 ? 1 : -1);
                }

                const result: RaycastResult = {
                    position: new THREE.Vector3(vx, vy, vz),
                    normal: normal.normalize(),
                    blockType: block,
                    distance: traveled
                };
                this.lastRaycastResult = result;
                return result;
            }

            // Advance DDA: choose smallest tMax
            if (tMaxX < tMaxY) {
                if (tMaxX < tMaxZ) {
                    // step x
                    vx += stepX;
                    traveled = tMaxX;
                    tMaxX += tDeltaX;
                } else {
                    // step z
                    vz += stepZ;
                    traveled = tMaxZ;
                    tMaxZ += tDeltaZ;
                }
            } else {
                if (tMaxY < tMaxZ) {
                    // step y
                    vy += stepY;
                    traveled = tMaxY;
                    tMaxY += tDeltaY;
                } else {
                    // step z
                    vz += stepZ;
                    traveled = tMaxZ;
                    tMaxZ += tDeltaZ;
                }
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
        // Update raycast first so other subsystems can use it
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
        document.removeEventListener('keydown', this.boundOnKeyDown);
        document.removeEventListener('keyup', this.boundOnKeyUp);
    }
}
