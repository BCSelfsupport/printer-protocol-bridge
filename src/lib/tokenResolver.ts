/**
 * Token resolver — Mechanism 1 (named tokens).
 *
 * Lets fields embed values from other fields using {TOKEN_NAME} syntax.
 * Tokens come from:
 *   - Scanned/Prompted fields: token name = sanitised promptLabel (e.g. "WORK ORDER" → WORK_ORDER)
 *   - Counters: COUNTER1, COUNTER2, …
 *
 * Substitution is on by default for every field. A field with `literalText: true`
 * is left untouched (escape hatch for printing literal `{` `}`).
 */

import type { MessageField, MessageDetails } from '@/components/screens/EditMessageScreen';

const TOKEN_RE = /\{([A-Z0-9_]+)\}/g;

/** Convert a free-form prompt label to a canonical token identifier. */
export function labelToToken(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const cleaned = label.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : undefined;
}

export interface TokenSource {
  /** Display name shown in the picker (the original label). */
  label: string;
  /** Canonical token identifier used in `{TOKEN}` syntax. */
  token: string;
  /** What kind of source produced this token. */
  kind: 'scanned' | 'prompted' | 'counter';
  /** Sample/preview value for editor rendering. */
  preview: string;
}

/**
 * Build a list of tokens currently available within a message.
 * Used by the Linked Field picker and the canvas preview.
 */
export function collectMessageTokens(message: MessageDetails): TokenSource[] {
  const out: TokenSource[] = [];
  const seen = new Set<string>();

  // Scanned + Prompted fields → tokens from their promptLabel
  for (const f of message.fields) {
    if (!f.promptBeforePrint) continue;
    const token = labelToToken(f.promptLabel);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    const isScan = f.promptSource === 'scanner';
    out.push({
      label: f.promptLabel ?? token,
      token,
      kind: isScan ? 'scanned' : 'prompted',
      preview: 'X'.repeat(Math.max(1, f.promptLength ?? 3)),
    });
  }

  // Counters declared in advancedSettings
  const counters = message.advancedSettings?.counters ?? [];
  for (const c of counters) {
    const token = `COUNTER${c.id}`;
    if (seen.has(token)) continue;
    seen.add(token);
    const start = c.startCount ?? 0;
    const digits = (c.endCount ?? 9999).toString().length;
    const preview = c.leadingZeroes ? start.toString().padStart(digits, '0') : start.toString();
    out.push({
      label: `Counter ${c.id}`,
      token,
      kind: 'counter',
      preview,
    });
  }

  return out;
}

/**
 * Resolve `{TOKEN}` placeholders inside a single field's data string.
 * Unknown tokens are left intact so they don't silently disappear.
 */
export function resolveFieldData(
  data: string,
  values: Record<string, string>,
  literalText?: boolean,
): string {
  if (!data || literalText) return data;
  if (!data.includes('{')) return data; // fast path
  return data.replace(TOKEN_RE, (whole, name: string) => {
    const v = values[name];
    return v !== undefined ? v : whole;
  });
}

/**
 * Build a token → value map from a message + runtime overrides.
 *  - Prompt/scan fields contribute their current `data` (already baked or default).
 *  - Counters contribute the live count from `customCounters` (1-indexed array).
 */
export function buildTokenMap(
  message: MessageDetails,
  customCounters?: number[],
  overrides?: Record<string, string>,
): Record<string, string> {
  const map: Record<string, string> = {};

  for (const f of message.fields) {
    if (!f.promptBeforePrint) continue;
    const token = labelToToken(f.promptLabel);
    if (!token) continue;
    if (f.data) map[token] = f.data;
  }

  const counters = message.advancedSettings?.counters ?? [];
  for (const c of counters) {
    // Live counter only used when explicitly provided. Editor preview omits it
    // so the user's configured startCount drives the display.
    const live = customCounters?.[c.id - 1];
    const start = c.startCount ?? 0;
    const value = live ?? start;
    const digits = (c.endCount ?? 9999).toString().length;
    map[`COUNTER${c.id}`] = c.leadingZeroes ? value.toString().padStart(digits, '0') : value.toString();
  }

  if (overrides) Object.assign(map, overrides);
  return map;
}

/**
 * Apply token substitution across every field in a message.
 * Returns a new field list — does NOT mutate the input.
 * Fields flagged `literalText` are skipped.
 */
export function resolveAllFields(
  fields: MessageField[],
  tokenMap: Record<string, string>,
): MessageField[] {
  return fields.map((f) => {
    const resolved = resolveFieldData(f.data, tokenMap, f.literalText);
    return resolved === f.data ? f : { ...f, data: resolved };
  });
}

/** Quickly test whether a string contains any token placeholders. */
export function hasTokens(data: string | undefined): boolean {
  if (!data) return false;
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(data);
}
