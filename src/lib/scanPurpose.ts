/**
 * Phone scan requests serve two jobs that must never be confused:
 * - "select": the scanned work-sheet barcode IS a message name → choose that message.
 * - "field":  the scanned value is written into a scan field of an already-chosen message.
 * Select requests are marked by a reserved message_name so no schema change is needed.
 */
export const SELECT_MESSAGE_SCAN = '__SELECT_MESSAGE__';

export function isSelectMessageScan(messageName: string | null | undefined): boolean {
  return messageName === SELECT_MESSAGE_SCAN;
}

/** Find the message whose name matches a scanned work-sheet code (trimmed, case-insensitive). */
export function findMessageByScan<T extends { name: string }>(messages: T[], scanned: string): T | null {
  const code = scanned.trim().toUpperCase();
  if (!code) return null;
  return messages.find((m) => m.name.trim().toUpperCase() === code) ?? null;
}
