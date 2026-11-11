import type { PrinterMetrics } from '@/types/printer';
// Only publish tokens physically present in a reply: legacy UI parsers fill missing fields with defaults.
export function observedMetrics(raw: string): Partial<PrinterMetrics> {
  const values: Partial<PrinterMetrics> = {};
  const numbers: [keyof PrinterMetrics, RegExp][] = [
    ['modulation', /\b(?:Modulation|Mod)\[\s*([\d.]+)\s*\]/i],
    ['pressure', /\b(?:Pressure|Prs)\[\s*([\d.]+)\s*\]/i],
    ['charge', /\b(?:Charge|Chg)\[\s*([\d.]+)\s*\]/i],
    ['rps', /\bRPS\[\s*([\d.]+)\s*\]/i],
    ['phaseQual', /\b(?:PhaseQual|PhQ)\[\s*([\d.]+)\s*%?\s*\]/i],
    ['viscosity', /\b(?:Viscosity|Vis)\[\s*([\d.]+)\s*\]/i],
    ['printheadTemp', /\b(?:Printhead|PH|Head|P)\s*(?:Temp(?:erature)?)?\s*[:\[]\s*([\d.]+)/i],
    ['electronicsTemp', /\b(?:Electronics|Electric|EL|Elec|E)\s*(?:Temp(?:erature)?)?\s*[:\[]\s*([\d.]+)/i],
  ];
  for (const [key, re] of numbers) { const m = raw.match(re); if (m && Number.isFinite(Number(m[1]))) Object.assign(values, { [key]: Number(m[1]) }); }
  const fluids = [['inkLevel', /\bINK\s*[:\[]\s*(FULL|HIGH|GOOD|LOW|EMPTY|UNKNOWN|\d+)/i], ['makeupLevel', /\b(?:MAKEUP|MKP)\s*[:\[]\s*(FULL|HIGH|GOOD|LOW|EMPTY|UNKNOWN|\d+)/i]] as const;
  for (const [key, re] of fluids) { const match = raw.match(re); if (match) { const word = match[1].toUpperCase(); const mapped = /^\d+$/.test(word) ? Number(word) >= 4 ? 'FULL' : word === '2' ? 'LOW' : word === '1' ? 'EMPTY' : word === '3' && key === 'makeupLevel' ? 'GOOD' : 'UNKNOWN' : word === 'HIGH' ? 'FULL' : word; values[key] = mapped; } }
  for (const [key, re] of [['powerHours', /\b(?:Power\s*(?:On\s*)?Hours|Power|Pwr)\s*[:\[]\s*([^\]\r\n]+)/i], ['streamHours', /\b(?:Stream\s*Hours|Stream|Pump\s*Hours)\s*[:\[]\s*([^\]\r\n]+)/i]] as const) { const m = raw.match(re); if (m) values[key] = m[1].trim(); }
  return values;
}
