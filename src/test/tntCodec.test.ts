/** Codec tests against the Authentix TrackNTrace Printer Interface Spec examples. */
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codec = require('../../electron/tntCodec.cjs');

const CONFIG_EX = '\x033001005000012003002500005000012003002500005000012003002500\x04';

describe('tnt codec (spec framing)', () => {
  it('decodes the spec Config example (60 bytes, Qty 3)', () => {
    const buf = Buffer.from(CONFIG_EX, 'ascii');
    expect(buf.length).toBe(60);
    const [f] = new codec.FrameDecoder().push(buf);
    expect(f.name).toBe('CONFIG');
    const cfg = codec.parseConfig(f.body);
    expect(cfg.qty).toBe(3);
    expect(cfg.partType).toBe('001');
    expect(cfg.printers[0]).toMatchObject({ aperture: 500, delay: 120, symbolSize: 3, interSymbolSpacing: 25, printMode: 0 });
  });

  it('decodes Print with and without lot code', () => {
    const d = new codec.FrameDecoder();
    const out = d.push(Buffer.from('\x02300108A180220274U\x04\x02300108A180220274U1AB1234\x04', 'ascii'));
    expect(out).toHaveLength(2);
    const a = codec.parsePrint(out[0].body);
    expect(a).toMatchObject({ rule: '3', prodLine: '08', alphaYear: 'A', julian: '180', serial: '220274', alphaChar: 'U', lotCode: null });
    const b = codec.parsePrint(out[1].body);
    expect(b.lotCode).toBe('AB1234');
  });

  it('treats serial 000000 as continue', () => {
    expect(codec.parsePrint('300108A180000000U').continueCount).toBe(true);
  });

  it('handles chunked Request and encodes the serial reply', () => {
    const d = new codec.FrameDecoder();
    expect(d.push(Buffer.from([0x01, 0x30]))).toHaveLength(0);
    const [f] = d.push(Buffer.from([0x31, 0x04]));
    expect(f).toMatchObject({ name: 'REQUEST', body: '01' });
    expect(codec.encodeLastSerial(220274).toString('ascii')).toBe('\x0101220274\x04');
  });

  it('rolls over after 999900', () => {
    expect(codec.nextSerial(999900)).toBe(1);
    expect(codec.nextSerial(5)).toBe(6);
  });

  it('rejects a Config with the wrong length', () => {
    expect(codec.parseConfig('3001005').error).toBeTruthy();
  });

  it('Config ack is exactly 03 03 04', () => {
    expect([...codec.encodeConfigAck()]).toEqual([0x03, 0x03, 0x04]);
  });

});

describe('Authentix Oct 2026 answers', () => {
  const c = require('../../electron/tntCodec.cjs');
  it('Clear-All-Buffers reply is 01 "02" "1" 04, syntax error "0"', () => {
    expect(c.encodeClearBuffersReply(true).toString('ascii')).toBe('\x01021\x04');
    expect(c.encodeClearBuffersReply(false).toString('ascii')).toBe('\x01020\x04');
  });
  it('unknown request gets a syntax-error reply', () => {
    expect(c.encodeRequestError('09').toString('ascii')).toBe('\x01090\x04');
  });
  it('§7 fault: category 1 echoes the 13-char code plus address', () => {
    const f = c.encodeCategoryFault(0x02, 1, { code: '34A180220274U', address: '192.168.0.91' }).toString('ascii');
    expect(f).toBe('\x02' + '1' + '34A180220274U' + 'U192.168.0.91' + '\x04');
    expect(f.length).toBe(29);
  });
  it('§7 fault: category 2 code padded to 13, address optional', () => {
    expect(c.encodeCategoryFault(0x02, 2, { faultNumber: 16 }).toString('ascii')).toBe('\x022' + '0000000000016' + '\x04');
  });
  it('§7 fault: category 3 with no message is zero', () => {
    expect(c.encodeCategoryFault(0x02, 3, {}).toString('ascii')).toBe('\x023' + '0'.repeat(13) + '\x04');
  });
});
