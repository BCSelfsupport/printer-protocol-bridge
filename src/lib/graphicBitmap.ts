/**
 * Printer graphics (logos) for the message preview.
 *
 * Graphics live on the printer as monochrome BMP files (max 32 dots high).
 * ^VG <name> returns an HTML <img src="data:image/bmp;base64,..."> tag
 * (protocol v2.6 §5.51); we decode that 1-bit BMP into a dot grid that the
 * editor canvas draws exactly like font dots.
 */

export interface GraphicBitmap {
  width: number;
  height: number;
  /** Row-major, top row first. true = printed dot. */
  dots: boolean[][];
}

const MAX_HEIGHT = 32;

/** Pull the graphic file name out of a logo field's data ("[GRAPHIC: X.BMP]" or "X.BMP"). */
export function graphicNameFromFieldData(data: string): string {
  const m = data.match(/\[GRAPHIC:\s*([^\]]+)\]/i);
  return (m ? m[1] : data).trim();
}

/** Decode a 1-bit (or any palette ≤8-bit) BMP into printed dots. Returns null if unsupported. */
export function decodeMonoBmp(bytes: Uint8Array): GraphicBitmap | null {
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataOffset = dv.getUint32(10, true);
  const headerSize = dv.getUint32(14, true);
  const width = dv.getInt32(18, true);
  const rawHeight = dv.getInt32(22, true);
  const bpp = dv.getUint16(28, true);
  if (width <= 0 || rawHeight === 0 || bpp !== 1) return null;
  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);

  // Palette: decide which index is "ink". The darker palette entry prints.
  const palOffset = 14 + headerSize;
  const lum = (i: number) => {
    const o = palOffset + i * 4;
    if (o + 2 >= bytes.length) return i === 0 ? 0 : 255;
    return bytes[o] + bytes[o + 1] + bytes[o + 2];
  };
  const inkIndex = lum(0) <= lum(1) ? 0 : 1;

  const rowBytes = Math.ceil(width / 32) * 4;
  const dots: boolean[][] = [];
  for (let row = 0; row < height; row++) {
    const srcRow = topDown ? row : height - 1 - row;
    const base = dataOffset + srcRow * rowBytes;
    const line: boolean[] = [];
    for (let x = 0; x < width; x++) {
      const byte = bytes[base + (x >> 3)] ?? 0;
      const bit = (byte >> (7 - (x & 7))) & 1;
      line.push(bit === inkIndex);
    }
    dots.push(line);
  }
  // Printer graphics are max 32 dots tall; keep the bottom rows if larger.
  const trimmed = dots.length > MAX_HEIGHT ? dots.slice(dots.length - MAX_HEIGHT) : dots;
  return { width, height: trimmed.length, dots: trimmed };
}

/** Parse a ^VG reply into a bitmap. */
export function parseVgResponse(response: string): GraphicBitmap | null {
  const m = response.match(/data:image\/bmp;base64,([A-Za-z0-9+/=\s]+)/i);
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return decodeMonoBmp(bytes);
  } catch {
    return null;
  }
}

// ── Cache (memory + localStorage) ───────────────────────────────────────────

const STORAGE_KEY = 'codesync-graphic-cache-v1';
const cache = new Map<string, GraphicBitmap | null>();
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<void>>();

function key(name: string) {
  return name.toUpperCase();
}

(function load() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, { w: number; h: number; r: string[] }>;
    for (const [k, v] of Object.entries(obj)) {
      cache.set(k, { width: v.w, height: v.h, dots: v.r.map((s) => [...s].map((c) => c === '1')) });
    }
  } catch { /* ignore */ }
})();

function persist() {
  try {
    const obj: Record<string, { w: number; h: number; r: string[] }> = {};
    cache.forEach((v, k) => {
      if (v) obj[k] = { w: v.width, h: v.height, r: v.dots.map((row) => row.map((d) => (d ? '1' : '0')).join('')) };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}

export function getCachedGraphic(name: string): GraphicBitmap | null | undefined {
  return cache.get(key(name));
}

export function subscribeGraphics(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Fetch a graphic from the printer via ^VG (once per name per session if it failed). */
export function requestGraphic(
  name: string,
  send: (command: string) => Promise<unknown>,
): Promise<void> {
  const k = key(name);
  if (!name || cache.get(k)) return Promise.resolve();
  if (inflight.has(k)) return inflight.get(k)!;
  const p = (async () => {
    try {
      const res = await send(`^VG ${name}`);
      const text = typeof res === 'string'
        ? res
        : String((res as { response?: string } | undefined)?.response ?? '');
      const bmp = parseVgResponse(text);
      cache.set(k, bmp);
      if (bmp) persist();
    } catch {
      cache.set(k, null);
    } finally {
      inflight.delete(k);
      listeners.forEach((l) => l());
    }
  })();
  inflight.set(k, p);
  return p;
}
