import * as THREE from "three";
import { Player } from "./Player";
import { World } from "../world/World";
import { BlockType } from "../world/BlockType";
import { Inventory } from "./Inventory";

import { InventoryBar } from "../ui/InventoryBar";

export class BlockInteraction {
  private player: Player;
  private world: World;
  private domElement: HTMLElement;
  private inventory: Inventory;
  private inventoryBar: InventoryBar;
  private game: any; // Reference to Game instance if needed

  // Configuration
  private readonly MAX_DISTANCE = 5; // Maximum distance for block interaction

  constructor(
    player: Player,
    world: World,
    domElement: HTMLElement,
    inventory: Inventory,
    inventoryBar: InventoryBar,
    game?: any,
  ) {
    this.player = player;
    this.world = world;
    this.domElement = domElement;
    this.inventory = inventory;
    this.inventoryBar = inventoryBar;
    this.game = game;

    // Bind methods
    this.onPointerDown = this.onPointerDown.bind(this);

    this.initEventListeners();
  }

  private initEventListeners(): void {
    // Use pointerdown with passive: false to allow preventDefault()
    this.domElement.addEventListener("pointerdown", this.onPointerDown, {
      passive: false,
    });

    // Prevent context menu on right click
    this.domElement.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
  }

  private onPointerDown(event: PointerEvent): void {
    event.preventDefault();

    // Get fresh raycast data
    const raycastResult = this.player.getLastRaycastResult(true); // Force fresh raycast

    if (!raycastResult || raycastResult.distance > this.MAX_DISTANCE) {
      this.clearHighlight();
      return;
    }

    // Get block position
    const blockPos = new THREE.Vector3(
      Math.floor(raycastResult.position.x),
      Math.floor(raycastResult.position.y),
      Math.floor(raycastResult.position.z),
    );

    if (event.button === 0) {
      // Left click - Destroy block
      this.handleBlockDestruction(blockPos);
    } else if (event.button === 1) {
      // Middle click - Pickup block
      this.handleBlockPickup(blockPos);
    } else if (event.button === 2) {
      // Right click - Place block
      this.handleBlockPlacement(raycastResult);
    }
  }

  private handleBlockDestruction(blockPos: THREE.Vector3): void {
    // Verify the block exists and isn't air
    const currentBlock = this.world.getBlock(
      blockPos.x,
      blockPos.y,
      blockPos.z,
    );
    if (currentBlock === undefined || currentBlock === BlockType.AIR) {
      this.clearHighlight();
      return;
    }

    console.log(
      `Destroying block at (${blockPos.x}, ${blockPos.y}, ${blockPos.z})`,
    );

    // Add the block to inventory before destroying it
    this.inventory.addItem(currentBlock, 1);

    // Remove the block
    this.world.setBlock(blockPos.x, blockPos.y, blockPos.z, BlockType.AIR);

    // Force update chunks
    this.world.updateDirtyChunks();

    // Clear highlight
    this.clearHighlight();
  }

  private handleBlockPickup(blockPos: THREE.Vector3): void {
    // Get the block type at the pointed position
    const blockType = this.world.getBlock(blockPos.x, blockPos.y, blockPos.z);

    // Can't pickup air blocks or invalid positions
    if (blockType === undefined || blockType === BlockType.AIR) {
      return;
    }

    // Get the currently selected slot
    const selectedSlot = this.inventory.getSelectedSlotIndex();

    console.log(
      `Picking up block at (${blockPos.x}, ${blockPos.y}, ${blockPos.z}) - Type: ${blockType} -> Slot ${selectedSlot + 1}`,
    );

    // Set the block directly in the selected slot (replaces any existing item)
    this.inventory.setSlotItem(selectedSlot, blockType, 1);

    // Update UI immediately
    this.inventoryBar.updateUI();

    // Clear highlight
    this.clearHighlight();
  }

  private handleBlockPlacement(raycastResult: any): void {
    console.log(`=== BLOCK PLACEMENT DEBUG ===`);
    console.log(
      `Raycast position: (${raycastResult.position.x}, ${raycastResult.position.y}, ${raycastResult.position.z})`,
    );
    console.log(
      `Face normal: (${raycastResult.face.normal.x}, ${raycastResult.face.normal.y}, ${raycastResult.face.normal.z})`,
    );

    // 2. Calcular la posición de colocación sumando la NORMAL
    // La posición del bloque golpeado ya es entera (gracias al RaycastResult)
    // Simplemente sumamos la normal para obtener el vecino adyacente
    const placementPos = raycastResult.position
      .clone()
      .add(raycastResult.face.normal);
    console.log(
      `Calculated placement position: (${placementPos.x}, ${placementPos.y}, ${placementPos.z})`,
    );

    // 3. Obtener el ítem seleccionado
    const selectedItem = this.inventory.getSelectedItem();
    if (!selectedItem || selectedItem.count <= 0) {
      console.log(`Cannot place: no item selected or no items left`);
      return;
    }

    // 4. Verificar si el lugar está vacío
    const finalPlacementPos = placementPos;
    const existingBlock = this.world.getBlock(
      finalPlacementPos.x,
      finalPlacementPos.y,
      finalPlacementPos.z,
    );

    if (existingBlock !== BlockType.AIR) {
      console.log(
        `Position (${finalPlacementPos.x}, ${finalPlacementPos.y}, ${finalPlacementPos.z}) is occupied by ${existingBlock}`,
      );
      return;
    }

    // 5. Verificar colisión con el jugador
    const playerBox = this.player.getBoundingBox();
    const blockBox = new THREE.Box3(
      finalPlacementPos,
      finalPlacementPos.clone().add(new THREE.Vector3(1, 1, 1)),
    );

    if (playerBox.intersectsBox(blockBox)) {
      console.log("No puedes colocar un bloque sobre ti mismo");
      return;
    }

    // 6. Colocar el bloque
    console.log(
      `Colocando bloque en: ${finalPlacementPos.x}, ${finalPlacementPos.y}, ${finalPlacementPos.z}`,
    );

    this.world.setBlock(
      finalPlacementPos.x,
      finalPlacementPos.y,
      finalPlacementPos.z,
      selectedItem.type,
    );
    this.world.updateDirtyChunks();
    this.clearHighlight();
  }

  private clearHighlight(): void {
    // Clear highlight through game if available
    if (this.game && typeof this.game.updateHighlightBox === "function") {
      this.game.updateHighlightBox(null);
    }
  }

  public dispose(): void {
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
  }
}
