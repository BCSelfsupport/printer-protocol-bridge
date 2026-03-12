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
