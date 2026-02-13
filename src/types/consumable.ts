export interface Consumable {
  id: string;
  type: 'ink' | 'makeup';
  partNumber: string;
  description: string;
  currentStock: number;
  minimumStock: number;
  unit: string; // e.g. 'bottles', 'liters', 'cartridges'
}

export interface PrinterConsumableAssignment {
  printerId: number;
  inkConsumableId?: string;
  makeupConsumableId?: string;
}
