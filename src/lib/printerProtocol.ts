/**
 * Parser utilities for Bestcode printer protocol responses
 */

import { PrinterMetrics, PrinterStatus } from '@/types/printer';

/**
 * Parse ^SU status response into PrinterMetrics
 * 
 * Example response:
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
  };
} | null {
  if (!response.includes('STATUS:')) return null;

  const extract = (pattern: RegExp): string | null => {
    const match = response.match(pattern);
    return match ? match[1] : null;
  };

  const modulation = parseInt(extract(/Modulation\[(\d+)\]/) || '0', 10);
  const charge = parseInt(extract(/Charge\[(\d+)\]/) || '0', 10);
  const pressure = parseInt(extract(/Pressure\[\s*(\d+)\]/) || '0', 10);
  const rps = parseFloat(extract(/RPS\[([\d.]+)\]/) || '0');
  const phaseQual = parseInt(extract(/PhaseQual\[\s*(\d+)%?\]/) || '0', 10);
  const hvDeflection = extract(/HVDeflection\[(\d)\]/) === '1';
  const viscosity = parseFloat(extract(/Viscosity\[([\d.]+)\]/) || '0');
  const allowErrors = extract(/AllowErrors\[(\d)\]/) === '1';

  // INK:FULL MAKEUP:GOOD
  const inkLevel = extract(/INK:(\w+)/) || 'UNKNOWN';
  const makeupLevel = extract(/MAKEUP:(\w+)/) || 'UNKNOWN';

  // V300UP:1 VLT_ON:1 GUT_ON:1 MOD_ON:1
  const v300up = extract(/V300UP:(\d)/) === '1';
  const vltOn = extract(/VLT_ON:(\d)/) === '1';
  const gutOn = extract(/GUT_ON:(\d)/) === '1';
  const modOn = extract(/MOD_ON:(\d)/) === '1';

  // Print Status: Ready
  const printStatus = extract(/Print Status:\s*(.+?)(?:\r|\n|$)/)?.trim() || 'Unknown';

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
