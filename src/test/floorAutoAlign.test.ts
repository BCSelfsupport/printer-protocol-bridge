import { describe, it, expect } from 'vitest';
import { autoAlignFloorItems, floorItemBox, type FloorItem } from '@/lib/floorPlan';

const item = (id: string, x: number, y: number, scale = 100): FloorItem => ({ id, kind: 'straight', x, y, scale, rotation: 0, label: '' } as FloorItem);
const cx = (i: FloorItem) => i.x + floorItemBox(i).w / 2;
const cy = (i: FloorItem) => i.y + floorItemBox(i).h / 2;

describe('auto align', () => {
  it('puts a vertical run of parts on one shared centre line', () => {
    const out = autoAlignFloorItems([item('a', 3, 0), item('b', 17, 300, 60), item('c', -8, 600)], ['a', 'b', 'c'], 20);
    expect(new Set(out.map(cx)).size).toBe(1);
    expect(cx(out[0]) % 20).toBe(0);
  });
  it('snaps a single part centre to the grid and leaves others alone', () => {
    const out = autoAlignFloorItems([item('a', 3, 7), item('b', 5, 5)], ['a'], 50);
    expect([cx(out[0]) % 50, cy(out[0]) % 50]).toEqual([0, 0]);
    expect(out[1]).toEqual(item('b', 5, 5));
  });
});
