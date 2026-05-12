/**
 * Twin Code — Canonical message seeds (auto-create on bind)
 * ----------------------------------------------------------
 * Hand-validated ^DM/^NM/^SV sequences that guarantee the LID and SIDE
 * printers each have exactly the message + field shape the dispatcher
 * expects. Seeded ONCE per printer; subsequent binds skip seeding when
 * ^LM shows the message already exists.
 *
 * Why a seed instead of programmatic synthesis?
 *   - Removes operator error during first hardware bring-up (wrong field
 *     type, off-by-one index, missing ^SV, mismatched template).
 *   - The dispatcher hot path (^MD^BD1 / ^MD^TD1) is dead simple as long
 *     as the field shape is exactly right — so we lock that shape here.
 *   - Single-source-of-truth for the customer's physical layout
 *     (Authentix lid+side, Model 88, 16-dot template, 13-char serials).
 *
 * Layout (decided 2026-04-24):
 *   LID  (A): 16-dot template, single field 1 = native ECC200 DM 16×16,
 *             far-left, bottom-anchored. ^MD^BD1;<serial> updates data only.
 *   SIDE (B): 16-dot template, single field 1 = Standard 7×5 text,
 *             left-aligned, sized for 13 chars. ^MD^TD1;<serial> updates.
 *
 * Protocol references (v2.6):
 *   §5.10 ^DM  — Delete Message
 *   §5.30 ^NM  — New Message (template;speed;orient;printMode;name + fields)
 *   §5.33.2.1 ^AB — Barcode field (DataMatrix s=5 → 16×16)
 *   §5.33.x   ^AT — Text field (font, position, data)
 *   §5.50 ^SV  — Save (commits ^NM to non-volatile storage)
 *   §6.1      one-to-one mode (^MD^BD / ^MD^TD)
 */

/** What gets seeded if the message is missing on the printer. */
export interface MessageSeed {
  /** Display name (operator-facing), e.g. "LID auto-seed". */
  label: string;
  /** Short description shown in the bind dialog. */
  description: string;
  /**
   * Ordered protocol commands to send when the message is missing.
   * Sent sequentially through the regular transport with ^SV at the end.
   * Placeholder `__NAME__` is replaced with the actual message name at send time
   * so operator-renamed pairs still work.
   */
  commandsTemplate: string[];
}

/**
 * LID seed — 16-dot template, single native DataMatrix 16×16 field at index 1.
 *
 * ^NM breakdown:
 *   16            template = 16-dot strip (Model 88 / 32-dot capable; 16-dot
 *                  caps height for ~200 units/min throughput per
 *                  mem://constraints/vdp-throughput-optimization)
 *   ;0            speed = Fast
 *   ;0            orientation = Normal
 *   ;0            printMode = Normal. 1:1 live mode is entered by ^MB per
 *                  protocol v2.6 §6.1; printMode 1 is Auto-Print, not 1:1.
 *   ;__NAME__     message name (operator-configurable, default "LID")
 *
 * Field 1 (^AB DataMatrix):
 *   x=0 y=0       far-left so horizontal placement can be handled with print
 *                  delay; y=0 anchors the 16-dot DM to the bottom of the template
 *   barcode type = 7 (DataMatrix per §5.33.2.1)
 *   s=5           DataMatrix size 5 = 16×16 (ECC200)
 *   data = "DRYRUN0000000" — 13 chars, dispatcher overwrites via ^MD^BD1
 *
 * NOTE: exact ^AB parameter ordering follows protocol v2.6 §5.33.2.1.
 * Horizontal placement is intentionally handled by print delay, not by x-offset.
 * The DM data is overwritten on every print so the placeholder text is irrelevant.
 */
export const LID_SEED: MessageSeed = {
  label: "Lid · DM 16×16",
  description:
    "16-dot template, native ECC200 DataMatrix 16×16 at field 1, far-left & bottom-anchored. " +
    "Dispatcher overwrites the encoded data per print via ^MD^BD1.",
  commandsTemplate: [
    "^DM __NAME__",
    // Per protocol v2.6 §5.33.2.1, DataMatrix uses the SHORT ^AB form
    // (same shape as QR Code), with NO `r` (human-readable) parameter:
    //
    //     ^AB n; x; y; f; t; s; data        (DataMatrix / QR)
    //     ^AB n; x; y; f; t; m; r; data     (1D barcodes — DOES include r)
    //
    // Spec §5.33.2.1 explicitly states: "r ... Not available for QR code or
    // DataMatrix code." Earlier versions of this seed (and the editor's
    // buildFieldSubcommand for DataMatrix) included a spurious `r=0`
    // segment, producing 8 segments instead of 7 — the printer rejected
    // that with "Invalid command format".
    //
    //   n=1   field number
    //   x=0   far-left; use print delay for horizontal placement
    //   y=0   bottom-anchored on 16-dot template
    //   f=0   font code (2D codes: s controls module size, f stays 0)
    //   t=7   barcode type = DataMatrix
    //   s=5   DataMatrix size 5 = 16×16 (ECC200)
    //   data  placeholder; dispatcher overwrites per print via ^MD^BD1
    //
    // Template code 4 = 1×16-dot strip (per templateToProtocolCode mapping).
    "^NM 4;0;0;0;__NAME__^AB1;0;0;0;7;5;DRYRUN0000000",
    "^SV",
  ],
};

/**
 * SIDE seed — 16-dot template, single Standard 7×5 text field at index 1.
 *
 * ^NM breakdown:
 *   16            template = 16-dot strip (matches LID for parity)
 *   ;0            speed = Fast
 *   ;0            orientation = Normal
 *   ;0            printMode = Normal. 1:1 live mode is entered by ^MB per
 *                  protocol v2.6 §6.1; printMode 1 is Auto-Print, not 1:1.
 *   ;__NAME__     message name (operator-configurable, default "SIDE")
 *
 * Field 1 (^AT text):
 *   x=0 y=0       left-aligned, bottom-anchored on the 16-dot template
 *   font = 1      Standard 7-high (per mem://features/font-rendering-specs;
 *                  7-dot font fits comfortably in a 16-dot template and
 *                  matches the customer's "7x5 font" decision)
 *   data = "DRYRUN0000000" — 13 chars, dispatcher overwrites via ^MD^TD1
 *
 * 13 chars × 5-wide font ≈ 78 dots — well within typical pad widths for
 * a Model 88. Dispatcher overwrites the data per print so length parity
 * with the catalog serial is what matters, not the placeholder content.
 */
export const SIDE_SEED: MessageSeed = {
  label: "Side · 7×5 text",
  description:
    "7-dot template, single Standard 7×5 text field at field 1 sized for 13 chars. " +
    "Dispatcher overwrites the data per print via ^MD^TD1.",
  commandsTemplate: [
    "^DM __NAME__",
    // Template code 1 = 1x7-dot strip (per templateToProtocolCode: '7' → 1).
    // Font code 7 = Standard 7-high (matches the working minimal ^NM at
    // usePrinterConnection.ts:2150 which uses ^AT1;0;0;7;).
    //
    // ^AT text syntax (per buildFieldSubcommand in usePrinterConnection,
    // protocol v2.6 §5.33.x):
    //   ^AT n;x;y;f;data
    //     n=1   field number
    //     x=0   left-aligned
    //     y=0   bottom-anchored on 7-dot template
    //     f=7   font code 7 = Standard 7-high
    //     data  placeholder; dispatcher overwrites per print via ^MD^TD1
    "^NM 1;0;0;0;__NAME__^AT1;0;0;7;DRYRUN0000000",
    "^SV",
  ],
};

/**
 * Resolve a seed's template into concrete commands for a given message name.
 * The seed templates use the placeholder `__NAME__` so operator-renamed pairs
 * (e.g. "LID-A1" instead of plain "LID") still get the correct ^DM target.
 */
export function buildSeedCommands(seed: MessageSeed, messageName: string): string[] {
  const safe = messageName.trim().toUpperCase();
  return seed.commandsTemplate.map((cmd) => cmd.replace(/__NAME__/g, safe));
}

/** Picks the right seed for a given side. */
export function seedForSide(side: "A" | "B"): MessageSeed {
  return side === "A" ? LID_SEED : SIDE_SEED;
}

// ---------------------------------------------------------------------------
//  Auto-Code seed (Phase 3 — no CSV required)
// ---------------------------------------------------------------------------

/** Operator-configurable knobs for the auto-coded multi-field seed. */
export interface AutoCodeSeedOpts {
  /** Line number prefix, e.g. "27" — fixed text. */
  line: string;
  /** Unit / suffix character, e.g. "U" — fixed text. */
  unit: string;
  /**
   * Hardware counter slot 1..4. The Counter (digit count, leading zeros,
   * start/stop/reset) must already be configured on each printer via ^CN —
   * for the customer's `27A132xxxxxxU` format that means a 6-digit counter
   * with leading zeros, rolling over at 999999.
   */
  counterSlot: 1 | 2 | 3 | 4;
  /**
   * Programmable Year table — calendar year → single letter (A-Z) printed
   * by the ^AP t=8 field. Must be configured IDENTICALLY on both printers
   * via Setup → Program Date Codes → Program Year before this mode prints
   * a real serial. The dialog ships with a default A=current year, B=+1, etc.
   */
  yearMap?: Record<number, string>;
}

/** Build a default A=thisYear, B=+1, ... mapping spanning N years. */
export function defaultYearMap(years = 6, startYear = new Date().getFullYear()): Record<number, string> {
  const map: Record<number, string> = {};
  for (let i = 0; i < years && i < 26; i++) {
    map[startYear + i] = String.fromCharCode(65 + i); // A, B, C, ...
  }
  return map;
}

/** Look up today's programmable-year letter from a year map (fallback "A"). */
export function letterForCurrentYear(map?: Record<number, string>): string {
  const y = new Date().getFullYear();
  return (map?.[y] || "A").slice(0, 1).toUpperCase();
}

/**
 * Build a self-printing, fully-native auto-coded message that resolves to the
 * customer's serial format `<line><Y><DDD><cnt><unit>` (e.g. `27A132000001U`).
 *
 * Both LID and SIDE printers run an IDENTICAL message — the year, Julian day
 * and counter are computed natively on each printer so the host never has to
 * push a per-bottle ^MD. Cycle time is bounded only by the printer firmware.
 *
 * Five fields, all on a 1×7-dot template using the Standard 7×5 font (5 dots
 * wide + 1-dot gap = 6 dots/char):
 *
 *   F1  ^AT  text  "<line>"            x = 0
 *   F2  ^AP  programmable year (A-Z)   x = after F1     (t=8, 1-digit year)
 *   F3  ^AD  Julian DDD (day of year)  x = after F2     (t=4, doy)
 *   F4  ^AC  counter slot N            x = after F3     (6 digits via ^CN)
 *   F5  ^AT  text  "<unit>"            x = after F4
 *
 * Parity guarantee with the LID DataMatrix and SIDE text:
 *   - Identical message on both printers
 *   - Identical Counter slot, identical programmable-year table
 *   - Counters tick on the printer's own photocell — no host clock involved
 *
 * Drift is only possible if one printer misses a print the other captures
 * (jet-stop, missed photocell, etc). The dashboard's existing ^CN poll
 * surfaces this as a counter-skew alert; the operator can re-zero both with
 * a single Reset Counters command.
 */
export function buildAutoCodeSeed(opts: AutoCodeSeedOpts): MessageSeed {
  const line = (opts.line || "").trim();
  const unit = (opts.unit || "").trim();
  const slot = Math.min(4, Math.max(1, opts.counterSlot)) | 0;

  // Standard 7-high font: 5 dots wide + 1 dot gap = 6 dots per character.
  const W = 6;
  const xLine    = 0;
  const xYear    = xLine    + line.length * W + 1;
  const xJulian  = xYear    + 1 * W + 1;
  const xCounter = xJulian  + 3 * W + 1;
  const xUnit    = xCounter + 6 * W + 1;

  // Protocol v2.6 references:
  //   §5.33.2.1 ^AT — text field
  //   §5.33.2.7 ^AP — programmable date code (t=9 = "Year 2-digit" via Program Year HMI table → A/B/C…)
  //   §5.33.2.3 ^AD — date code (t=4 = day-of-year DDD / "Julian day")
  //   §5.33.2.x ^AC — counter field (c = hardware slot 1..4)
  //
  // Template code 1 = 1×7-dot strip (matches SIDE_SEED).
  // Font code 7 = Standard 7-high.
  const FONT = 7;
  const TEMPLATE = 1;

  const fields = [
    `^AT1;${xLine};0;${FONT};${line}`,
    `^AP2;${xYear};0;${FONT};9`,
    `^AD3;${xJulian};0;${FONT};4`,
    `^AC4;${xCounter};0;${FONT};${slot}`,
    `^AT5;${xUnit};0;${FONT};${unit}`,
  ].join("");

  const sample = `${line}A132${"1".padStart(6, "0")}${unit}`;
  return {
    label: `Auto-code · ${sample}`,
    description:
      `5-field native auto-coded message — text "${line}" + programmable year (A-Z) + ` +
      `Julian DDD + counter slot ${slot} (6-digit) + text "${unit}". Sample: ${sample}. ` +
      `No CSV, no per-bottle host traffic — printers self-generate every serial.`,
    commandsTemplate: [
      "^DM __NAME__",
      `^NM ${TEMPLATE};0;0;0;__NAME__${fields}`,
      "^SV",
    ],
  };
}

/** Render a sample serial for a given auto-code config (UI preview). */
export function previewAutoCodeSerial(
  opts: AutoCodeSeedOpts,
  sample: { yearChar?: string; doy?: number; counter?: number } = {},
): string {
  const line = (opts.line || "").trim();
  const unit = (opts.unit || "").trim();
  const y = (sample.yearChar ?? letterForCurrentYear(opts.yearMap)).slice(0, 1).toUpperCase();
  const d = (sample.doy ?? 132).toString().padStart(3, "0");
  const c = (sample.counter ?? 1).toString().padStart(6, "0");
  return `${line}${y}${d}${c}${unit}`;
}
