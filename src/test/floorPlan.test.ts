import { describe, it, expect } from 'vitest';
import { addFloorItem, updateFloorItem, floorPrinterStatus, readFloorPlan, floorItemBox, FLOOR_STORAGE_KEY } from '@/lib/floorPlan';
import type { Printer } from '@/types/printer';
const printer: Printer = { id: 12, name: 'Printer 12', ipAddress: '192.168.0.12', port: 23, isAvailable: true, isConnected: true, status: 'ready', hasActiveErrors: false, jetRunning: true };
describe('floor plan rules', () => {
  it('adjusts wall length and thickness independently and retains them after reload', () => {
    const wall = addFloorItem([], 'wall')[0];
    const resized = updateFloorItem([wall], wall.id, { length: 600, thickness: 35 });
    expect(floorItemBox(resized[0])).toEqual({ w: 600, h: 35 });
    localStorage.setItem(FLOOR_STORAGE_KEY, JSON.stringify(resized));
    expect(readFloorPlan()[0]).toMatchObject({ kind: 'wall', length: 600, thickness: 35 });
  });
  it('rotates a wall without changing its length or thickness', () => {
    const wall = addFloorItem([], 'wall')[0];
    const rotated = updateFloorItem([wall], wall.id, { rotation: 90 })[0];
    expect(floorItemBox(rotated).w).toBeCloseTo(20);
    expect(floorItemBox(rotated).h).toBeCloseTo(300);
    expect(rotated).toMatchObject({ length: 300, thickness: 20 });
  });
  it('resizes and copies doors while retaining the source', () => {
    const door = addFloorItem([], 'door')[0];
    const resized = updateFloorItem([door], door.id, { length: 140 });
    expect(floorItemBox(resized[0])).toEqual({ w: 140, h: 140 });
    const copied = duplicateFloorItems(resized, [door.id], () => 'copy');
    expect(copied.items).toHaveLength(2);
    expect(copied.copies[0]).toMatchObject({ kind: 'door', length: 140 });
  });
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
import { duplicateFloorItems } from '@/lib/floorPlan';
describe('duplicateFloorItems', () => {
  const base = [
    { id: 'a', kind: 'straight' as const, x: 0, y: 0, scale: 100, rotation: 90, label: 'Straight conveyor' },
    { id: 't', kind: 'label' as const, x: 0, y: -60, scale: 100, rotation: 0, label: 'Line 1' },
    { id: 'p', kind: 'printer' as const, x: 50, y: 50, scale: 100, rotation: 0, label: 'P1', printerId: 1 },
  ];
  it('copies selected parts beside the originals, skipping printers and numbering line tags', () => {
    let n = 0;
    const { items, copies } = duplicateFloorItems(base, ['a', 't', 'p'], () => `c${n++}`);
    expect(items).toHaveLength(5);
    expect(copies.map(c => c.kind)).toEqual(['straight', 'label']);
    expect(copies[0]).toMatchObject({ x: 280, y: 0, rotation: 90 });
    expect(copies[1].label).toBe('Line 2');
  });
});

describe('width across line', () => {
  it('clamps width between 30% and 200% without touching size', () => {
    const items = [{ id: 'a', kind: 'straight' as const, x: 0, y: 0, scale: 60, rotation: 0, label: 'a' }];
    expect(updateFloorItem(items, 'a', { width: 50 })[0]).toMatchObject({ width: 50, scale: 60 });
    expect(updateFloorItem(items, 'a', { width: 10 })[0].width).toBe(30);
    expect(updateFloorItem(items, 'a', { width: 500 })[0].width).toBe(200);
  });
});
