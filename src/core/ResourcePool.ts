import * as THREE from 'three';

/**
 * Resource pooling system for BufferGeometry and BufferAttribute objects
 * Reduces garbage collection pressure by reusing objects instead of creating/destroying them
 */

export enum GeometrySize {
    SMALL = 'small',     // < 10k vertices
    MEDIUM = 'medium',   // 10k - 50k vertices
    LARGE = 'large',     // 50k - 200k vertices
    XLARGE = 'xlarge'    // > 200k vertices
}

export class ResourcePool {
    private geometryPools: Map<GeometrySize, THREE.BufferGeometry[]> = new Map();
    private positionPools: Map<GeometrySize, THREE.BufferAttribute[]> = new Map();
    private normalPools: Map<GeometrySize, THREE.BufferAttribute[]> = new Map();
    private uvPools: Map<GeometrySize, THREE.BufferAttribute[]> = new Map();
    private indexPools: Map<GeometrySize, THREE.BufferAttribute[]> = new Map();

    private static instance: ResourcePool;

    private constructor() {
        // Initialize pools
        Object.values(GeometrySize).forEach(size => {
            this.geometryPools.set(size, []);
            this.positionPools.set(size, []);
            this.normalPools.set(size, []);
            this.uvPools.set(size, []);
            this.indexPools.set(size, []);
        });
    }

    public static getInstance(): ResourcePool {
        if (!ResourcePool.instance) {
            ResourcePool.instance = new ResourcePool();
        }
        return ResourcePool.instance;
    }

    /**
     * Determines the size category for a given vertex count
     */
    private getSizeCategory(vertexCount: number): GeometrySize {
        if (vertexCount < 10000) return GeometrySize.SMALL;
        if (vertexCount < 50000) return GeometrySize.MEDIUM;
        if (vertexCount < 200000) return GeometrySize.LARGE;
        return GeometrySize.XLARGE;
    }

    /**
     * Gets a BufferGeometry from the pool, or creates a new one if none available
     */
    public getGeometry(vertexCount: number): THREE.BufferGeometry {
        const sizeCategory = this.getSizeCategory(vertexCount);
        const pool = this.geometryPools.get(sizeCategory)!;

        if (pool.length > 0) {
            return pool.pop()!;
        }

        // Create new geometry
        return new THREE.BufferGeometry();
    }

    /**
     * Returns a BufferGeometry to the pool for reuse
     */
    public releaseGeometry(geometry: THREE.BufferGeometry): void {
        // Clear all attributes and indices
        geometry.dispose();

        // Determine size category (estimate based on attributes if available)
        let vertexCount = 0;
        const positionAttr = geometry.getAttribute('position');
        if (positionAttr) {
            vertexCount = positionAttr.count;
        }

        const sizeCategory = this.getSizeCategory(vertexCount);
        const pool = this.geometryPools.get(sizeCategory)!;

        // Limit pool size to prevent memory bloat
        if (pool.length < 10) {
            pool.push(geometry);
        } else {
            // Dispose if pool is full
            geometry.dispose();
        }
    }

    /**
     * Gets a BufferAttribute for positions from the pool
     */
    public getPositionAttribute(vertexCount: number): THREE.BufferAttribute {
        const sizeCategory = this.getSizeCategory(vertexCount);
        const pool = this.positionPools.get(sizeCategory)!;

        // Find an attribute with sufficient size
        for (let i = pool.length - 1; i >= 0; i--) {
            const attr = pool[i];
            if (attr.array.length >= vertexCount * 3) {
                pool.splice(i, 1);
                return attr;
            }
        }

        // Create new attribute if none found
        return new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
    }

    /**
     * Gets a BufferAttribute for normals from the pool
     */
    public getNormalAttribute(vertexCount: number): THREE.BufferAttribute {
        const sizeCategory = this.getSizeCategory(vertexCount);
        const pool = this.normalPools.get(sizeCategory)!;

        // Find an attribute with sufficient size
        for (let i = pool.length - 1; i >= 0; i--) {
            const attr = pool[i];
            if (attr.array.length >= vertexCount * 3) {
                pool.splice(i, 1);
                return attr;
            }
        }

        // Create new attribute if none found
        return new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
    }

    /**
     * Gets a BufferAttribute for UVs from the pool
     */
    public getUVAttribute(vertexCount: number): THREE.BufferAttribute {
        const sizeCategory = this.getSizeCategory(vertexCount);
        const pool = this.uvPools.get(sizeCategory)!;

        // Find an attribute with sufficient size
        for (let i = pool.length - 1; i >= 0; i--) {
            const attr = pool[i];
            if (attr.array.length >= vertexCount * 2) {
                pool.splice(i, 1);
                return attr;
            }
        }

        // Create new attribute if none found
        return new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2);
    }

    /**
     * Gets a BufferAttribute for indices from the pool
     */
    public getIndexAttribute(indexCount: number, _use32Bit: boolean = false): THREE.BufferAttribute {
        const sizeCategory = this.getSizeCategory(indexCount); // Rough approximation
        const pool = this.indexPools.get(sizeCategory)!;

        const needs32Bit = indexCount > 65535;

        // Find an attribute with matching type and sufficient size
        for (let i = pool.length - 1; i >= 0; i--) {
            const attr = pool[i];
            const is32Bit = attr.array instanceof Uint32Array;

            if (is32Bit === needs32Bit && attr.array.length >= indexCount) {
                pool.splice(i, 1);
                return attr;
            }
        }

        // Create new attribute if none found
        const array = needs32Bit ?
            new Uint32Array(indexCount) :
            new Uint16Array(indexCount);

        return new THREE.BufferAttribute(array, 1);
    }

    /**
     * Releases BufferAttributes back to their respective pools
     */
    public releaseAttribute(attribute: THREE.BufferAttribute, type: 'position' | 'normal' | 'uv' | 'index'): void {
        // Determine size category based on actual attribute count
        let sizeValue: number;
        switch (type) {
            case 'position':
            case 'normal':
                sizeValue = Math.floor(attribute.count / 3); // 3 components per vertex
                break;
            case 'uv':
                sizeValue = Math.floor(attribute.count / 2); // 2 components per vertex
                break;
            case 'index':
                sizeValue = attribute.count; // Direct count for indices
                break;
        }
        const sizeCategory = this.getSizeCategory(sizeValue);

        let pool: THREE.BufferAttribute[];
        switch (type) {
            case 'position':
                pool = this.positionPools.get(sizeCategory)!;
                break;
            case 'normal':
                pool = this.normalPools.get(sizeCategory)!;
                break;
            case 'uv':
                pool = this.uvPools.get(sizeCategory)!;
                break;
            case 'index':
                pool = this.indexPools.get(sizeCategory)!;
                break;
        }

        // Limit pool size to prevent memory bloat
        if (pool.length < 15) { // Slightly higher limit for attributes
            pool.push(attribute);
        }
        // If pool is full, the attribute will be garbage collected
    }

    /**
     * Clears all pools and disposes of all cached resources
     */
    public dispose(): void {
        // Dispose all geometries
        this.geometryPools.forEach(pool => {
            pool.forEach(geometry => geometry.dispose());
            pool.length = 0;
        });

        // Clear all attribute pools (attributes don't need explicit disposal)
        this.positionPools.forEach(pool => pool.length = 0);
        this.normalPools.forEach(pool => pool.length = 0);
        this.uvPools.forEach(pool => pool.length = 0);
        this.indexPools.forEach(pool => pool.length = 0);
    }

    /**
     * Gets pool statistics for debugging
     */
    public getStats(): {
        geometries: Record<GeometrySize, number>;
        attributes: {
            positions: Record<GeometrySize, number>;
            normals: Record<GeometrySize, number>;
            uvs: Record<GeometrySize, number>;
            indices: Record<GeometrySize, number>;
        };
    } {
        const geometries: Record<GeometrySize, number> = {} as any;
        this.geometryPools.forEach((pool, size) => {
            geometries[size] = pool.length;
        });

        const attributes = {
            positions: {} as Record<GeometrySize, number>,
            normals: {} as Record<GeometrySize, number>,
            uvs: {} as Record<GeometrySize, number>,
            indices: {} as Record<GeometrySize, number>
        };

        this.positionPools.forEach((pool, size) => attributes.positions[size] = pool.length);
        this.normalPools.forEach((pool, size) => attributes.normals[size] = pool.length);
        this.uvPools.forEach((pool, size) => attributes.uvs[size] = pool.length);
        this.indexPools.forEach((pool, size) => attributes.indices[size] = pool.length);

        return { geometries, attributes };
    }
}
