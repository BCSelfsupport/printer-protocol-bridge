/**
 * DJDACP2D-03 frame codec (Phase 1)
 *
 * NOTE: exact byte-level spec is pending pcap from Authentix (SOW §5, Q9).
 * Until then, this codec implements a documented placeholder framing that
 * matches the SOW's plain-English description and is swappable in one file.
 *
 * Wire frame:
 *   +------+----------+--------+----------------+---------+------+
 *   | STX  | LEN (BE) | OPCODE | PAYLOAD (LEN)  | CKSUM   | ETX  |
 *   | 0x02 |   u16    |   u8   |    bytes       |   u8    | 0x03 |
 *   +------+----------+--------+----------------+---------+------+
 *
 * CKSUM = XOR of OPCODE byte and every PAYLOAD byte.
 * LEN counts PAYLOAD bytes only (0..65535).
 *
 * Opcodes (inbound = TnT->us; outbound = us->TnT):
 *   0x10  Config    (in)   part+qty+template+startSerial   [JSON payload]
 *   0x20  Print     (in)   trigger next mark                [empty or JSON]
 *   0x30  Request   (in)   ask for last serial + fault      [empty]
 *   0x40  Ack       (out)  reply to Config/Print/Request    [JSON]
 *   0x4F  Nack      (out)  parse/validation error           [JSON {reason}]
 *   0x50  Status    (out)  periodic + on-change             [JSON]
 *   0x60  Fault     (out)  cat + sub-code                   [JSON]
 */

const STX = 0x02;
const ETX = 0x03;

const OPCODES = Object.freeze({
  CONFIG:  0x10,
  PRINT:   0x20,
  REQUEST: 0x30,
  ACK:     0x40,
  NACK:    0x4f,
  STATUS:  0x50,
  FAULT:   0x60,
});

const OPCODE_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(OPCODES).map(([k, v]) => [v, k]))
);

function checksum(opcode, payload) {
  let c = opcode & 0xff;
  for (let i = 0; i < payload.length; i++) c ^= payload[i];
  return c & 0xff;
}

/**
 * Encode one frame.
 * @param {number} opcode
 * @param {Buffer|Uint8Array|string|object} payload
 * @returns {Buffer}
 */
function encodeFrame(opcode, payload) {
  let body;
  if (payload == null) body = Buffer.alloc(0);
  else if (Buffer.isBuffer(payload)) body = payload;
  else if (payload instanceof Uint8Array) body = Buffer.from(payload);
  else if (typeof payload === 'string') body = Buffer.from(payload, 'utf8');
  else body = Buffer.from(JSON.stringify(payload), 'utf8');

  if (body.length > 0xffff) throw new Error('tnt: payload too large');

  const out = Buffer.alloc(1 + 2 + 1 + body.length + 1 + 1);
  let o = 0;
  out[o++] = STX;
  out.writeUInt16BE(body.length, o); o += 2;
  out[o++] = opcode & 0xff;
  body.copy(out, o); o += body.length;
  out[o++] = checksum(opcode, body);
  out[o++] = ETX;
  return out;
}

/**
 * Streaming decoder — accepts arbitrary chunks from `socket.on('data', ...)`
 * and yields fully-parsed frames. Resyncs on garbage by scanning for STX.
 */
class FrameDecoder {
  constructor() {
    this.buf = Buffer.alloc(0);
  }
  push(chunk) {
    this.buf = this.buf.length === 0 ? Buffer.from(chunk) : Buffer.concat([this.buf, chunk]);
    const frames = [];
    while (true) {
      const stx = this.buf.indexOf(STX);
      if (stx < 0) { this.buf = Buffer.alloc(0); break; }
      if (stx > 0) this.buf = this.buf.slice(stx);
      if (this.buf.length < 6) break; // STX+LEN+OP+CKSUM+ETX minimum
      const len = this.buf.readUInt16BE(1);
      const total = 1 + 2 + 1 + len + 1 + 1;
      if (this.buf.length < total) break;
      const opcode = this.buf[3];
      const payload = this.buf.slice(4, 4 + len);
      const cksum = this.buf[4 + len];
      const etx = this.buf[5 + len];
      if (etx !== ETX || cksum !== checksum(opcode, payload)) {
        // bad frame — drop the STX and resync
        this.buf = this.buf.slice(1);
        frames.push({ error: 'bad_frame', opcode, len });
        continue;
      }
      frames.push({
        opcode,
        name: OPCODE_NAMES[opcode] || `0x${opcode.toString(16).padStart(2,'0')}`,
        payload,
        raw: this.buf.slice(0, total),
      });
      this.buf = this.buf.slice(total);
    }
    return frames;
  }
}

function parseJsonPayload(payload) {
  if (!payload || payload.length === 0) return null;
  try { return JSON.parse(payload.toString('utf8')); } catch { return null; }
}

module.exports = {
  STX, ETX, OPCODES, OPCODE_NAMES,
  encodeFrame, FrameDecoder, checksum, parseJsonPayload,
};
