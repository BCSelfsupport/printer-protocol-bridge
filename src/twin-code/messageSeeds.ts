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
 *             centered, bottom-anchored. ^MD^BD1;<serial> updates data only.
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
 *   ;0            printMode = Normal
 *   ;__NAME__     message name (operator-configurable, default "LID")
 *
 * Field 1 (^AB DataMatrix):
 *   x=20 y=0      x roughly centered for typical 60-dot pad width; y=0 anchors
 *                  the 16-dot DM to the bottom of the 16-dot template
 *   barcode type = 7 (DataMatrix per §5.33.2.1)
 *   s=5           DataMatrix size 5 = 16×16 (ECC200)
 *   data = "DRYRUN0000000" — 13 chars, dispatcher overwrites via ^MD^BD1
 *
 * NOTE: exact ^AB parameter ordering follows protocol v2.6 §5.33.2.1.
 * Adjust `x=20` if the real pad width differs — this is a centering choice,
 * not a correctness one. The DM data is overwritten on every print so the
 * placeholder text is irrelevant.
 */
export const LID_SEED: MessageSeed = {
  label: "Lid · DM 16×16",
  description:
    "16-dot template, native ECC200 DataMatrix 16×16 at field 1, centered & bottom-anchored. " +
    "Dispatcher overwrites the encoded data per print via ^MD^BD1.",
  commandsTemplate: [
    "^DM __NAME__",
    "^NM 16;0;0;0;__NAME__^AB 20;0;7;5;DRYRUN0000000",
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
 *   ;0            printMode = Normal
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
    "^NM 7;0;0;0;__NAME__^AT 0;0;1;DRYRUN0000000",
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
