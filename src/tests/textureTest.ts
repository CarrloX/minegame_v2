import * as THREE from 'three';
import { BlockType } from '../blocks/BlockType';
import { BlockTextures } from '../assets/textureAtlas';

/**
 * Prueba para verificar que las texturas se carguen correctamente
 */
export function testTextureLoading() {
    console.log('=== Iniciando prueba de texturas ===');
    
    // 1. Verificar que las texturas estén definidas para todos los tipos de bloques
    const blockTypes = Object.values(BlockType).filter(v => typeof v === 'number') as BlockType[];
    console.log(`Verificando ${blockTypes.length} tipos de bloques...`);
    
    blockTypes.forEach(blockType => {
        const textures = BlockTextures[blockType];
        console.log(`\nBloque: ${BlockType[blockType]}`);
        console.log('Top:', textures.top);
        console.log('Side:', textures.side);
        console.log('Bottom:', textures.bottom);
    });
    
    // 2. Verificar que el archivo de textura se pueda cargar
    console.log('\n=== Probando carga de textura ===');
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(
        '/assets/textures/atlas.svg',
        // onLoad callback
        (texture) => {
            console.log('✅ Textura cargada exitosamente');
            console.log('Dimensiones:', texture.image.width, 'x', texture.image.height);
        },
        // onProgress callback
        undefined,
        // onError callback
        (error) => {
            console.error('❌ Error al cargar la textura:', error);
        }
    );
    
    // Configuración de la textura
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    
    console.log('=== Prueba de texturas completada ===');
}

// Ejecutar la prueba
testTextureLoading();
