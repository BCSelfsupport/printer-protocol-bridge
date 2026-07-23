/**
 * Renderer-side write serialization for fragile BestCode port-23 sessions.
 *
 * Electron main serializes individual socket writes, but master→slave sync is a
 * multi-command transaction: connect → ^NM/^NF → ^SM → disconnect. If two
 * UI paths start that transaction at the same time, their commands can interleave
 * or one path can disconnect while the other is still committing. These queues
 * keep the transaction itself exclusive.
 *
 * Ownership tracking (activeLocks) lets the transport layer detect and warn
 * about unguarded writes at runtime — see printerTransport.ts.
 */

const printerChains = new Map<number, Promise<void>>();
let fleetChain: Promise<void> = Promise.resolve();

// Printer IDs whose exclusive lock is currently held. Consulted by the
// transport tripwire to detect writes made outside the lock.
const activeLocks = new Set<number>();
let fleetLockHeld = 0;

export function isPrinterWriteExclusiveHeld(printerId: number): boolean {
  return activeLocks.has(printerId);
}

export function isFleetWriteExclusiveHeld(): boolean {
  return fleetLockHeld > 0;
}

export async function runPrinterWriteExclusive<T>(printerId: number, fn: () => Promise<T>): Promise<T> {
  const previous = printerChains.get(printerId) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current, () => current);
  printerChains.set(printerId, queued);

  await previous.catch(() => undefined);
  activeLocks.add(printerId);
  try {
    return await fn();
  } finally {
    activeLocks.delete(printerId);
    release();
    if (printerChains.get(printerId) === queued) {
      printerChains.delete(printerId);
    }
  }
}

export async function runFleetWriteExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const previous = fleetChain;

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current, () => current);
  fleetChain = queued;

  await previous.catch(() => undefined);
  fleetLockHeld += 1;
  try {
    return await fn();
  } finally {
    fleetLockHeld = Math.max(0, fleetLockHeld - 1);
    release();
    if (fleetChain === queued) {
      fleetChain = Promise.resolve();
    }
  }
}
