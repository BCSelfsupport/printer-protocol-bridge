export type ReorderAction = 'website' | 'email' | 'consumables' | 'none';

export interface ReorderConfig {
  action: ReorderAction;
  websiteUrl: string;
  emailAddress: string;
  emailSubject: string;
}

export const defaultReorderConfig: ReorderConfig = {
  action: 'website',
  websiteUrl: 'https://www.buybestcode.co',
  emailAddress: '',
  emailSubject: 'Reorder Request — {{partNumber}}',
};

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
