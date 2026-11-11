import { describe, it, expect } from 'vitest';
import { sharedDataFresh } from './freshness';
import { observedMetrics } from './observedMetrics';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { canAccess, isLanAddress, sanitizeSnapshot } = require('../../electron/sharing/security.cjs');
describe('Master viewer rules', () => {
  it('viewer cannot control any printer or write reports through legacy or new endpoints', () => {
    for (const route of ['/relay/connect','/relay/disconnect','/relay/send-command','/relay/pause-polling','/relay/resume-polling','/view/publish','/view/report-update']) expect(canAccess('viewer','POST',route)).toBe(false);
    expect(canAccess('viewer','POST','/view/snapshot')).toBe(true);
    expect(canAccess('viewer','POST','/view/history')).toBe(true);
  });
  it('factory-only sharing excludes public and loopback addresses', () => {
    expect(isLanAddress('192.168.1.50')).toBe(true);
    expect(isLanAddress('172.20.1.50')).toBe(true);
    expect(isLanAddress('8.8.8.8')).toBe(false);
    expect(isLanAddress('127.0.0.1')).toBe(false);
    expect(isLanAddress('192.168.1.999')).toBe(false);
  });
  it('stale indicators stop being live after 15 seconds', () => {
    expect(sharedDataFresh(1000, 16000)).toBe(true);
    expect(sharedDataFresh(1000, 16001)).toBe(false);
    expect(sharedDataFresh(undefined, 1000)).toBe(false);
  });
  it('never shares licence keys or arbitrary printer settings', () => {
    const result = sanitizeSnapshot({ productKey:'secret', printers:[{ id:1,name:'Printer 1',productKey:'secret',messageDefaults:{width:999} }], metrics:{} });
    expect(result.printers[0]).toEqual({ id:1,name:'Printer 1' });
    expect(result).not.toHaveProperty('productKey');
  });
  it('unsupported service fields stay unavailable rather than zero', () => {
    expect(observedMetrics('INK:FULL')).toEqual({ inkLevel:'FULL' });
    expect(observedMetrics('Mod[110] Prs[40] Vis[4.3]')).toEqual({ modulation:110,pressure:40,viscosity:4.3 });
  });
  it('numeric ink has no GOOD state and makeup does', () => {
    expect(observedMetrics('INK:3 MAKEUP:3')).toEqual({inkLevel:'UNKNOWN',makeupLevel:'GOOD'});
  });
});
