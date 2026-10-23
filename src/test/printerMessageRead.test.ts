import { describe, expect, it, vi } from 'vitest';
import { readNamedMessageFields } from '@/lib/printerMessageRead';

describe('message readback fallback', () => {
  it('reads PROVAFIERA rather than the currently selected message when named LF fails', async () => {
    let selected = 'OTHER';
    const send = vi.fn(async (command: string) => {
      if (command === '^LF PROVAFIERA') return { success: false, response: 'CmdFormat' };
      if (command === '^SM PROVAFIERA') { selected = 'PROVAFIERA'; return { success: true, response: 'OK' }; }
      return { success: true, response: `${selected}: H:16\r\nFields (3)` };
    });
    expect(await readNamedMessageFields('PROVAFIERA', send, r => r.includes('CmdFormat'), async () => {}))
      .toBe('PROVAFIERA: H:16\r\nFields (3)');
    expect(send.mock.calls.map(([command]) => command)).toEqual(['^LF PROVAFIERA', '^SM PROVAFIERA', '^LF']);
  });

  it('does not read another message if selection fails', async () => {
    const send = vi.fn(async () => ({ success: false, response: 'NotFound' }));
    expect(await readNamedMessageFields('MISSING', send, r => r === 'NotFound', async () => {})).toBeNull();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('keeps the current selection untouched when named LF succeeds', async () => {
    const send = vi.fn(async () => ({ success: true, response: 'PROVAFIERA fields' }));
    expect(await readNamedMessageFields('PROVAFIERA', send, () => false, async () => {})).toBe('PROVAFIERA fields');
    expect(send).toHaveBeenCalledTimes(1);
  });
});