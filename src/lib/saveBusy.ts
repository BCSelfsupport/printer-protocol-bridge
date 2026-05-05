/**
 * Tracks whether a printer save (^NM/^SV) is currently in flight.
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
