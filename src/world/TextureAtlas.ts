import { BlockType } from './BlockType';

/**
 * Texture atlas configuration and utilities
 */
export namespace TextureAtlas {
    // Texture atlas configuration
    export const ATLAS_SIZE = 2; // Number of textures per row/column in the atlas
    export const TEXTURE_SIZE = 1 / ATLAS_SIZE; // Size of each texture in UV coordinates (0-1)

    // Texture coordinates for each block type and face
    export interface TextureCoords {
        x: number;
        y: number;
        w?: number; // width in texture units (default: 1)
        h?: number; // height in texture units (default: 1)
    }

    // Texture coordinates for each block type
    export const TEXTURE_COORDS: Record<BlockType, TextureCoords> = {
        [BlockType.AIR]: { x: 0, y: 0 },
        [BlockType.GRASS]: { x: 0, y: 0 },  // Top of grass
        [BlockType.DIRT]: { x: 0, y: 1 },   // Dirt (same as bottom of grass)
        [BlockType.STONE]: { x: 1, y: 1 },  // Stone
        [BlockType.SAND]: { x: 1, y: 0 },   // Sand
        [BlockType.WOOD]: { x: 0, y: 2 },   // Wood/log
        [BlockType.LEAVES]: { x: 1, y: 2 }, // Leaves
        [BlockType.GRASS_SIDE]: { x: 2, y: 0 } // Side of grass
    };

    /**
     * Gets the UV coordinates for a specific block face
     */
    export function getUvCoords(blockType: BlockType, face: string): number[][];
    export function getUvCoords(blockType: BlockType, face: string, out: number[][]): void;
    export function getUvCoords(blockType: BlockType, face: string, out?: number[][]) {
        // Handle special cases for grass blocks
        let texKey = blockType;
        let isGrassSide = false;
        
        if (blockType === BlockType.GRASS) {
            if (face === 'top') {
                texKey = BlockType.GRASS;
            } else if (face === 'bottom') {
                texKey = BlockType.DIRT;
            } else {
                texKey = BlockType.GRASS_SIDE;
                isGrassSide = true;
            }
        }

        const coords = TEXTURE_COORDS[texKey] || TEXTURE_COORDS[BlockType.STONE];
        const w = coords.w ?? 1;
        const h = coords.h ?? 1;
        
        // Calculate UV coordinates
        // Special handling for grass side texture which is outside the standard atlas grid
        let x, y, width, height;
        
        if (isGrassSide) {
            // For grass side, use the correct texture coordinates
            x = 0.5;   // Middle right of the texture atlas
            y = 0.5;   // Middle of the texture atlas
            width = 0.5;   // Half the texture atlas
            height = 0.5;  // Half the texture atlas
        } else {
            // Standard UV calculation for other blocks
            x = (coords.x % ATLAS_SIZE) * TEXTURE_SIZE;
            y = 1 - (Math.floor(coords.y) + 1) * TEXTURE_SIZE;
            width = TEXTURE_SIZE * w;
            height = TEXTURE_SIZE * h;
        }

        const result = isGrassSide ? [
            // For grass side, flip the texture vertically
            [x, y],  // Top-left
            [x + width, y],  // Top-right
            [x + width, y + height],  // Bottom-right
            [x, y + height]  // Bottom-left
        ] : [
            // Standard UV mapping for other blocks
            [x, y + height],  // Bottom-left
            [x + width, y + height],  // Bottom-right
            [x + width, y],  // Top-right
            [x, y]  // Top-left
        ];

        if (out) {
            // Reuse existing array to reduce garbage collection
            for (let i = 0; i < 4; i++) {
                out[i][0] = result[i][0];
                out[i][1] = result[i][1];
            }
        } else {
            return result;
        }
    }

    /**
     * Gets the texture coordinates for a specific block face
     * This version reuses the same array to reduce garbage collection
     */
    export function getUvCoordsReusable(blockType: BlockType, face: string, out: number[][]) {
        getUvCoords(blockType, face, out);
    }
}
