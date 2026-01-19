import { Inventory } from '../player/Inventory';
import { BlockType } from '../world/BlockType';

/**
 * UI component for the Minecraft-style inventory hotbar
 */
export class InventoryBar {
    private inventory: Inventory;
    private container!: HTMLDivElement;
    private slots: HTMLDivElement[] = [];
    private selectedIndicator!: HTMLDivElement;

    constructor(inventory: Inventory) {
        this.inventory = inventory;
        this.createUI();
        this.updateUI();
    }

    private createUI(): void {
        // Create main container
        this.container = document.createElement('div');
        this.container.id = 'inventory-bar';
        this.container.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 4px;
            padding: 4px;
            z-index: 1000;
            user-select: none;
        `;

        // Create 9 slots
        for (let i = 0; i < 9; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
            slot.dataset.slotIndex = i.toString();
            slot.style.cssText = `
                width: 60px;
                height: 60px;
                border: 2px solid #8b8b8b;
                border-radius: 2px;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: monospace;
                font-size: 10px;
                color: white;
                cursor: pointer;
                background: transparent;
            `;

            // Remove number indicator - only show count when > 1

            // Add item display area
            const itemDisplay = document.createElement('div');
            itemDisplay.className = 'item-display';
            itemDisplay.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
            `;
            slot.appendChild(itemDisplay);

            // Add count display
            const countDisplay = document.createElement('div');
            countDisplay.className = 'item-count';
            countDisplay.style.cssText = `
                position: absolute;
                bottom: 2px;
                right: 2px;
                font-size: 10px;
                font-weight: bold;
                color: white;
                text-shadow: 1px 1px 0px rgba(0,0,0,0.8);
                pointer-events: none;
            `;
            slot.appendChild(countDisplay);

            this.slots.push(slot);
            this.container.appendChild(slot);
        }

        // Create selected slot indicator
        this.selectedIndicator = document.createElement('div');
        this.selectedIndicator.id = 'selected-indicator';
        this.selectedIndicator.style.cssText = `
            position: absolute;
            top: -4px;
            left: -4px;
            width: 68px;
            height: 68px;
            border: 3px solid white;
            border-radius: 4px;
            pointer-events: none;
            transition: left 0.1s ease;
        `;
        this.container.appendChild(this.selectedIndicator);

        // Add to document
        document.body.appendChild(this.container);

        // Add keyboard event listeners
        this.setupKeyboardControls();
    }

    private setupKeyboardControls(): void {
        document.addEventListener('keydown', (event) => {
            // Handle number keys 1-9 for slot selection
            const num = parseInt(event.key);
            if (num >= 1 && num <= 9) {
                event.preventDefault();
                this.inventory.setSelectedSlot(num - 1);
                this.updateSelectedIndicator();
            }
        });

        // Handle mouse wheel for slot selection
        document.addEventListener('wheel', (event) => {
            event.preventDefault();
            const currentSlot = this.inventory.getSelectedSlotIndex();
            let newSlot = currentSlot;

            if (event.deltaY > 0) {
                // Scroll down - next slot
                newSlot = (currentSlot + 1) % 9;
            } else {
                // Scroll up - previous slot
                newSlot = (currentSlot - 1 + 9) % 9;
            }

            this.inventory.setSelectedSlot(newSlot);
            this.updateSelectedIndicator();
        });
    }

    public updateUI(): void {
        const hotbarSlots = this.inventory.getHotbarSlots();

        hotbarSlots.forEach((slot, index) => {
            const slotElement = this.slots[index];
            const itemDisplay = slotElement.querySelector('.item-display') as HTMLDivElement;
            const countDisplay = slotElement.querySelector('.item-count') as HTMLDivElement;

            if (slot.itemStack) {
                // Show item
                const itemName = this.getBlockDisplayName(slot.itemStack.type);
                itemDisplay.textContent = itemName.charAt(0); // First letter as simple icon
                itemDisplay.style.color = this.getBlockColor(slot.itemStack.type);

                // Show count if more than 1
                if (slot.itemStack.count > 1) {
                    countDisplay.textContent = slot.itemStack.count.toString();
                } else {
                    countDisplay.textContent = '';
                }
            } else {
                // Empty slot
                itemDisplay.textContent = '';
                countDisplay.textContent = '';
            }
        });

        this.updateSelectedIndicator();
    }

    private updateSelectedIndicator(): void {
        const selectedIndex = this.inventory.getSelectedSlotIndex();
        const slotElement = this.slots[selectedIndex];
        const rect = slotElement.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();

        this.selectedIndicator.style.left = `${rect.left - containerRect.left - 4}px`;
    }

    private getBlockDisplayName(blockType: BlockType): string {
        switch (blockType) {
            case BlockType.GRASS: return 'Grass';
            case BlockType.DIRT: return 'Dirt';
            case BlockType.STONE: return 'Stone';
            case BlockType.SAND: return 'Sand';
            case BlockType.WOOD: return 'Wood';
            case BlockType.LEAVES: return 'Leaves';
            default: return 'Unknown';
        }
    }

    private getBlockColor(blockType: BlockType): string {
        switch (blockType) {
            case BlockType.GRASS: return '#4CAF50'; // Green
            case BlockType.DIRT: return '#8D6E63'; // Brown
            case BlockType.STONE: return '#757575'; // Gray
            case BlockType.SAND: return '#FFF176'; // Yellow
            case BlockType.WOOD: return '#8D6E63'; // Brown
            case BlockType.LEAVES: return '#4CAF50'; // Green
            default: return '#FFFFFF'; // White
        }
    }

    /**
     * Shows the inventory bar
     */
    public show(): void {
        this.container.style.display = 'flex';
    }

    /**
     * Hides the inventory bar
     */
    public hide(): void {
        this.container.style.display = 'none';
    }

    /**
     * Disposes of the inventory bar UI
     */
    public dispose(): void {
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
