import { BlockType } from '../world/BlockType';

/**
 * Represents an item stack in the inventory
 */
export interface ItemStack {
    type: BlockType;
    count: number;
    maxStack: number;
}

/**
 * Represents a slot in the inventory
 */
export interface InventorySlot {
    itemStack: ItemStack | null;
}

/**
 * Player inventory system with hotbar and main inventory
 * Similar to Minecraft's inventory system
 */
export class Inventory {
    private slots: InventorySlot[] = [];
    private selectedSlotIndex: number = 0;
    private readonly HOTBAR_SIZE = 9;
    private readonly INVENTORY_SIZE = 36; // 4 rows × 9 columns

    constructor() {
        // Initialize all slots as empty
        for (let i = 0; i < this.INVENTORY_SIZE; i++) {
            this.slots.push({ itemStack: null });
        }

        // Start with empty inventory - player must mine blocks to get items
    }

    /**
     * Gets the currently selected slot index (0-8 for hotbar)
     */
    public getSelectedSlotIndex(): number {
        return this.selectedSlotIndex;
    }

    /**
     * Sets the selected slot index (0-8 for hotbar)
     */
    public setSelectedSlot(slotIndex: number): void {
        if (slotIndex >= 0 && slotIndex < this.HOTBAR_SIZE) {
            this.selectedSlotIndex = slotIndex;
        }
    }

    /**
     * Gets the item stack in the currently selected hotbar slot
     */
    public getSelectedItem(): ItemStack | null {
        return this.slots[this.selectedSlotIndex].itemStack;
    }

    /**
     * Gets the item stack in a specific slot
     */
    public getItem(slotIndex: number): ItemStack | null {
        if (slotIndex < 0 || slotIndex >= this.slots.length) {
            return null;
        }
        return this.slots[slotIndex].itemStack;
    }

    /**
     * Adds an item to the inventory
     * @returns The number of items that couldn't be added (0 if all were added)
     */
    public addItem(blockType: BlockType, count: number): number {
        if (blockType === BlockType.AIR) return count;

        let remaining = count;

        // First, try to add to existing stacks of the same type
        for (let i = 0; i < this.slots.length && remaining > 0; i++) {
            const slot = this.slots[i];
            if (slot.itemStack && slot.itemStack.type === blockType) {
                const spaceAvailable = slot.itemStack.maxStack - slot.itemStack.count;
                const toAdd = Math.min(remaining, spaceAvailable);
                slot.itemStack.count += toAdd;
                remaining -= toAdd;
            }
        }

        // Then, try to add to empty slots
        for (let i = 0; i < this.slots.length && remaining > 0; i++) {
            const slot = this.slots[i];
            if (!slot.itemStack) {
                const toAdd = Math.min(remaining, 64); // Default max stack size
                slot.itemStack = {
                    type: blockType,
                    count: toAdd,
                    maxStack: 64
                };
                remaining -= toAdd;
            }
        }

        return remaining; // Return any items that couldn't be added
    }

    /**
     * Sets an item directly in a specific slot (replaces any existing item)
     * @param slotIndex The slot index to set the item in
     * @param blockType The block type to set
     * @param count The number of items to set
     */
    public setSlotItem(slotIndex: number, blockType: BlockType, count: number = 1): void {
        if (slotIndex < 0 || slotIndex >= this.slots.length) {
            return;
        }

        if (blockType === BlockType.AIR) {
            this.slots[slotIndex].itemStack = null;
        } else {
            this.slots[slotIndex].itemStack = {
                type: blockType,
                count: Math.min(count, 64), // Respect max stack size
                maxStack: 64
            };
        }
    }

    /**
     * Removes an item from the inventory
     * @returns The number of items actually removed
     */
    public removeItem(slotIndex: number, count: number): number {
        const slot = this.slots[slotIndex];
        if (!slot.itemStack) return 0;

        const toRemove = Math.min(count, slot.itemStack.count);
        slot.itemStack.count -= toRemove;

        // Remove the stack if empty
        if (slot.itemStack.count <= 0) {
            slot.itemStack = null;
        }

        return toRemove;
    }

    /**
     * Gets all hotbar slots (first 9 slots)
     */
    public getHotbarSlots(): InventorySlot[] {
        return this.slots.slice(0, this.HOTBAR_SIZE);
    }

    /**
     * Gets all inventory slots
     */
    public getAllSlots(): InventorySlot[] {
        return [...this.slots];
    }

    /**
     * Checks if the inventory has space for more items
     */
    public hasSpaceFor(blockType: BlockType): boolean {
        // Check existing stacks
        for (const slot of this.slots) {
            if (slot.itemStack && slot.itemStack.type === blockType && slot.itemStack.count < slot.itemStack.maxStack) {
                return true;
            }
        }

        // Check empty slots
        for (const slot of this.slots) {
            if (!slot.itemStack) {
                return true;
            }
        }

        return false;
    }

    /**
     * Gets the total count of a specific block type in the inventory
     */
    public getTotalCount(blockType: BlockType): number {
        let total = 0;
        for (const slot of this.slots) {
            if (slot.itemStack && slot.itemStack.type === blockType) {
                total += slot.itemStack.count;
            }
        }
        return total;
    }

    /**
     * Clears the entire inventory
     */
    public clear(): void {
        for (const slot of this.slots) {
            slot.itemStack = null;
        }
    }

    /**
     * Serializes the inventory for saving
     */
    public serialize(): string {
        return JSON.stringify(this.slots);
    }

    /**
     * Deserializes the inventory from saved data
     */
    public deserialize(data: string): void {
        try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed) && parsed.length === this.slots.length) {
                this.slots = parsed;
            }
        } catch (error) {
            console.warn('Failed to deserialize inventory:', error);
        }
    }
}
