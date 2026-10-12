/**
 * tntLineRunner — TwinCode behaviour confirmed by Authentix's T&T → DataJet log
 * (01 Oct 2026) and Charlie's field tables.
 *
 *  1. Printed code is 13 chars: Line(2) + AlphaYear(1) + Julian(3) + Serial(6) + 'U'.
 *     Rule digit and Part type from the Print message are NOT printed.
 *  2. Config carries one 18-char block per printer. Block 1 → Printer 1,
 *     block 2 → Printer 2 (Printer 1/2 ↔ IP is set in our own setup).
 *     Only inverted / reversed / bold are used; aperture, delay, spacing are legacy.
 *  3. Each printer is kept two codes ahead (buffer 2/2). The same serial goes to
 *     both printers, and the queue only advances once BOTH confirm that serial.
 *  4. Rollover: after 999900 the next serial is 1.
 */

export const PRINTED_CODE_LEN = 13;
export const SERIAL_MAX = 999900;
export const BUFFER_DEPTH = 2;

export function nextSerial(n: number): number {
  const v = n + 1;
  return v > SERIAL_MAX ? 1 : v;
}

export interface TntPrintFields {
  prodLine: string;
  alphaYear: string;
  julian: string;
}

const CODE_RE = /^(\d{2})([A-Z])(\d{3})(\d{6})U$/;

export function buildPrintedCode(f: TntPrintFields, serial: number): string {
  return `${f.prodLine}${f.alphaYear}${f.julian}${String(serial).padStart(6, "0")}U`;
}

export function validatePrintedCode(code: string): { ok: true } | { ok: false; error: string } {
  if (code.length !== PRINTED_CODE_LEN) {
    return { ok: false, error: `Code must be ${PRINTED_CODE_LEN} characters, got ${code.length} ("${code}")` };
  }
  const m = CODE_RE.exec(code);
  if (!m) return { ok: false, error: `Code "${code}" does not match Line(2) Year(A–Z) Julian(3) Serial(6) U` };
  const julian = Number(m[3]);
  if (julian < 1 || julian > 366) return { ok: false, error: `Julian day ${m[3]} is out of range 001–366` };
  const serial = Number(m[4]);
  if (serial < 1 || serial > SERIAL_MAX) return { ok: false, error: `Serial ${m[4]} is out of range 000001–${SERIAL_MAX}` };
  return { ok: true };
}

export interface PrinterFlags {
  inverted: boolean;
  reversed: boolean;
  bold: boolean;
}

export interface ConfigLike {
  qty: number;
  partType: string;
  printers: Array<{ printMode: number }>;
}

export function flagsFromPrintMode(mode: number): PrinterFlags {
  return { inverted: !!(mode & 2), reversed: !!(mode & 4), bold: !!(mode & 16) };
}

/** Block 1 → Printer 1, block 2 → Printer 2. */
export function mapConfigToPrinters(cfg: ConfigLike): {
  printer1: PrinterFlags;
  printer2: PrinterFlags;
  warning: string | null;
} {
  const blocks = cfg.printers ?? [];
  if (blocks.length === 0) throw new Error("Config has no printer blocks");
  const p1 = flagsFromPrintMode(blocks[0].printMode);
  const p2 = flagsFromPrintMode((blocks[1] ?? blocks[0]).printMode);
  let warning: string | null = null;
  if (blocks.length === 1) warning = "Config has 1 block — both printers use it";
  else if (blocks.length > 2) warning = `Config has ${blocks.length} blocks — only the first 2 are used`;
  return { printer1: p1, printer2: p2, warning };
}

export type PrinterSlot = 1 | 2;
export type SendFn = (printer: PrinterSlot, code: string, serial: number) => void;

interface Pending {
  serial: number;
  code: string;
  confirmed: Set<PrinterSlot>;
}

/**
 * Keeps both printers BUFFER_DEPTH codes ahead and advances in lockstep.
 * `lastSerial` is the last serial BOTH printers confirmed — this is what the
 * 30-second Request "01" poll must report.
 */
export class TwinPairQueue {
  private pending: Pending[] = [];
  private fields: TntPrintFields | null = null;
  private nextToSend = 0;
  private _lastSerial = 0;

  constructor(
    private send: SendFn,
    private onPrinted?: (serial: number, code: string) => void,
  ) {}

  get lastSerial(): number {
    return this._lastSerial;
  }

  get queued(): ReadonlyArray<{ serial: number; code: string; confirmed: PrinterSlot[] }> {
    return this.pending.map((p) => ({ serial: p.serial, code: p.code, confirmed: [...p.confirmed] }));
  }

  /** New Print message: clear buffers and prefill both printers. */
  start(fields: TntPrintFields, startSerial: number): void {
    if (startSerial < 1 || startSerial > SERIAL_MAX) throw new Error(`Start serial ${startSerial} out of range`);
    this.fields = fields;
    this.pending = [];
    this.nextToSend = startSerial;
    for (let i = 0; i < BUFFER_DEPTH; i++) this.refillOne();
  }

  private refillOne(): void {
    if (!this.fields) return;
    const serial = this.nextToSend;
    const code = buildPrintedCode(this.fields, serial);
    const v = validatePrintedCode(code);
    if (v.ok === false) throw new Error(v.error);
    this.pending.push({ serial, code, confirmed: new Set() });
    this.nextToSend = nextSerial(serial);
    this.send(1, code, serial);
    this.send(2, code, serial);
  }

  /** A printer reports it printed `serial`. Returns true if the pair advanced. */
  confirm(printer: PrinterSlot, serial: number): boolean {
    const slot = this.pending.find((p) => p.serial === serial);
    if (!slot) return false;
    slot.confirmed.add(printer);
    let advanced = false;
    while (this.pending.length && this.pending[0].confirmed.size === 2) {
      const done = this.pending.shift()!;
      this._lastSerial = done.serial;
      this.onPrinted?.(done.serial, done.code);
      this.refillOne();
      advanced = true;
    }
    return advanced;
  }

  /** Printers that are behind: confirmed by one side but not the other. */
  get waitingOn(): PrinterSlot | null {
    const head = this.pending[0];
    if (!head || head.confirmed.size !== 1) return null;
    return head.confirmed.has(1) ? 2 : 1;
  }

  clear(): void {
    this.pending = [];
    this.fields = null;
  }
}
