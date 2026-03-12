/**
 * Global polling pause state.
 * 
 * Used by mobile companion to temporarily pause all TCP polling on the PC,
 * allowing the user to make changes on the printer's local HMI without
 * incoming commands interrupting/reverting their edits.
 * 
 * In Electron: pause state lives on the main process; renderer is notified via IPC.
 * In Relay mode: mobile sends HTTP request to PC relay → PC sets pause → renderer picks it up.
 * Fallback: module-level flag for non-Electron (PWA standalone) use.
 */

type PauseListener = (paused: boolean) => void;

let _paused = false;
let _autoResumeTimer: ReturnType<typeof setTimeout> | null = null;
const _listeners = new Set<PauseListener>();

/** Auto-resume after 5 minutes to prevent accidental indefinite pause */
const AUTO_RESUME_MS = 5 * 60 * 1000;

export function isPollingPaused(): boolean {
  return _paused;
}

export function setPollingPaused(paused: boolean): void {
  if (_paused === paused) return;
  _paused = paused;

  // Clear any existing auto-resume timer
  if (_autoResumeTimer) {
    clearTimeout(_autoResumeTimer);
    _autoResumeTimer = null;
  }

  // Set auto-resume when pausing
  if (paused) {
    _autoResumeTimer = setTimeout(() => {
      _paused = false;
      _autoResumeTimer = null;
      _listeners.forEach(fn => fn(false));
      console.log('[pollingPause] Auto-resumed after 5 minutes');
    }, AUTO_RESUME_MS);
  }

  console.log('[pollingPause]', paused ? 'PAUSED' : 'RESUMED');
  _listeners.forEach(fn => fn(paused));
}

export function onPollingPauseChange(listener: PauseListener): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

// --- Electron IPC bridge ---
// When the PC's relay server receives a pause/resume from mobile,
// it notifies the renderer via IPC so the polling hook picks it up.
if (typeof window !== 'undefined' && (window as any).electronAPI?.onPollingPauseChanged) {
  (window as any).electronAPI.onPollingPauseChanged((paused: boolean) => {
    console.log('[pollingPause] IPC from main process:', paused ? 'PAUSED' : 'RESUMED');
    setPollingPaused(paused);
  });
}

// --- Relay transport (for mobile PWA) ---
export async function relaySetPollingPaused(paused: boolean): Promise<boolean> {
  try {
    const stored = localStorage.getItem('relay-config');
    if (!stored) return false;
    const config = JSON.parse(stored);
    const base = `http://${config.pcIp}:${config.port || 8766}`;
    const endpoint = paused ? 'pause-polling' : 'resume-polling';
    const res = await fetch(`${base}/relay/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data.success) {
      // Also update local state for immediate UI feedback
      setPollingPaused(paused);
    }
    return !!data.success;
  } catch (err) {
    console.error('[pollingPause] Relay request failed:', err);
    return false;
  }
}
