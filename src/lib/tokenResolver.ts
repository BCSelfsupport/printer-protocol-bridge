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

const TOKEN_RE = /\{([^{}]+)\}/g;

function isCounterTokenName(name: string): boolean {
  return /^(?:COUNTER|CN|C)\d+$/i.test(name.trim());
}

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
  options?: { preserveCounterTokens?: boolean },
): string {
  if (!data || literalText) return data;
  if (!data.includes('{')) return data; // fast path
  return data.replace(TOKEN_RE, (whole, rawName: string) => {
    const direct = values[rawName];
    if (direct !== undefined) return direct;

    const parts = rawName.split(',').map((part) => part.trim()).filter(Boolean);
    const resolveLegacyToken = (name: string): string | undefined => {
      const trimmed = name.trim();
      if (!trimmed) return undefined;
      if (options?.preserveCounterTokens && isCounterTokenName(trimmed)) return undefined;

      const normalized = labelToToken(trimmed);
      if (options?.preserveCounterTokens && normalized && isCounterTokenName(normalized)) return undefined;
      const legacyCounterMatch = trimmed.toUpperCase().match(/^C(?:N)?(\d+)$/);
      const candidates = [
        trimmed,
        trimmed.toUpperCase(),
        normalized,
        legacyCounterMatch ? `COUNTER${legacyCounterMatch[1]}` : undefined,
      ].filter((candidate): candidate is string => !!candidate);

      for (const candidate of candidates) {
        const value = values[candidate];
        if (value !== undefined) return value;
      }

      if (normalized) {
        const compact = normalized.replace(/_/g, '');
        const fuzzyKey = Object.keys(values).find((key) => key.replace(/_/g, '') === compact);
        if (fuzzyKey) return values[fuzzyKey];
      }

      return undefined;
    };

    if (parts.length > 1) {
      const resolvedParts = parts.map((part) => {
        const resolved = resolveLegacyToken(part);
        if (resolved !== undefined) return resolved;
        return options?.preserveCounterTokens && isCounterTokenName(part) ? `{${part.trim()}}` : part;
      });
      const changed = resolvedParts.some((part, index) => part !== parts[index]);
      return changed ? resolvedParts.join(',') : whole;
    }

    return resolveLegacyToken(rawName) ?? whole;
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
  options?: { preview?: boolean },
): Record<string, string> {
  const map: Record<string, string> = {};
  const preview = options?.preview ?? false;

  for (const f of message.fields) {
    if (!f.promptBeforePrint) continue;
    const token = labelToToken(f.promptLabel);
    if (!token) continue;
    if (f.data) {
      map[token] = f.data;
    } else if (preview) {
      // Editor preview: substitute empty prompt fields with X-placeholders so
      // barcodes/QRs render. Without this, raw `{TOKEN}` survives into the
      // payload and bwip-js rejects the curly braces.
      map[token] = 'X'.repeat(Math.max(1, f.promptLength ?? 3));
    }
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

  // Fallback: derive counter values directly from on-canvas counter fields when
  // advancedSettings.counters is missing/empty (e.g. messages loaded from the
  // printer with default settings). Prefer the live polled counter when present,
  // otherwise fall back to the fetched field text.
  for (const f of message.fields) {
    if (f.type !== 'counter') continue;
    const slotMatch = f.autoCodeFieldType?.match(/^counter_(\d+)$/i);
    const slot = slotMatch ? parseInt(slotMatch[1], 10) : undefined;
    if (!slot) continue;
    const key = `COUNTER${slot}`;
    if (map[key] === undefined) {
      const live = customCounters?.[slot - 1];
      if (live !== undefined) {
        const width = Math.max(String(f.data ?? '').length, String(live).length, 1);
        map[key] = String(live).padStart(width, '0');
      } else if (f.data) {
        map[key] = f.data;
      }
    }
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
  options?: { preserveCounterTokens?: boolean },
): MessageField[] {
  return fields.map((f) => {
    const resolved = resolveFieldData(f.data, tokenMap, f.literalText, options);
    return resolved === f.data ? f : { ...f, data: resolved };
  });
}

/** Quickly test whether a string contains any token placeholders. */
export function hasTokens(data: string | undefined): boolean {
  if (!data) return false;
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(data);
}
