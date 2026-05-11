/**
 * Twin Code — Print Go mode (shared).
 *
 * Tiny pub/sub store + React hook for the Auto-Print-Go-vs-Production toggle.
 * Lives outside any single panel so both the Debug Conveyor controls AND the
 * Hub line-controls bar stay in lock-step (and the dispatcher reads the same
 * value via `getPrintGoMode()` rather than threading props through three layers).
 *
 * Persisted to localStorage so production floors don't lose the setting on
 * refresh / Electron restart.
 */

import { useEffect, useState } from "react";

const KEY = "twincode.productionMode";
type Listener = (v: boolean) => void;
const listeners = new Set<Listener>();

let current: boolean = (() => {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
})();

export function getProductionMode(): boolean { return current; }

export function setProductionMode(v: boolean) {
  if (current === v) return;
  current = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {}
  listeners.forEach((l) => l(v));
}

export function subscribeProductionMode(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook — reactive read/write of the shared production-mode flag. */
export function useProductionMode(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(current);
  useEffect(() => subscribeProductionMode(setV), []);
  return [v, setProductionMode];
}
