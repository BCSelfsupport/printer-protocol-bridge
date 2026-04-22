import { describe, expect, it } from 'vitest';

import { buildTokenMap, resolveFieldData } from '@/lib/tokenResolver';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';

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

  it('resolves short legacy counter aliases', () => {
    expect(resolveFieldData('[QRCODE] {WORKORDER}{C1}', { WORK_ORDER: 'ABC123', COUNTER1: '0007' })).toBe('[QRCODE] ABC1230007');
  });

  it('falls back to counter field data when advancedSettings.counters is missing', () => {
    const message = {
      name: 'TEST',
      height: 25,
      width: 100,
      fields: [
        { id: 1, type: 'text', data: 'ABC123', x: 0, y: 0, width: 50, height: 16, fontSize: 'Standard16High', promptBeforePrint: true, promptLabel: 'WORK ORDER' },
        { id: 2, type: 'counter', data: '0042', x: 0, y: 0, width: 30, height: 16, fontSize: 'Standard16High', autoCodeFieldType: 'counter_1' },
        { id: 3, type: 'barcode', data: '[QRCODE] {WORKORDER}{CN1}', x: 0, y: 0, width: 25, height: 25, fontSize: 'Standard16High' },
      ],
    } as unknown as MessageDetails;

    const map = buildTokenMap(message);
    expect(map.WORK_ORDER).toBe('ABC123');
    expect(map.COUNTER1).toBe('0042');

    const qr = message.fields[2];
    expect(resolveFieldData(qr.data, map, qr.literalText)).toBe('[QRCODE] ABC1230042');
  });
});
