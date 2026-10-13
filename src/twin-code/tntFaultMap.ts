/**
 * Maps BestCode printer / line faults onto Track-n-Trace Interface Spec §8 codes.
 * The line uses two BestCode inkjets only — Category 4 (laser) is never sent.
 */
export type TntSpecCategory = 1 | 2 | 3;

export interface TntSpecFault {
  category: TntSpecCategory;
  /** §8 number for Category 2; null otherwise. */
  code: number | null;
  description: string;
}

/** Category 2 printer codes from §8 that BestCode can produce. */
export const SECTION8 = {
  UNDEFINED: 0,
  NO_MESSAGE_READY: 1,
  STROKE_TOO_FAST: 2,
  INVALID_PARAMETER: 3,
  MESSAGE_TOO_LONG: 4,
  PRINT_GO_DURING_PRINT: 5,
  OUT_OF_SEQUENCE: 7,
  VISCOSITY: 10,
  INK_SYSTEM: 11,
  VISCOMETER: 13,
  MAKEUP_EMPTY: 16,
  HIGH_VOLTAGE: 19,
  CHARGE: 20,
  GUTTER: 21,
  MAKEUP_LOW: 22,
  INK_LOW: 23,
  RESERVOIR_LOW: 24,
} as const;

const p2 = (code: number, description: string): TntSpecFault => ({ category: 2, code, description });

/** Ordered keyword rules for free-text BestCode fault/status messages. First match wins. */
const TEXT_RULES: Array<[RegExp, TntSpecFault]> = [
  [/disconnect|no active connection|comms?|connection (lost|refused)|socket|unreachable/i, { category: 3, code: null, description: "Communication lost" }],
  [/make.?up.*(empty|out)/i, p2(SECTION8.MAKEUP_EMPTY, "Make-up empty")],
  [/make.?up.*low/i, p2(SECTION8.MAKEUP_LOW, "Make-up cartridge low")],
  [/ink.*(empty|reservoir|level).*(low|empty)|reservoir.*low/i, p2(SECTION8.RESERVOIR_LOW, "Reservoir level too low")],
  [/ink.*low/i, p2(SECTION8.INK_LOW, "Ink cartridge low")],
  [/viscometer/i, p2(SECTION8.VISCOMETER, "Viscometer error")],
  [/viscosity/i, p2(SECTION8.VISCOSITY, "Viscosity out of range")],
  [/high.?volt|\bhv\b|eht/i, p2(SECTION8.HIGH_VOLTAGE, "High voltage fault")],
  [/charge|phase/i, p2(SECTION8.CHARGE, "Charge fault")],
  [/gutter/i, p2(SECTION8.GUTTER, "Gutter fault")],
  [/jet.?stop|pump|pressure|ink system|nozzle/i, p2(SECTION8.INK_SYSTEM, "Ink system fault")],
  [/too fast|speed|overspeed|encoder/i, p2(SECTION8.STROKE_TOO_FAST, "Stroke rate too fast")],
  [/too long|overlap|width/i, p2(SECTION8.MESSAGE_TOO_LONG, "Message longer than aperture")],
  [/still printing|print.?go during|busy/i, p2(SECTION8.PRINT_GO_DURING_PRINT, "Print-go during print")],
  [/no message|not ready|no print data|timeout|miss/i, p2(SECTION8.NO_MESSAGE_READY, "Print-Go with no message ready")],
  [/sequence|semaphore|partner|mismatch/i, p2(SECTION8.OUT_OF_SEQUENCE, "Messages out of sequence")],
  [/invalid|parameter|syntax/i, p2(SECTION8.INVALID_PARAMETER, "Invalid control character / parameter")],
];

/** FaultGuard codes → §8. */
const GUARD_MAP: Record<string, TntSpecFault> = {
  "jet-stop": p2(SECTION8.INK_SYSTEM, "Ink system fault"),
  disconnect: { category: 3, code: null, description: "Communication lost" },
  "partner-loop": p2(SECTION8.OUT_OF_SEQUENCE, "Messages out of sequence"),
  "miss-streak": p2(SECTION8.NO_MESSAGE_READY, "Print-Go with no message ready"),
  "high-miss-rate": p2(SECTION8.NO_MESSAGE_READY, "Print-Go with no message ready"),
};

export function mapBestCodeFault(input: string | null | undefined): TntSpecFault {
  const s = (input ?? "").trim();
  if (GUARD_MAP[s]) return GUARD_MAP[s];
  for (const [re, f] of TEXT_RULES) if (re.test(s)) return f;
  return p2(SECTION8.UNDEFINED, "Undefined fault");
}
