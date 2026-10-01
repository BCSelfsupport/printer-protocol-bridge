import { describe, it, expect } from 'vitest';
import { detectExpiryDates } from '@/lib/messageProtocol';

const f = (id: number, x: number, data: string, t: string) =>
  ({ id, type: 'date', data, x, y: 18, width: 10, height: 7, fontSize: 'Standard7High', autoCodeFieldType: t, autoCodeInferred: true } as any);

describe('detectExpiryDates', () => {
  const today = new Date(2026, 9, 1); // 1 Oct 2026
  it('marks DD-MM-YYYY pieces 30 days ahead as expiry', () => {
    const fields = [f(1, 0, '31', 'date_normal_dom'), f(2, 20, '10', 'date_normal_dom'), f(3, 40, '2026', 'date_normal_yyyy')];
    detectExpiryDates(fields, today);
    expect(fields.map((x) => x.autoCodeFieldType)).toEqual(['date_expiry_dom', 'date_expiry_mm', 'date_expiry_yyyy']);
    expect(fields[0].autoCodeExpiryDays).toBe(30);
  });
  it('leaves today as a normal date and resolves the month', () => {
    const fields = [f(1, 0, '01', 'date_normal_dom'), f(2, 20, '10', 'date_normal_dom'), f(3, 40, '2026', 'date_normal_yyyy')];
    detectExpiryDates(fields, today);
    expect(fields[1].autoCodeFieldType).toBe('date_normal_mm');
    expect(fields[0].autoCodeExpiryDays).toBeUndefined();
  });
  it('detects single-field MM/DD/YY expiry', () => {
    const fields = [f(1, 0, '10/11/26', 'date_normal')];
    detectExpiryDates(fields, today);
    expect(fields[0].autoCodeFieldType).toBe('date_expiry');
    expect(fields[0].autoCodeExpiryDays).toBe(10);
  });
});
