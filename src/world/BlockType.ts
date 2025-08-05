import * as THREE from 'three';

/**
 * Defines the different types of blocks in the game
 */
export enum BlockType {
    AIR = 0,    // Empty space
    GRASS = 1,  // Grass block
    DIRT = 2,   // Dirt block
    STONE = 3,  // Stone block
    SAND = 4,   // Sand block
    WOOD = 5,   // Wood/Log block
    LEAVES = 6  // Leaves block
}

/**
 * Block properties and metadata
 */
export interface BlockProperties {
    isSolid: boolean;
    isTransparent: boolean;
    texture: {
        top?: string;
        side?: string;
        bottom?: string;
        all?: string;
    };
    material?: THREE.Material;
}

// Create a texture loader
const textureLoader = new THREE.TextureLoader();

// Helper function to create a material from texture name
function createMaterial(textureName: string, transparent = false): THREE.Material {
    // In a real implementation, you would load actual textures here
    // For now, we'll use a colored material based on the texture name
    let color: THREE.ColorRepresentation;
    
    switch (textureName) {
        case 'grass_top':
            color = 0x7CFC00; // Lawn green
            break;
        case 'grass_side':
            color = 0x8B4513; // Saddle brown
            break;
        case 'dirt':
            color = 0x8B4513; // Saddle brown
            break;
        case 'stone':
            color = 0x808080; // Gray
            break;
        case 'sand':
            color = 0xF4A460; // Sandy brown
            break;
        case 'log_top':
            color = 0x8B4513; // Saddle brown
            break;
        case 'log_side':
            color = 0x8B4513; // Saddle brown
            break;
        case 'leaves':
            color = 0x228B22; // Forest green
            break;
        default:
            color = 0x00FF00; // Bright green (shouldn't happen)
    }
    
    return new THREE.MeshStandardMaterial({
        color: color,
        transparent: transparent,
        opacity: transparent ? 0.7 : 1.0,
        side: THREE.DoubleSide
    });
}

/**
 * Block configuration mapping
 */
export const BLOCK_PROPERTIES: Record<BlockType, BlockProperties> = {
    [BlockType.AIR]: {
        isSolid: false,
        isTransparent: true,
        texture: { all: 'air' },
        material: new THREE.MeshBasicMaterial({ visible: false })
    },
    [BlockType.GRASS]: {
        isSolid: true,
        isTransparent: false,
        texture: {
            top: 'grass_top',
            side: 'grass_side',
            bottom: 'dirt'
        },
        material: createMaterial('grass_side') // Will be replaced with multi-material
    },
    [BlockType.DIRT]: {
        isSolid: true,
        isTransparent: false,
        texture: { all: 'dirt' },
        material: createMaterial('dirt')
    },
    [BlockType.STONE]: {
        isSolid: true,
        isTransparent: false,
        texture: { all: 'stone' },
        material: createMaterial('stone')
    },
    [BlockType.SAND]: {
        isSolid: true,
        isTransparent: false,
        texture: { all: 'sand' },
        material: createMaterial('sand')
    },
    [BlockType.WOOD]: {
        isSolid: true,
        isTransparent: false,
        texture: {
            top: 'log_top',
            side: 'log_side',
            bottom: 'log_top'
        },
        material: createMaterial('log_side') // Will be replaced with multi-material
    },
    [BlockType.LEAVES]: {
        isSolid: true,
        isTransparent: true,
        texture: { all: 'leaves' },
        material: createMaterial('leaves', true)
    }
};

/**
 * Gets the properties of a block type
 * @param type The block type
 * @returns The block properties
 */
export function getBlockProperties(type: BlockType): BlockProperties {
    return BLOCK_PROPERTIES[type] || BLOCK_PROPERTIES[BlockType.AIR];
}
