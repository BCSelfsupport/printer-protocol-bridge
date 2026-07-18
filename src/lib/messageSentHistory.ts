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
