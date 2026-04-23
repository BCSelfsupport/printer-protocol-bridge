/**
 * Twin Code — Catalog + Anti-Duplication Ledger.
 *
 * Customer requirement (locked SOW):
 *   - Serials are NOT random. They come from a finite catalog (CSV).
 *   - CRITICAL: never print the same serial twice. EVER.
 *   - If the catalog is empty when a photocell fires, log a miss-print
 *     (do NOT reuse the last serial).
 *
 * The ledger is the single source of truth for what's been consumed. The
 * conveyor sim, the printer hot path, and the export all read from it.
 *
 * ## Phase 2 — Restart Safety
 *
 * The full ledger (entries + index + consumed-serials set + miss records) is
 * persisted to localStorage with a 250ms-debounced write so a page refresh,
 * Electron crash, or accidental nav cannot re-emit a serial that has already
 * left the building. On load we hash the entries; if the user re-imports the
 * same CSV later we detect it and offer to RESUME (skip already-printed
 * serials and continue from nextIndex) or DISCARD (start fresh).
 *
 * The anti-duplicate guard is enforced at TWO layers:
 *   1. `dispense()` — advances nextIndex sequentially; cannot return a serial
 *      whose row was already consumed.
 *   2. `recordPrinted()` — explicit `Set<string>` check; throws if the same
 *      serial appears twice. This catches catalog bugs (duplicate rows) and
 *      any external dispatcher that bypasses `dispense()`.
 */

const STORAGE_KEY = "twincode.catalog.v1";

export interface CatalogEntry {
  /** 1-indexed row number in the original CSV (after skipping the header). */
  rowIndex: number;
  serial: string;
}

export interface LedgerRecord {
  serial: string;
  outcome: "printed" | "missed";
  /** performance.now() ms (for live charts). */
  at: number;
  /** Wall-clock epoch ms (for persistence / audit). */
  wallAt: number;
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
  /** Stable fingerprint of the loaded entries (FNV-1a over serials). */
  fingerprint: string | null;
  /** Wall-clock epoch ms of the most recent persisted write. */
  lastSavedAt: number | null;
  /** True if there is a non-fresh persisted ledger waiting on disk. */
  hasPersistedSession: boolean;
}

interface PersistedShape {
  v: 1;
  entries: CatalogEntry[];
  nextIndex: number;
  consumedCount: number;
  missCount: number;
  printedSerials: string[];
  records: LedgerRecord[];
  fingerprint: string;
  savedAt: number;
}

type Listener = (state: CatalogState) => void;

/** FNV-1a 32-bit — fast, deterministic, plenty for "is this the same CSV?". */
function fingerprint(serials: string[]): string {
  let h = 0x811c9dc5;
  // Fingerprint over count + serial joined; collisions astronomically unlikely
  // for our scale (≤1M rows).
  const s = `${serials.length}\u0001${serials.join("\u0002")}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

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
  const firstAllText = first.every((c) => /[a-zA-Z]/.test(c) && !/^\d+$/.test(c.trim()));
  const secondHasNumeric = second.some((c) => /\d/.test(c));
  return firstAllText && secondHasNumeric;
}

/** Snapshot of a previously-persisted session for the UI to act on. */
export interface PersistedSnapshot {
  fingerprint: string;
  total: number;
  nextIndex: number;
  consumedCount: number;
  missCount: number;
  savedAt: number;
}

export class DuplicateSerialError extends Error {
  constructor(serial: string) {
    super(`Refusing to re-print serial '${serial}' — already in ledger`);
    this.name = "DuplicateSerialError";
  }
}

class Catalog {
  private entries: CatalogEntry[] = [];
  private printedSet = new Set<string>();
  private records: LedgerRecord[] = [];
  private state: CatalogState = {
    total: 0,
    nextIndex: 0,
    consumedCount: 0,
    missCount: 0,
    fingerprint: null,
    lastSavedAt: null,
    hasPersistedSession: false,
  };
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // On boot, surface that there's a persisted session — but DON'T auto-load
    // it. The UI offers Resume or Discard so the operator stays in control.
    const snap = this.peekPersisted();
    if (snap) {
      this.state = { ...this.state, hasPersistedSession: true };
    }
  }

  /** Read-only peek at whatever's on disk; null if none / corrupt. */
  peekPersisted(): PersistedSnapshot | null {
    try {
      const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw) as PersistedShape;
      if (!p || p.v !== 1 || !Array.isArray(p.entries)) return null;
      return {
        fingerprint: p.fingerprint,
        total: p.entries.length,
        nextIndex: p.nextIndex,
        consumedCount: p.consumedCount,
        missCount: p.missCount,
        savedAt: p.savedAt,
      };
    } catch {
      return null;
    }
  }

  /**
   * Load fresh serials. Returns whether the new fingerprint matches a
   * persisted session — caller can then decide to call `resumePersisted()`.
   */
  load(serials: string[]): { fingerprint: string; matchesPersisted: boolean } {
    const fp = fingerprint(serials);
    this.entries = serials.map((s, i) => ({ rowIndex: i + 1, serial: s }));
    this.printedSet = new Set();
    this.records = [];
    this.state = {
      total: serials.length,
      nextIndex: 0,
      consumedCount: 0,
      missCount: 0,
      fingerprint: fp,
      lastSavedAt: null,
      hasPersistedSession: this.state.hasPersistedSession,
    };
    this.scheduleSave();
    this.notify();
    const persisted = this.peekPersisted();
    return { fingerprint: fp, matchesPersisted: !!persisted && persisted.fingerprint === fp };
  }

  /**
   * Restore the persisted session into the live catalog. Only valid if the
   * persisted fingerprint matches the currently-loaded entries' fingerprint.
   * Returns true on success.
   */
  resumePersisted(): boolean {
    try {
      const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const p = JSON.parse(raw) as PersistedShape;
      if (!p || p.v !== 1) return false;

      this.entries = p.entries;
      this.printedSet = new Set(p.printedSerials);
      this.records = p.records || [];
      this.state = {
        total: p.entries.length,
        nextIndex: p.nextIndex,
        consumedCount: p.consumedCount,
        missCount: p.missCount,
        fingerprint: p.fingerprint,
        lastSavedAt: p.savedAt,
        hasPersistedSession: true,
      };
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  /** Wipe disk + memory completely. */
  discardPersisted() {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    this.state = { ...this.state, hasPersistedSession: false };
    this.notify();
  }

  /** Pop next serial; returns null if catalog exhausted. */
  dispense(): string | null {
    if (this.state.nextIndex >= this.entries.length) return null;
    const entry = this.entries[this.state.nextIndex];
    // Defensive: should never happen because nextIndex monotonically advances,
    // but guard anyway in case of catalog with internal duplicates.
    if (this.printedSet.has(entry.serial)) {
      console.warn(`[catalog] skipping duplicate serial in source CSV: ${entry.serial}`);
      this.state = { ...this.state, nextIndex: this.state.nextIndex + 1 };
      this.scheduleSave();
      this.notify();
      return this.dispense();
    }
    this.state = { ...this.state, nextIndex: this.state.nextIndex + 1 };
    return entry.serial;
  }

  /**
   * Look at the next serial WITHOUT consuming it. Used by tools like the
   * pre-flight dry run that want to print real (scannable) catalog values
   * without burning rows.
   */
  peek(): string | null {
    if (this.state.nextIndex >= this.entries.length) return null;
    return this.entries[this.state.nextIndex].serial;
  }

  recordPrinted(serial: string, bottleIndex: number) {
    if (this.printedSet.has(serial)) {
      throw new DuplicateSerialError(serial);
    }
    this.printedSet.add(serial);
    this.records.push({
      serial,
      outcome: "printed",
      at: performance.now(),
      wallAt: Date.now(),
      bottleIndex,
    });
    this.state = { ...this.state, consumedCount: this.state.consumedCount + 1 };
    this.scheduleSave();
    this.notify();
  }

  recordMissed(bottleIndex: number) {
    this.records.push({
      serial: "",
      outcome: "missed",
      at: performance.now(),
      wallAt: Date.now(),
      bottleIndex,
    });
    this.state = {
      ...this.state,
      consumedCount: this.state.consumedCount + 1,
      missCount: this.state.missCount + 1,
    };
    this.scheduleSave();
    this.notify();
  }

  /** Reset run progress but keep the loaded catalog (and its fingerprint). */
  reset() {
    this.printedSet = new Set();
    this.records = [];
    this.state = {
      ...this.state,
      nextIndex: 0,
      consumedCount: 0,
      missCount: 0,
    };
    this.scheduleSave();
    this.notify();
  }

  /** Drop everything — entries, run, persistence. */
  clear() {
    this.entries = [];
    this.printedSet = new Set();
    this.records = [];
    this.state = {
      total: 0,
      nextIndex: 0,
      consumedCount: 0,
      missCount: 0,
      fingerprint: null,
      lastSavedAt: null,
      hasPersistedSession: false,
    };
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    this.notify();
  }

  /** True if the serial has already been printed in this (or a resumed) session. */
  hasPrinted(serial: string): boolean {
    return this.printedSet.has(serial);
  }

  getState(): CatalogState { return this.state; }
  getRecords(): LedgerRecord[] { return this.records; }
  getRemaining(): number { return Math.max(0, this.state.total - this.state.nextIndex); }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  /** Force any pending save to flush immediately (e.g. before page unload). */
  flush() {
    if (this.saveTimer != null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.persistNow();
  }

  // --- internals ---

  private scheduleSave() {
    if (this.saveTimer != null) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persistNow();
    }, 250);
  }

  private persistNow() {
    if (typeof localStorage === "undefined") return;
    if (this.entries.length === 0 || !this.state.fingerprint) return;
    try {
      const savedAt = Date.now();
      const payload: PersistedShape = {
        v: 1,
        entries: this.entries,
        nextIndex: this.state.nextIndex,
        consumedCount: this.state.consumedCount,
        missCount: this.state.missCount,
        printedSerials: Array.from(this.printedSet),
        records: this.records,
        fingerprint: this.state.fingerprint,
        savedAt,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      this.state = { ...this.state, lastSavedAt: savedAt, hasPersistedSession: true };
      this.notify();
    } catch (e) {
      // Quota errors here are recoverable — the next save will retry.
      console.warn("[catalog] persist failed:", e);
    }
  }

  private notify() {
    const s = this.state;
    this.listeners.forEach((l) => l(s));
  }
}

export const catalog = new Catalog();

// Best-effort flush on page hide/unload so an in-flight 250ms debounce
// doesn't lose the last few records to a refresh.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => catalog.flush());
  window.addEventListener("beforeunload", () => catalog.flush());
}
