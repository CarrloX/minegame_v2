import { BlockType } from '../blocks/BlockType';

export interface UVCoords {
    u: number;
    v: number;
    width: number;
    height: number;
}

export interface BlockTextureCoords {
    top: UVCoords;      // Top face texture
    side: UVCoords;     // Side face texture (front, back, left, right)
    bottom: UVCoords;   // Bottom face texture
}

// Size of each texture in the atlas (in pixels)
export const TEXTURE_SIZE = 16;

// Size of the entire atlas (in number of textures)
const ATLAS_SIZE = 16;

// Calculate UV coordinates based on grid position in the atlas
function getUVCoords(x: number, y: number, width: number = 1, height: number = 1): UVCoords {
    return {
        u: x / ATLAS_SIZE,
        v: y / ATLAS_SIZE,
        width: width / ATLAS_SIZE,
        height: height / ATLAS_SIZE
    };
}

// Define texture coordinates for each block type
export const BlockTextures: Record<BlockType, BlockTextureCoords> = {
    [BlockType.AIR]: {
        top: getUVCoords(0, 0),
        side: getUVCoords(0, 0),
        bottom: getUVCoords(0, 0)
    },
    [BlockType.GRASS]: {
        top: getUVCoords(0, 0),    // Grass top (green)
        side: getUVCoords(2, 0),   // Grass side (with green tint)
        bottom: getUVCoords(1, 0)  // Dirt (bottom of grass block)
    },
    [BlockType.DIRT]: {
        top: getUVCoords(1, 0),    // Dirt
        side: getUVCoords(1, 0),
        bottom: getUVCoords(1, 0)
    },
    [BlockType.STONE]: {
        top: getUVCoords(3, 0),    // Stone
        side: getUVCoords(3, 0),
        bottom: getUVCoords(3, 0)
    },
    [BlockType.SAND]: {
        top: getUVCoords(4, 0),    // Sand
        side: getUVCoords(4, 0),
        bottom: getUVCoords(4, 0)
    },
    [BlockType.WOOD]: {
        top: getUVCoords(5, 1),    // Wood top (tree rings)
        side: getUVCoords(5, 0),   // Wood side (bark)
        bottom: getUVCoords(5, 1)  // Wood bottom (tree rings)
    },
    [BlockType.LEAVES]: {
        top: getUVCoords(6, 0),    // Leaves
        side: getUVCoords(6, 0),
        bottom: getUVCoords(6, 0)
    },
    [BlockType.WATER]: {
        top: getUVCoords(7, 0),    // Water (semitransparent)
        side: getUVCoords(7, 0),
        bottom: getUVCoords(7, 0)
    },
    [BlockType.GLASS]: {
        top: getUVCoords(8, 0),    // Glass (semitransparent)
        side: getUVCoords(8, 0),
        bottom: getUVCoords(8, 0)
    },
    [BlockType.BRICK]: {
        top: getUVCoords(9, 0),    // Bricks
        side: getUVCoords(9, 0),
        bottom: getUVCoords(9, 0)
    },
    [BlockType.PLANK]: {
        top: getUVCoords(10, 0),   // Wooden planks
        side: getUVCoords(10, 0),
        bottom: getUVCoords(10, 0)
    }
};

// Texture atlas configuration
export const TextureAtlasConfig = {
    imagePath: '/textures/atlas.png',  // Path to the texture atlas image
    size: ATLAS_SIZE,                  // Size of the atlas in textures
    textureSize: TEXTURE_SIZE,          // Size of each texture in pixels
    textureUnitSize: 1 / ATLAS_SIZE     // Size of one texture in UV coordinates (0-1)
};
