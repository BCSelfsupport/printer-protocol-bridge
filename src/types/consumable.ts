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
  currentStock: number;       // stock in "unit" (e.g. bottles)
  minimumStock: number;       // reorder threshold in "unit"
  unit: string;               // stock unit e.g. 'bottles'
  reorderUnit?: string;       // reorder unit e.g. 'cases'
  bottlesPerReorderUnit?: number; // how many stock-units per reorder-unit e.g. 5
}

export interface PrinterConsumableAssignment {
  printerId: number;
  inkConsumableId?: string;
  makeupConsumableId?: string;
}
