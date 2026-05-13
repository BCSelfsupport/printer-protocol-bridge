/**
 * Twin Code — Host-side mirror of the printer's auto-coded serial.
 *
 * In Auto-Code Mode the SIDE printer self-generates the 13-char serial
 * natively (line + program-year letter + Julian DDD + counter + unit).
 * The LID still needs the SAME serial pushed via ^MD^BD1 because
 * DataMatrix barcode fields are static-data only (v2.6 §5.33.2.1).
 *
 * This module keeps a host counter that mirrors the printer's counter
 * slot 1:1, so every photocell tick produces the next matching serial
 * for the LID and the SIDE counter advances in lock-step.
 *
 * Drift is detected separately via the existing ^CN poll on the SIDE.
 */

import { twinPairStore } from "./twinPairStore";
import { letterForCurrentYear } from "./messageSeeds";

const STORAGE_KEY = "twin-code-autocode-counter";

interface PersistedState {
  counter: number;
  yearKey: string;     // e.g. "2026" — bumps reset counter? no, counter is separate
}

class AutoCodeSerialMirror {
  private counter = 0;
  private hydrated = false;

  private hydrate() {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as PersistedState;
        if (Number.isFinite(p.counter)) this.counter = Math.max(0, p.counter | 0);
      }
    } catch { /* ignore */ }
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        counter: this.counter,
        yearKey: String(new Date().getFullYear()),
      } satisfies PersistedState));
    } catch { /* ignore */ }
  }

  /** Reset host counter to a chosen start (default = autoCodeOpts.counterStart). */
  reset(start?: number) {
    this.hydrate();
    const opts = twinPairStore.getState().autoCodeOpts;
    this.counter = Math.max(0, (start ?? opts?.counterStart ?? 0) | 0);
    this.persist();
  }

  /** Current value WITHOUT advancing — useful for UI peek. */
  peek(): number {
    this.hydrate();
    return this.counter + 1;
  }

  /**
   * Advance & return the next 13-char serial matching the printer-native
   * format: `<line><Y><DDD><cnt6><unit>` (e.g. `27A132000001U`).
   * Returns null when Auto-Code Mode is not configured.
   */
  next(): { serial: string; counter: number } | null {
    this.hydrate();
    const pair = twinPairStore.getState();
    if (!pair.autoCodeMode || !pair.autoCodeOpts) return null;

    const { line, unit, yearMap } = pair.autoCodeOpts;
    const normalizedLine = line.toUpperCase();
    const normalizedUnit = unit.toUpperCase();
    this.counter += 1;
    this.persist();

    const yearLetter = letterForCurrentYear(yearMap);
    const doy = dayOfYear(new Date());
    const ddd = String(doy).padStart(3, "0");
    const cnt = String(this.counter).padStart(6, "0");
    const serial = `${normalizedLine}${yearLetter}${ddd}${cnt}${normalizedUnit}`;
    return { serial, counter: this.counter };
  }
}

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

export const autoCodeSerial = new AutoCodeSerialMirror();
