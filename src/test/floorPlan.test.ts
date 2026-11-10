import { describe, it, expect } from 'vitest';
import { addFloorItem, updateFloorItem, floorPrinterStatus, readFloorPlan, FLOOR_STORAGE_KEY } from '@/lib/floorPlan';
import type { Printer } from '@/types/printer';
const printer: Printer = { id: 12, name: 'Printer 12', ipAddress: '192.168.0.12', port: 23, isAvailable: true, isConnected: true, status: 'ready', hasActiveErrors: false, jetRunning: true };
describe('floor plan rules', () => {
  it('places a configured printer once by ID', () => {
    const items = addFloorItem([], 'printer', printer);
    expect(items[0].printerId).toBe(12);
    expect(addFloorItem(items, 'printer', printer)).toHaveLength(1);
  });
  it('moving a printer retains identity and does not change its connection or message', () => {
    const items = addFloorItem([], 'printer', printer);
    const moved = updateFloorItem(items, items[0].id, { x: 500, y: 300 });
    expect(moved[0]).toMatchObject({ printerId: 12, x: 500, y: 300 });
    expect(printer.ipAddress).toBe('192.168.0.12');
  });
  it('resizes conveyor by percentage and rotates it', () => {
    const items = addFloorItem([], 'bend');
    expect(updateFloorItem(items, items[0].id, { scale: 150, rotation: 90 })[0]).toMatchObject({ scale: 150, rotation: 90 });
  });
  it('retains an intentionally empty plan', () => {
    localStorage.setItem(FLOOR_STORAGE_KEY, '[]');
    expect(readFloorPlan()).toEqual([]);
  });
  it('distinguishes fault warning healthy and offline', () => {
    expect(floorPrinterStatus(printer)).toBe('healthy');
    expect(floorPrinterStatus({ ...printer, inkLevel: 'LOW' })).toBe('warning');
    expect(floorPrinterStatus({ ...printer, hasActiveErrors: true })).toBe('fault');
    expect(floorPrinterStatus({ ...printer, isAvailable: false })).toBe('offline');
    expect(floorPrinterStatus({ ...printer, isConnected: false, jetRunning: undefined })).toBe('unknown');
  });
});