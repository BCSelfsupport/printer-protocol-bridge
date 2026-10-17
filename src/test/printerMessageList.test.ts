import { describe, expect, it } from 'vitest';
import { resolvePrinterMessageList } from '@/lib/printerMessageList';

describe('printer message list after pushing', () => {
  it('shows a newly pushed emulator message without switching printers', () => {
    const stale = [{ id: 1, name: 'TEST' }];
    expect(resolvePrinterMessageList(['TEST', 'SHOWCODE'], stale, true)).toEqual([
      { id: 1, name: 'TEST' }, { id: 2, name: 'SHOWCODE' },
    ]);
  });
  it('does not resurrect deleted messages from a connected snapshot', () => {
    expect(resolvePrinterMessageList([], [{ id: 1, name: 'TEST' }], true)).toEqual([]);
  });
  it('retains the connected real printer list when no emulator exists', () => {
    expect(resolvePrinterMessageList(undefined, [{ id: 1, name: 'REAL' }], true)).toEqual([{ id: 1, name: 'REAL' }]);
    expect(resolvePrinterMessageList(undefined, [{ id: 1, name: 'REAL' }], false)).toEqual([]);
  });
});