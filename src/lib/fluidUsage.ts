import { getCharPattern, getFontInfo, PRINTER_FONTS } from '@/lib/dotMatrixFonts';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';

// Source: Default_TCO_Sheet.xlsx, WorkSheet B66:B70 and O47:O72.
export const DROPLET_ML = { 40: 0.00000017, 55: 0.00000044, 65: 0.00000073, 75: 0.00000112, 100: 0.00000193 } as const;
export const TEMPERATURES = [0, 10, 15, 20, 25, 30, 40, 50] as const;
export const EVAPORATION_ML_HOUR = {
  MEK: [3, 3, 3, 3, 4, 6, 9, 15],
  Ethanol: [1.5, 1.5, 1.5, 1.5, 2, 3, 4.5, 7.5],
  Acetone: [6, 6, 6, 6, 8, 12, 18, 30],
} as const;
export type NozzleSize = keyof typeof DROPLET_ML;
export type Solvent = keyof typeof EVAPORATION_ML_HOUR;

/** Union lit cells after scaling/bold; this is an unverified preview-font estimate. */
export function countPreviewTextDots(text: string, fontName: string, bold = 0): number | null {
  if (!PRINTER_FONTS[fontName] || !Number.isInteger(bold) || bold < 0 || bold > 9) return null;
  const font = getFontInfo(fontName);
  let total = 0;
  for (const char of Array.from(text)) {
    const pattern = getCharPattern(char);
    if (char !== ' ' && !pattern.some(row => row.some(Boolean))) return null;
    const lit = new Set<string>();
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (!pattern[row]?.[col]) continue;
        for (let y = Math.floor(row * font.height / 7); y < Math.ceil((row + 1) * font.height / 7); y++) {
          for (let x = Math.floor(col * font.charWidth / 5); x < Math.ceil((col + 1) * font.charWidth / 5) + bold; x++) {
            lit.add(`${x},${y}`);
          }
        }
      }
    }
    total += lit.size;
  }
  return total;
}

export function countMessagePreviewDots(message: MessageDetails) {
  const fields = message.fields.map(field => {
    // Graphics/barcodes and unresolved values must never silently count as zero ink.
    const unresolved = field.type === 'logo' || field.type === 'barcode' || field.dynamicSource
      || (!field.literalText && /\{[^}]+\}/.test(field.data));
    const dots = unresolved ? null : countPreviewTextDots(field.data, field.fontSize, field.bold ?? 0);
    return { id: field.id, data: field.data, font: field.fontSize, dots };
  });
  return {
    fields,
    dots: fields.some(field => field.dots === null) ? null : fields.reduce((sum, field) => sum + (field.dots ?? 0), 0),
    variable: message.fields.some(field => field.type !== 'text' || field.promptBeforePrint || field.autoCodeFormat || field.dynamicSource),
  };
}

export interface UsageInputs {
  dots: number;
  nozzle: NozzleSize;
  solvent: Solvent;
  temperature: number;
  printsPerMinute: number;
  hoursPerDay: number;
  daysPerWeek: number;
  weeksPerYear: number;
  bottleMl: number;
}

export function calculateFluidUsage(input: UsageInputs) {
  const tempIndex = TEMPERATURES.findIndex(temp => temp === input.temperature);
  const nonnegative = [input.dots, input.printsPerMinute, input.hoursPerDay, input.daysPerWeek, input.weeksPerYear];
  if (tempIndex < 0 || nonnegative.some(value => !Number.isFinite(value) || value < 0)
    || !Number.isInteger(input.dots) || input.hoursPerDay > 24 || input.daysPerWeek > 7 || input.weeksPerYear > 52
    || !Number.isFinite(input.bottleMl) || input.bottleMl <= 0 || !DROPLET_ML[input.nozzle] || !EVAPORATION_ML_HOUR[input.solvent]) return null;
  // Source: WorkSheet G27:G30, G35:G36, B10:B11. Use actual dots instead of B34 averages.
  const annualHours = input.hoursPerDay * input.daysPerWeek * input.weeksPerYear;
  const printsPerHour = input.printsPerMinute * 60;
  const inkPerPrintMl = input.dots * DROPLET_ML[input.nozzle];
  const inkPerHourMl = inkPerPrintMl * printsPerHour;
  const makeupPerHourMl = EVAPORATION_ML_HOUR[input.solvent][tempIndex];
  return {
    annualHours, annualPrints: printsPerHour * annualHours,
    inkPerPrintMl, inkPerHourMl, makeupPerHourMl,
    inkPerDayMl: inkPerHourMl * input.hoursPerDay,
    makeupPerDayMl: makeupPerHourMl * input.hoursPerDay,
    annualInkMl: inkPerHourMl * annualHours,
    annualMakeupMl: makeupPerHourMl * annualHours,
    annualInkBottles: inkPerHourMl * annualHours / input.bottleMl,
    annualMakeupBottles: makeupPerHourMl * annualHours / input.bottleMl,
    inkBottleHours: inkPerHourMl > 0 ? input.bottleMl / inkPerHourMl : null,
    makeupBottleHours: input.bottleMl / makeupPerHourMl,
  };
}