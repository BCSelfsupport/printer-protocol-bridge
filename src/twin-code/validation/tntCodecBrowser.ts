/**
 * Browser-side mirror of electron/tntCodec.cjs (Uint8Array instead of Buffer).
 * Used ONLY by the sandboxed validation suite so it can replicate Track-n-Trace
 * framing without the Electron TCP server. Parity with the .cjs codec is
 * enforced by tntCodecBrowser.test.ts.
 */
export const MSG = { REQUEST: 0x01, PRINT: 0x02, CONFIG: 0x03 } as const;
export const EOM = 0x04;
const NAMES: Record<number, string> = { 1: "REQUEST", 2: "PRINT", 3: "CONFIG" };

export function encodeFrame(type: number, body: string | Uint8Array = ""): Uint8Array {
  const b = typeof body === "string" ? Uint8Array.from(body, (c) => c.charCodeAt(0) & 0xff) : body;
  const out = new Uint8Array(b.length + 2);
  out[0] = type & 0xff;
  out.set(b, 1);
  out[out.length - 1] = EOM;
  return out;
}

export interface DecodedFrame { type?: number; name?: string; body?: string; error?: string }

export class FrameDecoder {
  private buf: number[] = [];
  push(chunk: Uint8Array): DecodedFrame[] {
    this.buf.push(...chunk);
    const frames: DecodedFrame[] = [];
    let idx: number;
    while ((idx = this.buf.indexOf(EOM)) >= 0) {
      const raw = this.buf.splice(0, idx + 1);
      if (raw.length < 2) { frames.push({ error: "empty_frame" }); continue; }
      const type = raw[0];
      const body = String.fromCharCode(...raw.slice(1, raw.length - 1));
      if (!NAMES[type]) { frames.push({ error: "unknown_type", type }); continue; }
      frames.push({ type, name: NAMES[type], body });
    }
    if (this.buf.length > 4096) this.buf = [];
    return frames;
  }
}

export interface ConfigBlock {
  aperture: number; delay: number; symbolSize: number; interSymbolSpacing: number;
  printMode: number; inverted: boolean; reversed: boolean; bold: boolean;
}
export type ParsedConfig = { qty: number; partType: string; printers: ConfigBlock[] } | { error: string };

export function parseConfig(body: string): ParsedConfig {
  if (body.length < 4) return { error: `Config too short (${body.length})` };
  const qty = Number(body[0]);
  if (!Number.isInteger(qty) || qty < 1) return { error: `Config Qty invalid "${body[0]}"` };
  const partType = body.slice(1, 4);
  const expected = 4 + 18 * qty;
  if (body.length !== expected) return { error: `Config length ${body.length}, expected ${expected} for Qty ${qty}` };
  if (!/^\d+$/.test(body)) return { error: "Config must be ASCII digits only" };
  const printers: ConfigBlock[] = [];
  for (let i = 0; i < qty; i++) {
    const s = body.slice(4 + i * 18, 4 + (i + 1) * 18);
    const printMode = Number(s.slice(16, 18));
    printers.push({
      aperture: Number(s.slice(0, 5)), delay: Number(s.slice(5, 10)),
      symbolSize: Number(s.slice(10, 12)), interSymbolSpacing: Number(s.slice(12, 16)),
      printMode, inverted: !!(printMode & 2), reversed: !!(printMode & 4), bold: !!(printMode & 16),
    });
  }
  return { qty, partType, printers };
}

export interface ParsedPrint {
  rule: string; partType: string; prodLine: string; alphaYear: string; julian: string;
  serial: string; alphaChar: string; lotFlag: string | null; lotCode: string | null;
  serialValue: number; continueCount: boolean;
}

export function parsePrint(body: string): ParsedPrint | { error: string } {
  if (body.length !== 17 && body.length !== 24) return { error: `Print length ${body.length}, expected 17 or 24` };
  const serial = body.slice(10, 16);
  if (!/^\d{6}$/.test(serial)) return { error: `Serial must be 6 digits, got "${serial}"` };
  const serialValue = Number(serial);
  return {
    rule: body.slice(0, 1), partType: body.slice(1, 4), prodLine: body.slice(4, 6),
    alphaYear: body.slice(6, 7), julian: body.slice(7, 10), serial, alphaChar: body.slice(16, 17),
    lotFlag: body.length === 24 ? body.slice(17, 18) : null,
    lotCode: body.length === 24 ? body.slice(18, 24) : null,
    serialValue, continueCount: serialValue === 0,
  };
}

export const encodeLastSerial = (serial: number) => encodeFrame(MSG.REQUEST, "01" + String(serial).padStart(6, "0"));
export const encodeConfigAck = () => encodeFrame(MSG.CONFIG, new Uint8Array([MSG.CONFIG]));

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");

/** Controller Return / Fault §7: [MsgId][Cat ASCII][Message 13][Address 13 opt][EOM]. Mirrors tntCodec.cjs. */
export function encodeFault(msgId: number, category: number, message = "", address = ""): Uint8Array {
  const clean = (t: string) => t.replace(/[^\x20-\x7e]/g, " ");
  const cat = Number.isInteger(category) && category >= 1 && category <= 9 ? category : 2;
  const m = clean(message);
  const msg = /^\d+$/.test(m) ? m.slice(-13).padStart(13, "0") : m.slice(0, 13).padEnd(13, " ");
  const addr = address ? ("U" + clean(address)).slice(0, 13).padEnd(13, " ") : "";
  return encodeFrame(msgId, new TextEncoder().encode(String(cat) + msg + addr));
}
