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
export type DispatchSubcommand = "BD" | "TD";

export interface TwinPrinterBinding {
  kind: BindKind;
  /** Friendly label, e.g. "Lid printer · Lane 1". */
  name: string;
  /** IP address (when kind === "ip"). */
  ip: string;
  /** TCP port (when kind === "ip"); BestCode default 23. */
  port: number;
  /**
   * Per-side dispatch config — what message to ^SM-select on bind, which field
   * index inside that message receives the serial, and which ^MD subcommand
   * (BD = native barcode update for DataMatrix/QR/Code128, TD = text update).
   *
   * Customer rule of thumb (Authentix lid+side pair):
   *   A (lid)  → messageName "LID",  field 1, subcommand BD  (DataMatrix 16x16)
   *   B (side) → messageName "SIDE", field 1, subcommand TD  (human-readable text)
   *
   * All three are optional in the type so v1 store entries (which only had
   * { kind, name, ip, port }) keep loading; the dispatcher falls back to its
   * own defaults when these are absent.
   */
  messageName?: string;
  fieldIndex?: number;
  subcommand?: DispatchSubcommand;
  /**
   * When true, on bind the dispatcher will check ^LM and seed a canonical
   * message (LID = DM 16×16, SIDE = 7×5 text, both on a 16-dot template) if
   * the named message doesn't yet exist on the printer. Removes the manual
   * step of building the message on the printer HMI before first run.
   * Default true for new bindings — operator can opt out per side in the
   * TwinPairBindDialog. See `src/twin-code/messageSeeds.ts`.
   */
  autoCreate?: boolean;
}

export interface TwinPairState {
  a: TwinPrinterBinding | null;
  b: TwinPrinterBinding | null;
  /** ISO timestamp of the last successful bind. */
  boundAt: string | null;
}

const STORAGE_KEY = "twin-code:pair-binding:v1";
const EMPTY: TwinPairState = { a: null, b: null, boundAt: null };

function migrateBinding(b: any): TwinPrinterBinding | null {
  if (!b || typeof b !== "object") return null;
  if (typeof b.ip !== "string" || typeof b.port !== "number") return null;
  return {
    kind: b.kind === "serial" ? "serial" : "ip",
    name: typeof b.name === "string" ? b.name : "",
    ip: b.ip,
    port: b.port,
    messageName: typeof b.messageName === "string" && b.messageName.trim() ? b.messageName.trim() : undefined,
    fieldIndex: Number.isInteger(b.fieldIndex) && b.fieldIndex > 0 ? b.fieldIndex : undefined,
    subcommand: b.subcommand === "BD" || b.subcommand === "TD" ? b.subcommand : undefined,
    // v3 default: auto-create on. Legacy v1/v2 entries opt-in by re-saving from the dialog.
    autoCreate: typeof b.autoCreate === "boolean" ? b.autoCreate : true,
  };
}

function read(): TwinPairState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      a: migrateBinding(parsed.a),
      b: migrateBinding(parsed.b),
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
