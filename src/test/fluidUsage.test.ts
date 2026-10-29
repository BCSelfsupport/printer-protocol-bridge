import { describe, it, expect } from 'vitest';
import { calculateFluidUsage, countPreviewTextDots, countMessagePreviewDots, DROPLET_ML, EVAPORATION_ML_HOUR, TEMPERATURES } from '@/lib/fluidUsage';

const input = { dots: 100, nozzle: 75 as const, solvent: 'MEK' as const, temperature: 25, printsPerMinute: 100, hoursPerDay: 8, daysPerWeek: 5, weeksPerYear: 50, bottleMl: 946 };
describe('TCO fluid formulas', () => {
  it.each([[40, 0.00000017], [55, 0.00000044], [65, 0.00000073], [75, 0.00000112], [100, 0.00000193]] as const)('uses the %s micron droplet volume', (nozzle, volume) => {
    expect(DROPLET_ML[nozzle]).toBe(volume);
    expect(calculateFluidUsage({ ...input, nozzle })?.inkPerPrintMl).toBeCloseTo(100 * volume, 12);
  });
  it.each([
    ['MEK', [3, 3, 3, 3, 4, 6, 9, 15]],
    ['Ethanol', [1.5, 1.5, 1.5, 1.5, 2, 3, 4.5, 7.5]],
    ['Acetone', [6, 6, 6, 6, 8, 12, 18, 30]],
  ] as const)('uses all workbook temperature rates for %s', (solvent, rates) => {
    expect(EVAPORATION_ML_HOUR[solvent]).toEqual(rates);
    TEMPERATURES.forEach((temperature, index) => expect(calculateFluidUsage({ ...input, solvent, temperature })?.makeupPerHourMl).toBe(rates[index]));
  });
  it('uses workbook annual hours, print volume and 946ml bottles', () => {
    const result = calculateFluidUsage(input);
    expect(result?.annualHours).toBe(2000);
    expect(result?.annualPrints).toBe(12000000);
    expect(result?.annualInkMl).toBeCloseTo(1344, 8);
    expect(result?.annualMakeupMl).toBe(8000);
    expect(result?.annualInkBottles).toBeCloseTo(1344 / 946, 8);
    expect(result?.makeupBottleHours).toBe(236.5);
  });
  it('retains jet-on evaporation with zero printing and avoids infinite refill times', () => {
    const result = calculateFluidUsage({ ...input, printsPerMinute: 0 });
    expect(result?.annualInkMl).toBe(0);
    expect(result?.inkBottleHours).toBeNull();
    expect(result?.annualMakeupMl).toBe(8000);
  });
  it.each([{ dots: -1 }, { dots: 1.5 }, { bottleMl: 0 }, { temperature: 26 }, { hoursPerDay: 25 }, { daysPerWeek: 8 }, { weeksPerYear: 53 }, { printsPerMinute: NaN }])('refuses invalid inputs %j', invalid => {
    expect(calculateFluidUsage({ ...input, ...invalid })).toBeNull();
  });
});
describe('bitmap counting, not character averages', () => {
  it('counts different glyphs individually and spaces without ink', () => {
    expect(countPreviewTextDots('B', 'Standard7High')).toBe(20);
    expect(countPreviewTextDots('C', 'Standard7High')).toBe(13);
    expect(countPreviewTextDots('B C', 'Standard7High')).toBe(33);
  });
  it('unions bold extensions instead of multiplying base counts', () => {
    expect(countPreviewTextDots('B', 'Standard7High', 1)).toBe(31);
  });
  it('does not treat unsupported glyphs or fonts as empty ink', () => {
    expect(countPreviewTextDots('€', 'Standard7High')).toBeNull();
    expect(countPreviewTextDots('A', 'Unknown')).toBeNull();
  });
  it('blocks partial totals when graphics need verified data', () => {
    const result = countMessagePreviewDots({ name: 'LOGO', width: 100, height: 16, fields: [{ id: 1, type: 'logo', data: 'graphic', x: 0, y: 0, width: 10, height: 10, fontSize: 'Standard7High' }] });
    expect(result.dots).toBeNull();
  });
});