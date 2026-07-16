/**
 * Renderer-side write serialization for fragile BestCode port-23 sessions.
 *
 * Electron main serializes individual socket writes, but master→slave sync is a
 * multi-command transaction: connect → ^NM/^NF → ^SV → ^SM → disconnect. If two
 * UI paths start that transaction at the same time, their commands can interleave
 * or one path can disconnect while the other is still committing. These queues
 * keep the transaction itself exclusive.
 */

const printerChains = new Map<number, Promise<void>>();
let fleetChain: Promise<void> = Promise.resolve();

export async function runPrinterWriteExclusive<T>(printerId: number, fn: () => Promise<T>): Promise<T> {
  const previous = printerChains.get(printerId) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  printerChains.set(printerId, previous.then(() => current, () => current));

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (printerChains.get(printerId) === current) {
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
  fleetChain = previous.then(() => current, () => current);

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (fleetChain === current) {
      fleetChain = Promise.resolve();
    }
  }
}