import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { hasPingReply } = require('../../electron/pingEvidence.cjs');

describe('Windows printer reachability evidence', () => {
  it('rejects a successful exit with a gateway destination-unreachable reply for Printer 3', () => {
    expect(hasPingReply('192.168.0.33', 'Reply from 192.168.0.1: Destination host unreachable.\nPackets: Sent = 1, Received = 1, Lost = 0', null, 'win32')).toBe(false);
  });
  it('rejects timeout output even when exit status is successful', () => {
    expect(hasPingReply('192.168.0.33', 'Request timed out.', null, 'win32')).toBe(false);
  });
  it('accepts an echo reply from Printer 3 itself', () => {
    expect(hasPingReply('192.168.0.33', 'Reply from 192.168.0.33: bytes=32 time<1ms TTL=64', null, 'win32')).toBe(true);
  });
  it('accepts a localized echo reply without relying on English words', () => {
    expect(hasPingReply('192.168.0.33', 'Respuesta desde 192.168.0.33: bytes=32 tiempo<1ms TTL=64', null, 'win32')).toBe(true);
  });
  it('rejects an echo reply from a different address', () => {
    expect(hasPingReply('192.168.0.33', 'Reply from 192.168.0.34: bytes=32 time<1ms TTL=64', null, 'win32')).toBe(false);
  });
  it('rejects a failed command even if stdout contains a reply', () => {
    expect(hasPingReply('192.168.0.33', 'Reply from 192.168.0.33: bytes=32 time<1ms TTL=64', new Error('failed'), 'win32')).toBe(false);
  });
  it('preserves Unix ping exit-status semantics', () => {
    expect(hasPingReply('192.168.0.33', '', null, 'linux')).toBe(true);
    expect(hasPingReply('192.168.0.33', '', new Error('unreachable'), 'linux')).toBe(false);
  });
});