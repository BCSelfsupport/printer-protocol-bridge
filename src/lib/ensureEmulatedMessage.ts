import type { MessageDetails } from '@/components/screens/EditMessageScreen';

/** Selecting by name cannot load a message that has not been sent to this emulator. */
export async function ensureEmulatedMessage(
  name: string,
  existingNames: string[],
  details: MessageDetails | null,
  write: (details: MessageDetails) => Promise<boolean>,
): Promise<{ ok: boolean; created: boolean; reason?: string }> {
  if (existingNames.some(existing => existing.toUpperCase() === name.toUpperCase())) {
    return { ok: true, created: false };
  }
  if (!details || details.fields.length === 0) {
    return { ok: false, created: false, reason: `Message "${name}" is missing from this printer and its saved content is unavailable` };
  }
  if (!await write(details)) {
    return { ok: false, created: false, reason: `Printer rejected the upload of "${name}"` };
  }
  return { ok: true, created: true };
}