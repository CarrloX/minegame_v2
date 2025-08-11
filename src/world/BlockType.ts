import * as THREE from 'three';

/**
 * Defines the different types of blocks in the game
 */
export enum BlockType {
    AIR = 0,        // Empty space
    GRASS = 1,      // Grass block (top face)
    DIRT = 2,       // Dirt block
    STONE = 3,      // Stone block
    SAND = 4,       // Sand block
    WOOD = 5,       // Wood/Log block
    LEAVES = 6,     // Leaves block
    GRASS_SIDE = 7  // Grass side face (for texture mapping)
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

// Texture loader is now managed by the World class

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
        texture: {
            all: 'textures/air.png'
        },
        material: new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide
        })
    },
    [BlockType.GRASS]: {
        isSolid: true,
        isTransparent: false,
        texture: {
            top: 'textures/grass_top.png',
            side: 'textures/grass_side.png',
            bottom: 'textures/dirt.png'
        },
        material: createMaterial('textures/grass_top.png')
    },
    [BlockType.DIRT]: {
        isSolid: true,
        isTransparent: false,
        texture: {
            all: 'textures/dirt.png'
        },
        material: createMaterial('textures/dirt.png')
    },
    [BlockType.STONE]: {
        isSolid: true,
        isTransparent: false,
        texture: {
            all: 'textures/stone.png'
        },
        material: createMaterial('textures/stone.png')
    },
    [BlockType.SAND]: {
        isSolid: true,
        isTransparent: false,
        texture: {
            all: 'textures/sand.png'
        },
        material: createMaterial('textures/sand.png')
    },
    [BlockType.WOOD]: {
        isSolid: true,
        isTransparent: false,
        texture: {
            all: 'textures/oak_log.png'
        },
        material: createMaterial('textures/oak_log.png')
    },
    [BlockType.LEAVES]: {
        isSolid: true,
        isTransparent: true,
        texture: {
            all: 'textures/oak_leaves.png'
        },
        material: createMaterial('textures/oak_leaves.png', true)
    },
    [BlockType.GRASS_SIDE]: {
        isSolid: true,
        isTransparent: false,
        texture: {
            all: 'textures/grass_side.png'
        },
        material: createMaterial('textures/grass_side.png')
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
