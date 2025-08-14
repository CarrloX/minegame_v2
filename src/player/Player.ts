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
    private lastRaycastTime: number = 0;
    private readonly RAYCAST_DISTANCE = 5; // Maximum raycast distance
    private readonly RAYCAST_MAX_AGE = 100; // Maximum age of cached raycast in milliseconds

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
     * Raycast using 3D DDA (Amanatides & Woo) for precise and fast voxel traversal.
     * This implementation provides accurate block face detection and handles edge cases.
     */
    public raycast(forceUpdate: boolean = false): RaycastResult | null {
        // Return cached result if it's still valid and not forcing an update
        const now = performance.now();
        if (!forceUpdate && this.lastRaycastResult && (now - this.lastRaycastTime) < this.RAYCAST_MAX_AGE) {
            return this.lastRaycastResult;
        }

        const origin = this.camera.position.clone();
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        direction.normalize();

        // Calculate ray direction components
        const dirX = direction.x;
        const dirY = direction.y;
        const dirZ = direction.z;

        // Current block coordinates (integer)
        let x = Math.floor(origin.x);
        let y = Math.floor(origin.y);
        let z = Math.floor(origin.z);

        // Ray direction sign for stepping
        const stepX = dirX > 0 ? 1 : -1;
        const stepY = dirY > 0 ? 1 : -1;
        const stepZ = dirZ > 0 ? 1 : -1;

        // Calculate distance to next grid cell
        const nextX = stepX > 0 ? Math.floor(origin.x) + 1 : Math.ceil(origin.x - 1);
        const nextY = stepY > 0 ? Math.floor(origin.y) + 1 : Math.ceil(origin.y - 1);
        const nextZ = stepZ > 0 ? Math.floor(origin.z) + 1 : Math.ceil(origin.z - 1);

        // Calculate t values for when the ray crosses x, y, and z voxel boundaries
        let tMaxX = dirX !== 0 ? (nextX - origin.x) / dirX : Number.MAX_VALUE;
        let tMaxY = dirY !== 0 ? (nextY - origin.y) / dirY : Number.MAX_VALUE;
        let tMaxZ = dirZ !== 0 ? (nextZ - origin.z) / dirZ : Number.MAX_VALUE;

        // The change in t when taking a step (always positive)
        const tDeltaX = dirX !== 0 ? stepX / dirX : Number.MAX_VALUE;
        const tDeltaY = dirY !== 0 ? stepY / dirY : Number.MAX_VALUE;
        const tDeltaZ = dirZ !== 0 ? stepZ / dirZ : Number.MAX_VALUE;

        // Track which axis we stepped on (for normal calculation)
        let faceX = 0, faceY = 0, faceZ = 0;
        
        // Current t value (distance along ray)
        let t = 0;
        
        // Maximum distance to check
        const maxDistance = this.RAYCAST_DISTANCE;

        // Safety counter to prevent infinite loops
        const maxSteps = 2 * Math.ceil(maxDistance);
        let steps = 0;

        // DDA loop
        while (t <= maxDistance && steps < maxSteps) {
            // Check if current block is solid
            const block = this.world.getBlock(x, y, z);
            if (block !== undefined && block !== BlockType.AIR) {
                // Calculate face normal based on which boundary we hit
                const normal = new THREE.Vector3();
                
                // Find which face was hit by checking which t was the smallest
                if (t === tMaxX + tDeltaX * faceX) {
                    normal.set(-stepX, 0, 0);
                } else if (t === tMaxY + tDeltaY * faceY) {
                    normal.set(0, -stepY, 0);
                } else {
                    normal.set(0, 0, -stepZ);
                }

                const result: RaycastResult = {
                    position: new THREE.Vector3(x, y, z),
                    normal: normal.normalize(),
                    blockType: block,
                    distance: t
                };
                
                this.lastRaycastResult = result;
                this.lastRaycastTime = now;
                return result;
            }

            // Step to next voxel
            if (tMaxX < tMaxY) {
                if (tMaxX < tMaxZ) {
                    t = tMaxX;
                    tMaxX += tDeltaX;
                    x += stepX;
                    faceX++;
                } else {
                    t = tMaxZ;
                    tMaxZ += tDeltaZ;
                    z += stepZ;
                    faceZ++;
                }
            } else {
                if (tMaxY < tMaxZ) {
                    t = tMaxY;
                    tMaxY += tDeltaY;
                    y += stepY;
                    faceY++;
                } else {
                    t = tMaxZ;
                    tMaxZ += tDeltaZ;
                    z += stepZ;
                    faceZ++;
                }
            }
            
            steps++;
        }

        // No block hit within max distance
        this.lastRaycastResult = null;
        this.lastRaycastTime = now;
        return null;
    }

    /**
     * Obtiene el resultado del último raycast realizado
     */
    /**
     * Gets the last raycast result, performing a new raycast if the cached result is too old
     * @param forceRefresh If true, always perform a new raycast
     * @returns The raycast result or null if no block was hit
     */
    public getLastRaycastResult(forceRefresh: boolean = false): RaycastResult | null {
        const now = performance.now();
        const isStale = now - this.lastRaycastTime > this.RAYCAST_MAX_AGE;
        
        if (forceRefresh || isStale || this.lastRaycastResult === null) {
            return this.raycast();
        }
        return this.lastRaycastResult;
    }

    /**
     * Performs a fresh raycast and updates the last raycast result
     * @returns The raycast result or null if no block was hit
     */
    public updateRaycast(): RaycastResult | null {
        return this.raycast();
    }

    public update(deltaTime: number): void {
        // Update raycast first with force=true to ensure fresh data for this frame
        this.raycast(true);

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
