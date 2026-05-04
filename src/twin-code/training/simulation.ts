/**
 * Twin Code — Training simulation
 * --------------------------------
 * Stand-up / tear-down hooks for "safe practice" training. Loads the bundled
 * sample catalog (public/sample-data/twin-code-serials-1000.csv) so operators
 * walk the *real* production path during the tour — Catalog → Bind → Preview
 * → Pre-flight → LIVE → Production Run → signed exports — without needing
 * real printers or a real CSV.
 *
 * Why CSV instead of syntheticGenerator? The synthetic generator was the
 * Phase-1 demo path, but production now runs entirely off the catalog +
 * conveyor + bonded dispatcher. Training that uses anything else lies to the
 * operator. The bundled CSV gives Production Run real serials to consume so
 * the signed CSV/JSON/Envelope artifacts are genuine practice outputs.
 */

import { catalog } from '../catalog';
import { profilerBus } from '../profilerBus';

const SAMPLE_CSV_URL = '/sample-data/twin-code-serials-1000.csv';
const TRAINING_FLAG_KEY = 'twincode.training.simLoaded.v1';

let active = false;

/**
 * Load the bundled 1000-serial sample CSV into the catalog if it's empty.
 * Idempotent — if a real catalog is already loaded, we leave it alone so we
 * never trample the operator's actual lot data.
 */
export async function startTrainingSimulation() {
  if (active) return;
  active = true;
  if (!profilerBus.getSession()) {
    profilerBus.startSession('Training — sample catalog');
  }
  // Don't trample a real catalog the operator has staged.
  if (catalog.getState().total > 0) return;
  try {
    const res = await fetch(SAMPLE_CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const serials = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^serial$/i.test(l));
    if (serials.length === 0) throw new Error('sample CSV empty');
    catalog.load(serials);
    try { sessionStorage.setItem(TRAINING_FLAG_KEY, '1'); } catch { /* ignore */ }
  } catch (err) {
    console.warn('[training] failed to load sample catalog', err);
  }
}

/**
 * Tear down — only clears the catalog if WE were the ones who loaded it
 * (flag set in startTrainingSimulation). Otherwise the operator's real CSV
 * survives.
 */
export function stopTrainingSimulation() {
  if (!active) return;
  active = false;
  try {
    if (sessionStorage.getItem(TRAINING_FLAG_KEY) === '1') {
      catalog.clear();
      sessionStorage.removeItem(TRAINING_FLAG_KEY);
    }
  } catch { /* ignore */ }
}

export function isTrainingSimulationActive() {
  return active;
}
