/**
 * Twin Code — TnT Print Message format (Authentix Interface Spec §5).
 *
 * Authentix clarification (2026-07-17):
 *   "Section 5 of our Interface spec lays out the full Print Message format,
 *    17 char for No Lot Code msg, 24 char for With Lot code. The Serial No in
 *    the Print message indicates the starting Serial Code. The BestCode logic
 *    will need to use this full message format and increment the Serial Code
 *    within the overall format."
 *
 * So: TnT hands us the FULL formatted string with a *starting* serial; CodeSync
 * prints that whole string and increments only the serial sub-field per bottle.
 * The identical string goes to BOTH printers (lid DataMatrix + side text).
 *
 * ⚠️ PROVISIONAL FIELD LAYOUT
 * The overall lengths (17 / 24) and the "increment the serial inside the
 * format" rule are confirmed. The exact *offsets* below are derived from the
 * customer's worked example and MUST be re-checked against Interface Spec §5
 * text (and the promised pcap) before go-live. Everything that depends on the
 * layout is funnelled through `PRINT_MESSAGE_LAYOUT` so it is a one-line fix.
 *
 *   Example (spaced for readability): `3 001 08 A180 220274 U`
 *   Compact (17 chars):               `300108A180220274U`
 *                                      ^ ^  ^ ^   ^     ^
 *                                      | |  | |   |     unit          (1)
 *                                      | |  | |   serial              (6)
 *                                      | |  | code                    (4)
 *                                      | |  line                      (2)
 *                                      | config / part                (3)
 *                                      production / diversion rule    (1)
 *
 *   With lot code the message is 24 chars: the same 17 plus a 7-char lot
 *   block appended after the unit character.
 */

export const PRINT_MESSAGE_LEN_NO_LOT = 17;
export const PRINT_MESSAGE_LEN_WITH_LOT = 24;

/** Character offsets into the COMPACT (space-stripped) message. */
export const PRINT_MESSAGE_LAYOUT = {
  production: { start: 0, len: 1 },
  config: { start: 1, len: 3 },
  line: { start: 4, len: 2 },
  code: { start: 6, len: 4 },
  serial: { start: 10, len: 6 },
  unit: { start: 16, len: 1 },
  /** Only present on the 24-char (with lot code) variant. */
  lot: { start: 17, len: 7 },
} as const;

export interface ParsedPrintMessage {
  /** Original string exactly as received (spacing preserved). */
  raw: string;
  /** Space-stripped message — this is what gets measured / re-serialised. */
  compact: string;
  hasLotCode: boolean;
  production: string;
  config: string;
  line: string;
  code: string;
  /** Zero-padded serial sub-field, as text (leading zeros are significant). */
  serial: string;
  /** Numeric value of the serial sub-field. */
  serialValue: number;
  unit: string;
  lot: string | null;
}

export class PrintMessageFormatError extends Error {}

const slice = (s: string, f: { start: number; len: number }) =>
  s.slice(f.start, f.start + f.len);

/** Strip the human-readable spacing TnT may include. */
export function compactPrintMessage(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/** True when the compact length matches a documented §5 variant. */
export function isPrintMessageLength(len: number): boolean {
  return len === PRINT_MESSAGE_LEN_NO_LOT || len === PRINT_MESSAGE_LEN_WITH_LOT;
}

/**
 * Parse a full Print Message into its sub-fields.
 * Throws `PrintMessageFormatError` on any length / charset violation — a
 * malformed Print Message is a Category 1 (fatal) condition, never something
 * to guess our way through.
 */
export function parsePrintMessage(raw: string): ParsedPrintMessage {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new PrintMessageFormatError("Print Message is empty");
  }
  const compact = compactPrintMessage(raw);
  if (!isPrintMessageLength(compact.length)) {
    throw new PrintMessageFormatError(
      `Print Message must be ${PRINT_MESSAGE_LEN_NO_LOT} chars (no lot code) or ` +
        `${PRINT_MESSAGE_LEN_WITH_LOT} chars (with lot code); got ${compact.length} ("${compact}")`,
    );
  }
  if (!/^[A-Z0-9]+$/.test(compact)) {
    throw new PrintMessageFormatError(
      `Print Message must be uppercase A–Z / 0–9 only; got "${compact}"`,
    );
  }
  const serial = slice(compact, PRINT_MESSAGE_LAYOUT.serial);
  if (!/^\d+$/.test(serial)) {
    throw new PrintMessageFormatError(
      `Serial sub-field must be ${PRINT_MESSAGE_LAYOUT.serial.len} digits; got "${serial}"`,
    );
  }
  const hasLotCode = compact.length === PRINT_MESSAGE_LEN_WITH_LOT;
  return {
    raw,
    compact,
    hasLotCode,
    production: slice(compact, PRINT_MESSAGE_LAYOUT.production),
    config: slice(compact, PRINT_MESSAGE_LAYOUT.config),
    line: slice(compact, PRINT_MESSAGE_LAYOUT.line),
    code: slice(compact, PRINT_MESSAGE_LAYOUT.code),
    serial,
    serialValue: Number(serial),
    unit: slice(compact, PRINT_MESSAGE_LAYOUT.unit),
    lot: hasLotCode ? slice(compact, PRINT_MESSAGE_LAYOUT.lot) : null,
  };
}

/** Non-throwing variant for UI validation. */
export function validatePrintMessage(
  raw: string,
): { ok: true; parsed: ParsedPrintMessage } | { ok: false; error: string } {
  try {
    return { ok: true, parsed: parsePrintMessage(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Re-serialise a parsed message with a different serial value. */
export function withSerial(parsed: ParsedPrintMessage, serialValue: number): string {
  const width = PRINT_MESSAGE_LAYOUT.serial.len;
  const max = 10 ** width;
  if (!Number.isFinite(serialValue) || serialValue < 0) {
    throw new PrintMessageFormatError(`Serial must be a non-negative number; got ${serialValue}`);
  }
  // Roll over rather than overflow the fixed-width field. TnT owns the real
  // range; a wrap here is a loud condition the caller can detect via
  // `serialWillWrap()` before dispatching.
  const next = String(serialValue % max).padStart(width, "0");
  const { start } = PRINT_MESSAGE_LAYOUT.serial;
  return parsed.compact.slice(0, start) + next + parsed.compact.slice(start + width);
}

/** True when incrementing by `by` would wrap the fixed-width serial field. */
export function serialWillWrap(parsed: ParsedPrintMessage, by = 1): boolean {
  return parsed.serialValue + by >= 10 ** PRINT_MESSAGE_LAYOUT.serial.len;
}

/**
 * Advance the serial inside the format. Everything else is preserved byte for
 * byte — production rule, config, line, code, unit and lot code are fixed
 * template text owned by TnT.
 */
export function incrementPrintMessage(raw: string | ParsedPrintMessage, by = 1): string {
  const parsed = typeof raw === "string" ? parsePrintMessage(raw) : raw;
  return withSerial(parsed, parsed.serialValue + by);
}

/**
 * Build the sequence of messages for a run of `count` bottles starting at the
 * message TnT gave us (the first bottle prints the starting serial itself).
 */
export function printMessageSequence(raw: string, count: number): string[] {
  const parsed = parsePrintMessage(raw);
  const out: string[] = [];
  for (let i = 0; i < Math.max(0, count | 0); i++) {
    out.push(withSerial(parsed, parsed.serialValue + i));
  }
  return out;
}

/**
 * Host-side serial authority for a live run.
 *
 * TnT sends the starting serial in the Config / Print message and (per
 * Authentix Q11) always sends the correct next starting serial on a re-Config,
 * so `reseed()` is an unconditional reset — CodeSync never rewinds on its own.
 */
export class PrintMessageCounter {
  private parsed: ParsedPrintMessage | null = null;
  private offset = 0;

  /** Accept a (re-)Config starting message. Resets the offset. */
  reseed(raw: string): ParsedPrintMessage {
    this.parsed = parsePrintMessage(raw);
    this.offset = 0;
    return this.parsed;
  }

  get seeded(): boolean {
    return this.parsed !== null;
  }

  /** Message for the next bottle WITHOUT consuming it. */
  peek(): string | null {
    if (!this.parsed) return null;
    return withSerial(this.parsed, this.parsed.serialValue + this.offset);
  }

  /** Consume and return the message for this bottle. */
  next(): string | null {
    const m = this.peek();
    if (m !== null) this.offset += 1;
    return m;
  }

  /** How many bottles have been dispensed since the last (re-)Config. */
  get dispensed(): number {
    return this.offset;
  }

  clear() {
    this.parsed = null;
    this.offset = 0;
  }
}

/**
 * ECC200 square symbol capacities (ISO/IEC 16022) — used to sanity-check that
 * the lid DataMatrix is large enough for the real payload.
 *
 * The seeded lid field is 16×16 (`^AB … s=5`), which holds only 16 alphanumeric
 * characters — NOT enough for a 17- or 24-char Print Message. Preflight must
 * flag this so the operator/protocol table picks a larger symbol.
 */
export const ECC200_ALPHANUMERIC_CAPACITY: Record<string, number> = {
  "10x10": 3,
  "12x12": 6,
  "14x14": 10,
  "16x16": 16,
  "18x18": 22,
  "20x20": 30,
  "22x22": 36,
  "24x24": 44,
  "26x26": 52,
  "32x32": 64,
};

/** Smallest square ECC200 symbol that fits `len` alphanumeric characters. */
export function smallestDataMatrixFor(len: number): string | null {
  const fit = Object.entries(ECC200_ALPHANUMERIC_CAPACITY)
    .filter(([, cap]) => cap >= len)
    .sort((a, b) => a[1] - b[1])[0];
  return fit ? fit[0] : null;
}

/**
 * Does the currently-configured lid symbol hold this payload?
 * Returns a preflight-friendly verdict rather than throwing.
 */
export function checkDataMatrixCapacity(
  payloadLength: number,
  symbol = "16x16",
): { ok: boolean; capacity: number; recommended: string | null; message: string } {
  const capacity = ECC200_ALPHANUMERIC_CAPACITY[symbol] ?? 0;
  const recommended = smallestDataMatrixFor(payloadLength);
  const ok = capacity >= payloadLength;
  return {
    ok,
    capacity,
    recommended,
    message: ok
      ? `${symbol} ECC200 holds ${capacity} alphanumeric chars — payload is ${payloadLength}.`
      : `${symbol} ECC200 holds only ${capacity} alphanumeric chars but the Print Message is ` +
        `${payloadLength}. Use ${recommended ?? "a larger symbol"} on the lid field ` +
        `(^AB size parameter — confirm the size code against protocol v2.6 §5.33.2.1).`,
  };
}
