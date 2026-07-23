/**
 * Tracks whether a printer save (^NM / ^NF / ^DM) is currently in flight.
 *
 * Background uploaders (Fleet telemetry/registration) check this and DEFER
 * their HTTP work while the printer save is committing. Heavy fields (8+)
 * are sensitive to any concurrent CPU/network spike during the firmware
 * digest window — Fleet pushes were observed to lock up F8/F9 saves.
 *
 * This is independent of pollingPause (TCP) and telemetryPause (manual dev toggle).
 */

let _busyCount = 0;
let _busyUntil = 0; // grace window after release

const GRACE_MS = 4000;

export function beginSaveBusy(): () => void {
  _busyCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    _busyCount = Math.max(0, _busyCount - 1);
    if (_busyCount === 0) {
      _busyUntil = Date.now() + GRACE_MS;
    }
  };
}

export function isSaveBusy(): boolean {
  return _busyCount > 0 || Date.now() < _busyUntil;
}

/**
 * Awaits until no save is in flight (and the grace window has passed).
 * Returns true if idle, false on timeout. Use to defer non-critical
 * writes (master→slave sync, broadcasts) so they don't collide with
 * the active post-^NM digest window on the same TCP socket.
 */
export async function waitForSaveIdle(timeoutMs = 15000, pollMs = 150): Promise<boolean> {
  if (!isSaveBusy()) return true;
  const start = Date.now();
  while (isSaveBusy()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return true;
}
