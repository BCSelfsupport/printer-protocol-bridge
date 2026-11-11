import type { Printer } from '@/types/printer';

export type FloorKind = 'straight' | 'bend' | 'sidegrip' | 'roundtable' | 'filler' | 'capper' | 'labeler' | 'packer' | 'label' | 'printer' | 'wall' | 'door';
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
  /** Belt/body width across the line, percent of standard (independent of overall size). */
  width?: number;
  /** Building parts use independent dimensions in floor-plan units. */
  length?: number;
  thickness?: number;
}
export const FLOOR_STORAGE_KEY = 'codesync-floor-plan-v1';
export const floorNames: Record<FloorKind, string> = {
  straight: 'Straight conveyor', bend: '90° conveyor', sidegrip: 'Side grip conveyor', roundtable: 'Collation round table', filler: 'Filler', capper: 'Capper',
  labeler: 'Labeler', packer: 'Packer', label: 'Line label', printer: 'Printer', wall: 'Wall', door: 'Door',
};
export function addFloorItem(items: FloorItem[], kind: FloorKind, printer?: Printer, position = { x: 180, y: 180 }): FloorItem[] {
  if (kind === 'printer' && (!printer || items.some(i => i.printerId === printer.id))) return items;
  return [...items, { id: crypto.randomUUID(), kind, ...position, scale: 100, rotation: 0,
    label: printer?.name ?? (kind === 'label' ? 'Line 1' : floorNames[kind]), printerId: printer?.id,
    ...(kind === 'wall' ? { length: 300, thickness: 20 } : kind === 'door' ? { length: 100, thickness: 20 } : {}) }];
}
export function updateFloorItem(items: FloorItem[], id: string, patch: Partial<Pick<FloorItem, 'x' | 'y' | 'scale' | 'rotation' | 'label' | 'headSide' | 'width' | 'length' | 'thickness'>>): FloorItem[] {
  return items.map(item => item.id === id ? { ...item, ...patch,
    scale: Math.max(25, Math.min(300, patch.scale ?? item.scale)),
    width: patch.width === undefined ? item.width : Math.max(30, Math.min(200, patch.width)),
    length: patch.length === undefined ? item.length : dimension(patch.length, item.length ?? 300),
    thickness: patch.thickness === undefined ? item.thickness : dimension(patch.thickness, item.thickness ?? 20),
    rotation: ((patch.rotation ?? item.rotation) % 360 + 360) % 360,
  } : item);
}
/** Copy floor parts as a new line beside the originals. Printers are skipped: each configured printer appears once. */
export function duplicateFloorItems(items: FloorItem[], ids: string[], makeId: () => string = () => crypto.randomUUID()): { items: FloorItem[]; copies: FloorItem[] } {
  const source = items.filter(i => ids.includes(i.id) && i.kind !== 'printer');
  if (!source.length) return { items, copies: [] };
  const left = Math.min(...source.map(i => i.x));
  const right = Math.max(...source.map(i => i.x + floorItemBox(i).w));
  const offset = Math.ceil((right - left + 60) / 10) * 10;
  const copies = source.map(i => ({ ...i, id: makeId(), x: i.x + offset,
    label: i.kind === 'label' ? i.label.replace(/(\d+)(?!.*\d)/, n => String(Number(n) + 1)) : i.label }));
  return { items: [...items, ...copies], copies };
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
    }).map(i => ({ ...i, scale: Math.max(25, Math.min(300, i.scale)),
      ...(isBuildingPart(i.kind) ? { length: dimension(i.length, i.kind === 'wall' ? 300 : 100), thickness: dimension(i.thickness, 20) } : {}) }));
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
/** Box size React Flow renders for a floor item (rotation happens inside the box). */
export function isBuildingPart(kind: FloorKind) { return kind === 'wall' || kind === 'door'; }
function dimension(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(5, Math.min(5000, value)) : fallback;
}
export function floorBuildingSize(item: FloorItem) {
  const length = dimension(item.length, item.kind === 'wall' ? 300 : 100);
  return { w: length, h: item.kind === 'door' ? length : dimension(item.thickness, 20) };
}
export function floorItemBox(item: FloorItem) {
  if (isBuildingPart(item.kind)) {
    const size = floorBuildingSize(item), angle = item.rotation * Math.PI / 180, scale = item.scale / 100;
    return { w: (Math.abs(size.w * Math.cos(angle)) + Math.abs(size.h * Math.sin(angle))) * scale,
      h: (Math.abs(size.w * Math.sin(angle)) + Math.abs(size.h * Math.cos(angle))) * scale };
  }
  return { w: 220 * item.scale / 100, h: (item.kind === 'label' ? 42 : 260) * item.scale / 100 };
}

/**
 * Auto align: snaps each target's centre to the grid, and parts that already sit roughly in the same
 * up-and-down (or side-to-side) run share one exact centre line. Parts never move along their line,
 * so separate lines are never stacked on top of each other.
 */
export function autoAlignFloorItems(items: FloorItem[], ids: string[], grid: number, tolerance = 60): FloorItem[] {
  const g = grid > 0 ? grid : 10;
  const round = (v: number) => Math.round(v / g) * g;
  const targets = items.filter(i => ids.includes(i.id) && i.kind !== 'label');
  if (!targets.length) return items;
  const c = new Map(targets.map(i => { const b = floorItemBox(i); return [i.id, { cx: i.x + b.w / 2, cy: i.y + b.h / 2 }]; }));
  const out = new Map([...c].map(([id, v]) => [id, { cx: round(v.cx), cy: round(v.cy) }]));
  const cluster = (axis: 'cx' | 'cy') => {
    const sorted = [...c].sort((a, b) => a[1][axis] - b[1][axis]);
    const groups: Array<typeof sorted> = [];
    for (const e of sorted) { const last = groups[groups.length - 1]; if (last && e[1][axis] - last[last.length - 1][1][axis] <= tolerance) last.push(e); else groups.push([e]); }
    return groups.filter(gr => gr.length > 1);
  };
  const used = new Set<string>();
  for (const gr of cluster('cx')) { // vertical runs share one X
    const ys = gr.map(e => e[1].cy); if (Math.max(...ys) - Math.min(...ys) < tolerance) continue;
    const x = round(gr.reduce((a, e) => a + e[1].cx, 0) / gr.length);
    gr.forEach(([id]) => { out.get(id)!.cx = x; used.add(id); });
  }
  for (const gr of cluster('cy')) { // horizontal runs share one Y
    const free = gr.filter(([id]) => !used.has(id)); if (free.length < 2) continue;
    const xs = free.map(e => e[1].cx); if (Math.max(...xs) - Math.min(...xs) < tolerance) continue;
    const y = round(free.reduce((a, e) => a + e[1].cy, 0) / free.length);
    free.forEach(([id]) => { out.get(id)!.cy = y; });
  }
  return items.map(i => { const o = out.get(i.id); if (!o) return i; const b = floorItemBox(i); return { ...i, x: o.cx - b.w / 2, y: o.cy - b.h / 2 }; });
}

/**
 * Drag alignment guides: if the dragged part's centre comes within `tolerance` of another part's centre
 * on X or Y, it snaps onto that line and the guide position is returned so it can be drawn.
 */
export function floorAlignGuides(item: FloorItem, pos: { x: number; y: number }, others: FloorItem[], tolerance = 8) {
  const b = floorItemBox(item);
  const cx = pos.x + b.w / 2, cy = pos.y + b.h / 2;
  let gx: number | null = null, gy: number | null = null, dx = tolerance + 1, dy = tolerance + 1;
  for (const o of others) {
    if (o.id === item.id) continue;
    const ob = floorItemBox(o); const ocx = o.x + ob.w / 2, ocy = o.y + ob.h / 2;
    if (Math.abs(ocx - cx) < dx) { dx = Math.abs(ocx - cx); gx = ocx; }
    if (Math.abs(ocy - cy) < dy) { dy = Math.abs(ocy - cy); gy = ocy; }
  }
  return { x: gx !== null ? gx - b.w / 2 : pos.x, y: gy !== null ? gy - b.h / 2 : pos.y, guideX: gx, guideY: gy };
}

/** Space 3+ parts evenly: first and last stay put, the rest get equal centre-to-centre spacing along the direction they're spread. */
export function distributeFloorItems(items: FloorItem[], ids: string[]): FloorItem[] {
  const t = items.filter(i => ids.includes(i.id)).map(i => { const b = floorItemBox(i); return { i, b, cx: i.x + b.w / 2, cy: i.y + b.h / 2 }; });
  if (t.length < 3) return items;
  const span = (k: 'cx' | 'cy') => Math.max(...t.map(e => e[k])) - Math.min(...t.map(e => e[k]));
  const k: 'cx' | 'cy' = span('cy') >= span('cx') ? 'cy' : 'cx';
  t.sort((a, b) => a[k] - b[k]);
  const start = t[0][k], step = (t[t.length - 1][k] - start) / (t.length - 1);
  const moved = new Map(t.map((e, n) => [e.i.id, k === 'cy' ? { y: start + step * n - e.b.h / 2 } : { x: start + step * n - e.b.w / 2 }]));
  return items.map(i => moved.has(i.id) ? { ...i, ...moved.get(i.id) } : i);
}
