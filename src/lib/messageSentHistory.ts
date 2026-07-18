/**
 * Per-printer "has ever received this message" history.
 *
 * WP-2 of the Per-Printer Message Settings SOW. Stored separately from
 * `MessageDetails` so we don't churn the message-storage schema. Written
 * whenever a message is successfully pushed to a printer (Save, Select,
 * Copy, Sync) — read by the ApplyToPrintersDialog to pre-check the
 * printers that have previously run a given message (Squid parity).
 */
const STORAGE_KEY = 'bestcode-message-sent-history-v1';

// Shape: { [messageName]: { [printerId]: epochMs } }
type SentMap = Record<string, Record<string, number>>;

function load(): SentMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SentMap) : {};
  } catch {
    return {};
  }
}

function save(map: SentMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('[SentHistory] Failed to persist:', e);
  }
}

/** Record a successful push of `messageName` to `printerId`. */
export function recordMessageSent(printerId: number, messageName: string): void {
  if (!messageName || printerId == null) return;
  const map = load();
  const entry = map[messageName] ?? {};
  entry[String(printerId)] = Date.now();
  map[messageName] = entry;
  save(map);
}

/** Every printer that has ever received `messageName`. */
export function getPrintersThatHaveRun(messageName: string): number[] {
  const map = load();
  const entry = map[messageName];
  if (!entry) return [];
  return Object.keys(entry).map(k => Number(k)).filter(n => Number.isFinite(n));
}

/** Last epoch-ms this printer was pushed `messageName`, or null. */
export function getLastSentAt(printerId: number, messageName: string): number | null {
  const map = load();
  return map[messageName]?.[String(printerId)] ?? null;
}

/**
 * WP-7 backfill: for every (printerId, messageName) pair already present in
 * message storage, ensure a history entry exists. Uses epoch 1 as a sentinel
 * "known-sent, timestamp unknown" so pre-check logic (WP-3) still fires for
 * messages that were deployed before the history feature shipped. Idempotent —
 * never overwrites a real timestamp. Safe to call on every app boot.
 */
export function backfillFromStoredKeys(compositeKeys: string[]): void {
  if (!compositeKeys?.length) return;
  const map = load();
  let mutated = false;
  for (const key of compositeKeys) {
    const idx = key.indexOf(':');
    if (idx <= 0) continue;
    const printerId = Number(key.slice(0, idx));
    const messageName = key.slice(idx + 1);
    if (!Number.isFinite(printerId) || !messageName) continue;
    const entry = map[messageName] ?? {};
    if (entry[String(printerId)] == null) {
      entry[String(printerId)] = 1; // sentinel: known-sent, timestamp unknown
      map[messageName] = entry;
      mutated = true;
    }
  }
  if (mutated) save(map);
}

/**
 * WP-7 safety: drop history entries for printers no longer present in the
 * fleet. Prevents unbounded growth as printers are decommissioned. Message
 * names are kept even if the printer no longer has them locally, since the
 * printer may still hold the message on-device.
 */
export function pruneRemovedPrinters(existingPrinterIds: number[]): void {
  const alive = new Set(existingPrinterIds.map(id => String(id)));
  const map = load();
  let mutated = false;
  for (const [name, entry] of Object.entries(map)) {
    for (const pid of Object.keys(entry)) {
      if (!alive.has(pid)) {
        delete entry[pid];
        mutated = true;
      }
    }
    if (Object.keys(entry).length === 0) {
      delete map[name];
      mutated = true;
    }
  }
  if (mutated) save(map);
}
