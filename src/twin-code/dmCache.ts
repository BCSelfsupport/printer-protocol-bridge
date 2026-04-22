/**
 * Tiny per-session cache of 16×16 ECC200 Data Matrix bit grids for the
 * conveyor simulator. We use bwip-js's `toRaw` API to obtain the raw
 * monochrome pixel grid (no DOM/canvas), then memoize per serial.
 *
 * The result is rendered as a grid of <rect> cells in the SVG bottle.
 */
// @ts-ignore - bwip-js ships its own types
import bwipjs from "bwip-js";

const cache = new Map<string, boolean[][]>();

/** Returns a 16×16 bit grid (true = dark module) or null if encoding fails. */
export function getDmGrid(serial: string): boolean[][] | null {
  if (!serial) return null;
  const cached = cache.get(serial);
  if (cached) return cached;
  try {
    // bwip-js toRaw returns an array of { pixs, width, height } pages.
    const raw = (bwipjs as any).toRaw({
      bcid: "datamatrix",
      text: serial,
      scale: 1,
      rows: 16,
      columns: 16,
    });
    if (!raw || !raw[0]) return null;
    const { pixs, width, height } = raw[0];
    if (width !== 16 || height !== 16) {
      // Fallback: still try to fit whatever size we got into a 16-aligned grid.
    }
    const grid: boolean[][] = [];
    for (let y = 0; y < height; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < width; x++) {
        row.push(pixs[y * width + x] === 1);
      }
      grid.push(row);
    }
    cache.set(serial, grid);
    return grid;
  } catch {
    return null;
  }
}
