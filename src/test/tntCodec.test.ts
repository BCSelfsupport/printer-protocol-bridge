/**
 * Codec round-trip tests for the DJDACP2D-03 placeholder framing.
 * Runs under vitest; imports the .cjs codec directly.
 */
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codec = require('../../electron/tntCodec.cjs');

describe('tnt codec', () => {
  it('encodes and decodes a Config frame round-trip', () => {
    const payload = { partType: 'BOTTLE-A', qty: 2, startSerial: 220274 };
    const frame = codec.encodeFrame(codec.OPCODES.CONFIG, payload);
    const dec = new codec.FrameDecoder();
    const out = dec.push(frame);
    expect(out).toHaveLength(1);
    expect(out[0].opcode).toBe(codec.OPCODES.CONFIG);
    expect(codec.parseJsonPayload(out[0].payload)).toEqual(payload);
  });

  it('handles chunked delivery of a single frame', () => {
    const frame = codec.encodeFrame(codec.OPCODES.PRINT, {});
    const dec = new codec.FrameDecoder();
    expect(dec.push(frame.slice(0, 2))).toHaveLength(0);
    expect(dec.push(frame.slice(2, 4))).toHaveLength(0);
    const done = dec.push(frame.slice(4));
    expect(done).toHaveLength(1);
    expect(done[0].name).toBe('PRINT');
  });

  it('decodes multiple back-to-back frames in one chunk', () => {
    const a = codec.encodeFrame(codec.OPCODES.PRINT, null);
    const b = codec.encodeFrame(codec.OPCODES.REQUEST, null);
    const dec = new codec.FrameDecoder();
    const out = dec.push(Buffer.concat([a, b]));
    expect(out.map((f: { name: string }) => f.name)).toEqual(['PRINT', 'REQUEST']);
  });

  it('rejects a frame with a bad checksum', () => {
    const frame = codec.encodeFrame(codec.OPCODES.PRINT, Buffer.from('x'));
    frame[frame.length - 2] ^= 0xff; // corrupt cksum
    const dec = new codec.FrameDecoder();
    const out = dec.push(frame);
    expect(out.some((f: { error?: string }) => f.error)).toBe(true);
  });

  it('resyncs on leading garbage', () => {
    const frame = codec.encodeFrame(codec.OPCODES.REQUEST, null);
    const dec = new codec.FrameDecoder();
    const out = dec.push(Buffer.concat([Buffer.from([0xaa, 0xbb, 0xcc]), frame]));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('REQUEST');
  });
});
