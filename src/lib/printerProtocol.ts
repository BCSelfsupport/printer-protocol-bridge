/**
 * Parser utilities for Bestcode printer protocol responses
 */

import { PrinterMetrics, PrinterStatus } from '@/types/printer';

/**
 * Parse ^SU status response into PrinterMetrics
 * 
 * Example response (may vary by firmware):
 * STATUS: Modulation[110] Charge[75] Pressure[40] RPS[17.66] PhaseQual[100%] AllowErrors[1] HVDeflection[1] Viscosity[0.00]
 * INK:FULL MAKEUP:GOOD
 * V300UP:1 VLT_ON:1 GUT_ON:1 MOD_ON:1
 * Print Status: Ready
 */
export function parseStatusResponse(response: string): Partial<PrinterMetrics> & { 
  inkLevel: string;
  makeupLevel: string;
  printStatus: string;
  subsystems: {
    v300up: boolean;
    vltOn: boolean;
    gutOn: boolean;
    modOn: boolean;
    hvOn: boolean;
  };
} | null {
  // Debug: log raw response to console (Electron dev tools)
  console.log('[parseStatusResponse] raw:', response);

  // Case-insensitive search for "status" anywhere in response
  if (!/status/i.test(response)) {
    console.log('[parseStatusResponse] no STATUS keyword found');
    return null;
  }

  const extract = (pattern: RegExp): string | null => {
    const match = response.match(pattern);
    return match ? match[1] : null;
  };

  // More lenient regexes: allow optional spaces, case-insensitive where appropriate
  const modulation = parseInt(extract(/Modulation\[\s*(\d+)\s*\]/i) || '0', 10);
  const charge = parseInt(extract(/Charge\[\s*(\d+)\s*\]/i) || '0', 10);
  const pressure = parseInt(extract(/Pressure\[\s*(\d+)\s*\]/i) || '0', 10);
  const rps = parseFloat(extract(/RPS\[\s*([\d.]+)\s*\]/i) || '0');
  const phaseQual = parseInt(extract(/PhaseQual\[\s*(\d+)\s*%?\s*\]/i) || '0', 10);
  const hvDeflection = extract(/HVDeflection\[\s*(\d)\s*\]/i) === '1';
  const viscosity = parseFloat(extract(/Viscosity\[\s*([\d.]+)\s*\]/i) || '0');

  // INK:FULL MAKEUP:GOOD (allow optional spaces)
  const inkLevel = extract(/INK\s*:\s*(\w+)/i) || 'UNKNOWN';
  const makeupLevel = extract(/MAKEUP\s*:\s*(\w+)/i) || 'UNKNOWN';

  // V300UP:1 VLT_ON:1 GUT_ON:1 MOD_ON:1 HV_ON:1
  const v300up = extract(/V300UP\s*:\s*(\d)/i) === '1';
  const vltOn = extract(/VLT_ON\s*:\s*(\d)/i) === '1';
  const gutOn = extract(/GUT_ON\s*:\s*(\d)/i) === '1';
  const modOn = extract(/MOD_ON\s*:\s*(\d)/i) === '1';
  // HV status from HVDeflection field (1 = HV on, 0 = HV off)
  const hvOn = hvDeflection;

  // Print Status: Ready (or similar)
  const printStatus = extract(/Print\s*Status\s*:\s*(.+?)(?:\r|\n|$)/i)?.trim() || 'Unknown';

  console.log('[parseStatusResponse] parsed:', {
    modulation, charge, pressure, rps, phaseQual, hvDeflection, viscosity,
    inkLevel, makeupLevel, printStatus, v300up, vltOn, gutOn, modOn, hvOn,
  });

  return {
    modulation,
    charge,
    pressure,
    rps,
    phaseQual,
    hvDeflection,
    viscosity,
    inkLevel,
    makeupLevel,
    printStatus,
    subsystems: {
      v300up,
      vltOn,
      gutOn,
      modOn,
      hvOn,
    },
  };
}

/**
 * Parse ^VV version response
 * Example: Remote Server N-86 STD v01.09.00.14 NB X.602 built Oct 7 2025
 */
export function parseVersionResponse(response: string): string | null {
  const match = response.match(/v(\d+\.\d+\.\d+\.\d+)/);
  return match ? `v${match[1]}` : null;
}
