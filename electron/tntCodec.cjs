/**
 * Track-n-Trace frame codec — Authentix TrackNTrace_Printer_Interface_Spec (Oct 2026).
 *
 * Transport: raw ASCII over TCP. Every transmission = [msg-type byte][body][EOM 0x04].
 * Variable length — always parse to the 0x04 delimiter, never a fixed count.
 *
 *   0x01 Request   [cmd(2)]                              e.g. 01 = Get Last Sent Serial (30 s poll)
 *   0x02 Print     [Rule1][Part3][Line2][Year1][Julian3][Serial6]['U'] (['1'+Lot6])   19 / 26 bytes
 *   0x03 Config    [Qty1][Part3] + N x [Aperture5 Delay5 SymbolSize2 Spacing4 PrintMode2]
 */

const MSG = Object.freeze({ REQUEST: 0x01, PRINT: 0x02, CONFIG: 0x03 });
const EOM = 0x04;
const MSG_NAMES = Object.freeze({ 1: 'REQUEST', 2: 'PRINT', 3: 'CONFIG' });

const SERIAL_MAX = 999900;

/** Next serial after `n`, applying the spec rollover (> 999900 → 1). */
function nextSerial(n) {
  const v = n + 1;
  return v > SERIAL_MAX ? 1 : v;
}

function encodeFrame(type, body) {
  const b = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'ascii');
  return Buffer.concat([Buffer.from([type & 0xff]), b, Buffer.from([EOM])]);
}

/** Streaming decoder — splits on 0x04. */
class FrameDecoder {
  constructor() { this.buf = Buffer.alloc(0); }
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    const frames = [];
    let idx;
    while ((idx = this.buf.indexOf(EOM)) >= 0) {
      const raw = this.buf.slice(0, idx + 1);
      this.buf = this.buf.slice(idx + 1);
      if (raw.length < 2) { frames.push({ error: 'empty_frame' }); continue; }
      const type = raw[0];
      const body = raw.slice(1, raw.length - 1).toString('ascii');
      if (!MSG_NAMES[type]) { frames.push({ error: 'unknown_type', type, raw }); continue; }
      frames.push({ type, name: MSG_NAMES[type], body, raw });
    }
    if (this.buf.length > 4096) this.buf = Buffer.alloc(0); // runaway guard
    return frames;
  }
}

function parseConfig(body) {
  if (body.length < 4) return { error: `Config too short (${body.length})` };
  const qty = Number(body[0]);
  if (!Number.isInteger(qty) || qty < 1) return { error: `Config Qty invalid "${body[0]}"` };
  const partType = body.slice(1, 4);
  const expected = 4 + 18 * qty;
  if (body.length !== expected) return { error: `Config length ${body.length}, expected ${expected} for Qty ${qty}` };
  if (!/^\d+$/.test(body)) return { error: 'Config must be ASCII digits only' };
  const printers = [];
  for (let i = 0; i < qty; i++) {
    const s = body.slice(4 + i * 18, 4 + (i + 1) * 18);
    const printMode = Number(s.slice(16, 18));
    printers.push({
      aperture: Number(s.slice(0, 5)),
      delay: Number(s.slice(5, 10)),
      symbolSize: Number(s.slice(10, 12)),
      interSymbolSpacing: Number(s.slice(12, 16)),
      printMode,
      inverted: !!(printMode & 2),
      reversed: !!(printMode & 4),
      bold: !!(printMode & 16),
    });
  }
  return { qty, partType, printers };
}

function parsePrint(body) {
  if (body.length !== 17 && body.length !== 24) return { error: `Print length ${body.length}, expected 17 or 24` };
  const p = {
    rule: body.slice(0, 1),
    partType: body.slice(1, 4),
    prodLine: body.slice(4, 6),
    alphaYear: body.slice(6, 7),
    julian: body.slice(7, 10),
    serial: body.slice(10, 16),
    alphaChar: body.slice(16, 17),
    lotFlag: body.length === 24 ? body.slice(17, 18) : null,
    lotCode: body.length === 24 ? body.slice(18, 24) : null,
    message: body,
  };
  if (!/^\d{6}$/.test(p.serial)) return { error: `Serial must be 6 digits, got "${p.serial}"` };
  p.serialValue = Number(p.serial);
  /** 000000 = continue counting; anything else = restart at that value. */
  p.continueCount = p.serialValue === 0;
  return p;
}

/** Format the reply to Request "01": 0x01 "01" + 6-digit serial + EOM. */
function encodeLastSerial(serial) {
  return encodeFrame(MSG.REQUEST, '01' + String(serial).padStart(6, '0'));
}

/** Config-complete ack. Spec: 0x03 0x03 (+ EOM, since every transmission ends in 0x04 — pending Authentix confirmation). */
function encodeConfigAck() {
  return encodeFrame(MSG.CONFIG, Buffer.from([MSG.CONFIG]));
}

module.exports = {
  MSG, MSG_NAMES, EOM, SERIAL_MAX,
  encodeFrame, FrameDecoder, parseConfig, parsePrint, encodeLastSerial, encodeConfigAck, nextSerial,
};
