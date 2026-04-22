/**
 * Twin Code — Twin Pair binding store.
 *
 * Holds the IP/port (and friendly name) of the two printers that form a
 * bonded "twin pair":
 *   - A = lid printer (Data Matrix 16×16, prints down onto bottle cap)
 *   - B = side printer (text, human-readable serial onto bottle wall)
 *
 * Persisted to localStorage so the binding survives reload. Phase 1b will
 * read from this store to drive real ^FD writes; Phase 1a only uses it to
 * label the simulator and prove the wiring.
 *
 * Future (deferred): serial-port binding (USB/RS-232). For now IP-only.
 */
import { useSyncExternalStore } from "react";

export type BindKind = "ip" | "serial"; // serial reserved for future

export interface TwinPrinterBinding {
  kind: BindKind;
  /** Friendly label, e.g. "Lid printer · Lane 1". */
  name: string;
  /** IP address (when kind === "ip"). */
  ip: string;
  /** TCP port (when kind === "ip"); BestCode default 23. */
  port: number;
}

export interface TwinPairState {
  a: TwinPrinterBinding | null;
  b: TwinPrinterBinding | null;
  /** ISO timestamp of the last successful bind. */
  boundAt: string | null;
}

const STORAGE_KEY = "twin-code:pair-binding:v1";
const EMPTY: TwinPairState = { a: null, b: null, boundAt: null };

function read(): TwinPairState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      a: parsed.a ?? null,
      b: parsed.b ?? null,
      boundAt: parsed.boundAt ?? null,
    };
  } catch {
    return EMPTY;
  }
}

let state: TwinPairState = read();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export const twinPairStore = {
  getState(): TwinPairState {
    return state;
  },
  setBinding(slot: "a" | "b", binding: TwinPrinterBinding | null) {
    state = { ...state, [slot]: binding };
    persist();
    emit();
  },
  setPair(a: TwinPrinterBinding | null, b: TwinPrinterBinding | null) {
    state = { a, b, boundAt: a && b ? new Date().toISOString() : state.boundAt };
    persist();
    emit();
  },
  clear() {
    state = EMPTY;
    persist();
    emit();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useTwinPair(): TwinPairState {
  return useSyncExternalStore(twinPairStore.subscribe, twinPairStore.getState, twinPairStore.getState);
}
