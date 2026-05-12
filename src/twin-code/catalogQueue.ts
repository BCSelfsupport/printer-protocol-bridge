/**
 * Twin Code — Catalog Queue (on-deck slot for continuous-run lots).
 *
 * Customer scenario (Authentix, 2026-05):
 *   "A file of 1 million records would cover a day's numbers. We could upload
 *    the whole file and then upload a new one the next day. Unfortunately, the
 *    lines typically run through midnight."
 *
 * Solution: operators pre-stage the next CSV in an "on-deck" slot. When the
 * active catalog drops to a low-water mark (default 5,000 remaining), the
 * head of the queue is automatically appended onto the running catalog —
 * `catalog.appendSerials()` keeps the existing printedSet / records / cursor
 * intact, so the bonded dispatcher never sees a `dispense() === null` at
 * shift change and the production run keeps rolling across midnight.
 *
 * Persistence: the queue is mirrored to localStorage so a refresh / Electron
 * restart doesn't lose the next day's file. Each item carries its own
 * fingerprint + filename for the audit trail.
 */

import { catalog } from "./catalog";

const QUEUE_STORAGE_KEY = "twincode.catalogQueue.v1";
const LOW_WATER_KEY = "twincode.catalogQueue.lowWater.v1";
const DEFAULT_LOW_WATER = 5000;

/** Customer-confirmed serial shape: 27 A 159 000001 U → 13 chars. */
export const SERIAL_FORMAT = /^\d{2}[A-Z]\d{3}\d{6}U$/;

export interface QueuedCatalog {
  /** FNV-1a fingerprint of the serials (matches catalog's own scheme). */
  fingerprint: string;
  filename: string;
  serials: string[];
  addedAt: number;
}

export interface CatalogQueueState {
  items: QueuedCatalog[];
  lowWater: number;
  lastPromotion: { fingerprint: string; filename: string; at: number; appended: number; skipped: number } | null;
}

type Listener = (state: CatalogQueueState) => void;

/** Same FNV-1a as `catalog.ts` so a re-uploaded file fingerprints identically. */
function fingerprint(serials: string[]): string {
  let h = 0x811c9dc5;
  const s = `${serials.length}\u0001${serials.join("\u0002")}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

class CatalogQueue {
  private state: CatalogQueueState;
  private listeners = new Set<Listener>();
  private catalogUnsub: (() => void) | null = null;
  private promoting = false;
  private onPromote: ((q: QueuedCatalog, appended: number, skipped: number) => void) | null = null;

  constructor() {
    this.state = {
      items: this.loadItems(),
      lowWater: this.loadLowWater(),
      lastPromotion: null,
    };
    this.armWatcher();
  }

  getState(): CatalogQueueState { return this.state; }
  getItems(): QueuedCatalog[] { return this.state.items; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  /** UI hook — fires whenever a queued catalog is auto-promoted. */
  setOnPromote(fn: ((q: QueuedCatalog, appended: number, skipped: number) => void) | null) {
    this.onPromote = fn;
  }

  /**
   * Add a CSV to the on-deck queue.
   * Validates: must pass SERIAL_FORMAT for every row, must not duplicate the
   * fingerprint of the active catalog or anything already queued.
   */
  enqueue(serials: string[], filename: string): { ok: true } | { ok: false; reason: string } {
    if (serials.length === 0) return { ok: false, reason: "CSV is empty." };
    const bad = serials.findIndex((s) => !SERIAL_FORMAT.test(s));
    if (bad !== -1) {
      return { ok: false, reason: `Row ${bad + 1} ("${serials[bad]}") doesn't match the expected LL Y JJJ NNNNNN U shape.` };
    }
    const fp = fingerprint(serials);
    if (catalog.getState().fingerprint === fp) {
      return { ok: false, reason: "This file matches the currently-active catalog." };
    }
    if (this.state.items.some((q) => q.fingerprint === fp)) {
      return { ok: false, reason: "This file is already on deck." };
    }
    const item: QueuedCatalog = { fingerprint: fp, filename, serials, addedAt: Date.now() };
    this.state = { ...this.state, items: [...this.state.items, item] };
    this.persist();
    this.notify();
    return { ok: true };
  }

  removeAt(idx: number) {
    if (idx < 0 || idx >= this.state.items.length) return;
    this.state = { ...this.state, items: this.state.items.filter((_, i) => i !== idx) };
    this.persist();
    this.notify();
  }

  clear() {
    this.state = { ...this.state, items: [] };
    this.persist();
    this.notify();
  }

  setLowWater(n: number) {
    const v = Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_LOW_WATER;
    this.state = { ...this.state, lowWater: v };
    try { localStorage.setItem(LOW_WATER_KEY, String(v)); } catch { /* ignore */ }
    this.notify();
  }

  /** Manual trigger — promote the head of the queue right now. */
  promoteNow(): boolean {
    return this.tryPromote(true);
  }

  // --- internals ---

  private armWatcher() {
    if (this.catalogUnsub) return;
    this.catalogUnsub = catalog.subscribe(() => {
      this.tryPromote(false);
    });
  }

  /**
   * If the active catalog's remaining serials have dropped to or below the
   * low-water mark (or it's exhausted), append the head of the queue.
   * `force=true` skips the threshold check (manual promote button).
   */
  private tryPromote(force: boolean): boolean {
    if (this.promoting) return false;
    if (this.state.items.length === 0) return false;
    const cs = catalog.getState();
    const remaining = Math.max(0, cs.total - cs.nextIndex);
    // Don't promote if there's no active catalog at all — operator should
    // load the first one through the normal flow so the resume banner still works.
    if (cs.total === 0) return false;
    if (!force && remaining > this.state.lowWater) return false;

    this.promoting = true;
    try {
      const next = this.state.items[0];
      const result = catalog.appendSerials(next.serials);
      this.state = {
        ...this.state,
        items: this.state.items.slice(1),
        lastPromotion: {
          fingerprint: next.fingerprint,
          filename: next.filename,
          at: Date.now(),
          appended: result.appended,
          skipped: result.skipped,
        },
      };
      this.persist();
      this.notify();
      if (this.onPromote) this.onPromote(next, result.appended, result.skipped);
      return true;
    } finally {
      // Release the latch on the next microtask so the catalog's notify cascade
      // settles before another promotion can fire.
      Promise.resolve().then(() => { this.promoting = false; });
    }
  }

  private persist() {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify({ v: 1, items: this.state.items }));
    } catch { /* ignore */ }
  }

  private loadItems(): QueuedCatalog[] {
    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (!raw) return [];
      const p = JSON.parse(raw) as { v: number; items: QueuedCatalog[] };
      if (!p || p.v !== 1 || !Array.isArray(p.items)) return [];
      return p.items.filter((q) => q && Array.isArray(q.serials) && q.fingerprint);
    } catch {
      return [];
    }
  }

  private loadLowWater(): number {
    try {
      const raw = localStorage.getItem(LOW_WATER_KEY);
      if (!raw) return DEFAULT_LOW_WATER;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LOW_WATER;
    } catch { return DEFAULT_LOW_WATER; }
  }

  private notify() {
    this.listeners.forEach((l) => l(this.state));
  }
}

export const catalogQueue = new CatalogQueue();
