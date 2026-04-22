import { describe, expect, it } from 'vitest';

import { resolveFieldData } from '@/lib/tokenResolver';

describe('tokenResolver legacy compatibility', () => {
  it('resolves canonical tokens', () => {
    expect(resolveFieldData('[QRCODE] {WORK_ORDER}', { WORK_ORDER: 'ABC123' })).toBe('[QRCODE] ABC123');
  });

  it('resolves legacy tokens without underscores', () => {
    expect(resolveFieldData('[QRCODE] {WORKORDER}', { WORK_ORDER: 'ABC123' })).toBe('[QRCODE] ABC123');
  });

  it('resolves legacy counter aliases in grouped placeholders', () => {
    expect(resolveFieldData('[QRCODE] {WORKORDER,CN1}', { WORK_ORDER: 'ABC123', COUNTER1: '0007' })).toBe('[QRCODE] ABC123,0007');
  });
});