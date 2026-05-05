/**
 * Global pause for background cloud telemetry (Fleet push, registration, etc.).
 *
 * Independent from `pollingPause` (which gates printer TCP polling).
 * Use this to isolate the raw save/printer command path while diagnosing
 * firmware/protocol issues — no network noise from the fleet uploader.
 *
 * State persists in localStorage so it survives a reload (helpful when chasing
 * intermittent save bugs).
 */

const STORAGE_KEY = 'codesync.telemetryPaused';

type Listener = (paused: boolean) => void;

const listeners = new Set<Listener>();

let _paused = false;
try {
  _paused = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1';
} catch {
  _paused = false;
}

export function isTelemetryPaused(): boolean {
  return _paused;
}

export function setTelemetryPaused(paused: boolean): void {
  if (_paused === paused) return;
  _paused = paused;
  try {
    if (paused) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  console.log('[telemetryPause]', paused ? 'PAUSED' : 'RESUMED');
  listeners.forEach((fn) => fn(paused));
}

export function onTelemetryPauseChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
