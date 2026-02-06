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
  };
} | null {
  // Debug: log raw response to console (Electron dev tools)
  console.log('[parseStatusResponse] raw:', response);

  // Accept both verbose and terse ^SU variants.
  // Real printers may include "STATUS:" and "HVDeflection[...]" while the emulator may return
  // "Mod[...]" / "HvD[...]" and "INK: ... MAKEUP: ...".
  const looksLikeStatus = /status/i.test(response) || /\bmod\s*\[/i.test(response) || /\bink\s*:/i.test(response);
  if (!looksLikeStatus) {
    console.log('[parseStatusResponse] no recognizable ^SU payload');
    return null;
  }

  const extract = (pattern: RegExp): string | null => {
    const match = response.match(pattern);
    return match ? match[1] : null;
  };

  // Support both verbose and terse token names
  const modulation = parseInt(
    extract(/Modulation\[\s*(\d+)\s*\]/i) || extract(/\bMod\[\s*(\d+)\s*\]/i) || '0',
    10
  );
  const charge = parseInt(
    extract(/Charge\[\s*(\d+)\s*\]/i) || extract(/\bChg\[\s*(\d+)\s*\]/i) || '0',
    10
  );
  const pressure = parseInt(
    extract(/Pressure\[\s*(\d+)\s*\]/i) || extract(/\bPrs\[\s*(\d+)\s*\]/i) || '0',
    10
  );
  const rps = parseFloat(extract(/RPS\[\s*([\d.]+)\s*\]/i) || '0');
  const phaseQual = parseInt(
    extract(/PhaseQual\[\s*(\d+)\s*%?\s*\]/i) || extract(/\bPhQ\[\s*(\d+)\s*%?\s*\]/i) || '0',
    10
  );
  const hvDeflection =
    (extract(/HVDeflection\[\s*(\d)\s*\]/i) || extract(/\bHvD\[\s*(\d)\s*\]/i)) === '1';
  const viscosity = parseFloat(
    extract(/Viscosity\[\s*([\d.]+)\s*\]/i) || extract(/\bVis\[\s*([\d.]+)\s*\]/i) || '0'
  );

  // INK:FULL MAKEUP:GOOD (allow optional spaces)
  const inkLevel = extract(/INK\s*:\s*(\w+)/i) || 'UNKNOWN';
  const makeupLevel = extract(/MAKEUP\s*:\s*(\w+)/i) || 'UNKNOWN';

  // V300UP:1 VLT_ON:1 GUT_ON:1 MOD_ON:1 (or MLT_ON in some firmware)
  // Note: Per v2.0 protocol, these flags use NORMAL logic: 1 = ON, 0 = OFF.
  const v300up = extract(/V300UP\s*:\s*(\d)/i) === '1';
  const vltOn = extract(/(?:VLT|MLT)_ON\s*:\s*(\d)/i) === '1';
  const gutOn = extract(/GUT_ON\s*:\s*(\d)/i) === '1';
  const modOn = extract(/MOD_ON\s*:\s*(\d)/i) === '1';

  // Debug: log raw subsystem values
  console.log('[parseStatusResponse] raw subsystem values:', {
    V300UP: extract(/V300UP\s*:\s*(\d)/i),
    VLT_ON: extract(/(?:VLT|MLT)_ON\s*:\s*(\d)/i),
    GUT_ON: extract(/GUT_ON\s*:\s*(\d)/i),
    MOD_ON: extract(/MOD_ON\s*:\s*(\d)/i),
    HVDeflection: extract(/HVDeflection\[\s*(\d)\s*\]/i),
  });

  // HV status: Per v2.0 protocol, HVDeflection[1] = HV ON, HVDeflection[0] = HV OFF.
  // This is the authoritative field for whether printing is enabled.
  // V300UP may stay at 1 even when HV is toggled off, so we use HVDeflection instead.
  const printStatus = hvDeflection ? 'Ready' : 'Not ready';

  console.log('[parseStatusResponse] parsed:', {
    modulation, charge, pressure, rps, phaseQual, hvDeflection, viscosity,
    inkLevel, makeupLevel, printStatus, v300up, vltOn, gutOn, modOn,
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
