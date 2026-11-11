import type { Printer } from '@/types/printer';

export type FloorKind = 'straight' | 'bend' | 'sidegrip' | 'roundtable' | 'filler' | 'capper' | 'labeler' | 'packer' | 'label' | 'printer';
export interface FloorItem {
  id: string;
  kind: FloorKind;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  label: string;
  printerId?: number;
  /** Printer only: which side of the conveyor the umbilical and printhead leave from. */
  headSide?: 'left' | 'right';
}
export const FLOOR_STORAGE_KEY = 'codesync-floor-plan-v1';
export const floorNames: Record<FloorKind, string> = {
  straight: 'Straight conveyor', bend: '90° conveyor', sidegrip: 'Side grip conveyor', roundtable: 'Collation round table', filler: 'Filler', capper: 'Capper',
  labeler: 'Labeler', packer: 'Packer', label: 'Line label', printer: 'Printer',
};
export function addFloorItem(items: FloorItem[], kind: FloorKind, printer?: Printer, position = { x: 180, y: 180 }): FloorItem[] {
  if (kind === 'printer' && (!printer || items.some(i => i.printerId === printer.id))) return items;
  return [...items, { id: crypto.randomUUID(), kind, ...position, scale: 100, rotation: 0,
    label: printer?.name ?? (kind === 'label' ? 'Line 1' : floorNames[kind]), printerId: printer?.id }];
}
export function updateFloorItem(items: FloorItem[], id: string, patch: Partial<Pick<FloorItem, 'x' | 'y' | 'scale' | 'rotation' | 'label' | 'headSide'>>): FloorItem[] {
  return items.map(item => item.id === id ? { ...item, ...patch,
    scale: Math.max(25, Math.min(300, patch.scale ?? item.scale)),
    rotation: ((patch.rotation ?? item.rotation) % 360 + 360) % 360,
  } : item);
}
export function readFloorPlan(): FloorItem[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(FLOOR_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(data)) return [];
    const seen = new Set<number>();
    return data.filter((i): i is FloorItem => {
      if (!i || typeof i.id !== 'string' || !(i.kind in floorNames) || typeof i.label !== 'string'
        || ![i.x, i.y, i.scale, i.rotation].every(Number.isFinite)) return false;
      if (i.kind === 'printer') {
        if (!Number.isInteger(i.printerId) || seen.has(i.printerId)) return false;
        seen.add(i.printerId);
      }
      return true;
    }).map(i => ({ ...i, scale: Math.max(25, Math.min(300, i.scale)) }));
  } catch { return []; }
}
export function floorPrinterStatus(printer: Printer) {
  if (!printer.isAvailable || printer.status === 'offline') return 'offline';
  if (printer.hasActiveErrors || printer.status === 'error' || printer.inkLevel === 'EMPTY' || printer.makeupLevel === 'EMPTY') return 'fault';
  if (printer.inkLevel === 'LOW' || printer.makeupLevel === 'LOW' || printer.syncOutOfDate) return 'warning';
  // A successful network ping alone does not establish healthy printer telemetry.
  if (printer.jetRunning === undefined && !printer.isConnected) return 'unknown';
  return 'healthy';
}