/**
 * Twin Code — Catalog + Anti-Duplication Ledger.
 *
 * Customer requirement (locked SOW):
 *   - Serials are NOT random. They come from a finite catalog (CSV).
 *   - CRITICAL: never print the same serial twice.
 *   - If the catalog is empty when a photocell fires, log a miss-print
 *     (do NOT reuse the last serial).
 *
 * The ledger is the single source of truth for what's been consumed. The
 * conveyor sim, the printer hot path (Phase 1b+), and the export all read
 * from it. Restart-safety is deferred to Phase 2 (will persist to localStorage
 * + Lovable Cloud once the wire-format is locked).
 */

export interface CatalogEntry {
  /** 1-indexed row number in the original CSV (after skipping the header). */
  rowIndex: number;
  serial: string;
}

export interface LedgerRecord {
  serial: string;
  outcome: "printed" | "missed";
  /** performance.now() ms. */
  at: number;
  /** bottle index in the run. */
  bottleIndex: number;
}

export interface CatalogState {
  /** Total rows loaded from CSV. */
  total: number;
  /** Index of the next serial to dispense. */
  nextIndex: number;
  /** Serials already consumed (printed or missed). */
  consumedCount: number;
  /** Miss-prints recorded. */
  missCount: number;
}

type Listener = (state: CatalogState) => void;

/** Naive CSV parser — handles quoted fields with commas + escaped quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); row = []; cell = ""; }
        if (ch === "\r" && text[i + 1] === "\n") i++;
      } else {
        cell += ch;
      }
    }
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Detect whether the first row of a CSV is plausibly a header. */
export function detectHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const first = rows[0];
  const second = rows[1];
  // header row plausibly contains non-numeric labels; second row contains digits/values
  const firstAllText = first.every((c) => /[a-zA-Z]/.test(c) && !/^\d+$/.test(c.trim()));
  const secondHasNumeric = second.some((c) => /\d/.test(c));
  return firstAllText && secondHasNumeric;
}

class Catalog {
  private entries: CatalogEntry[] = [];
  private state: CatalogState = { total: 0, nextIndex: 0, consumedCount: 0, missCount: 0 };
  private records: LedgerRecord[] = [];
  private listeners = new Set<Listener>();

  load(serials: string[]) {
    this.entries = serials.map((s, i) => ({ rowIndex: i + 1, serial: s }));
    this.state = { total: serials.length, nextIndex: 0, consumedCount: 0, missCount: 0 };
    this.records = [];
    this.notify();
  }

  /** Pop next serial; returns null if catalog exhausted. */
  dispense(): string | null {
    if (this.state.nextIndex >= this.entries.length) return null;
    const entry = this.entries[this.state.nextIndex];
    this.state = { ...this.state, nextIndex: this.state.nextIndex + 1 };
    return entry.serial;
  }

  recordPrinted(serial: string, bottleIndex: number) {
    this.records.push({ serial, outcome: "printed", at: performance.now(), bottleIndex });
    this.state = { ...this.state, consumedCount: this.state.consumedCount + 1 };
    this.notify();
  }

  recordMissed(bottleIndex: number) {
    this.records.push({ serial: "", outcome: "missed", at: performance.now(), bottleIndex });
    this.state = {
      ...this.state,
      consumedCount: this.state.consumedCount + 1,
      missCount: this.state.missCount + 1,
    };
    this.notify();
  }

  reset() {
    this.state = { ...this.state, nextIndex: 0, consumedCount: 0, missCount: 0 };
    this.records = [];
    this.notify();
  }

  clear() {
    this.entries = [];
    this.state = { total: 0, nextIndex: 0, consumedCount: 0, missCount: 0 };
    this.records = [];
    this.notify();
  }

  getState(): CatalogState { return this.state; }
  getRecords(): LedgerRecord[] { return this.records; }
  getRemaining(): number { return Math.max(0, this.state.total - this.state.nextIndex); }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    const s = this.state;
    this.listeners.forEach((l) => l(s));
  }
}

export const catalog = new Catalog();
