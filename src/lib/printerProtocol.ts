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
  allowErrors: boolean;
  errorActive: boolean;
  printheadTemp: number;
  electronicsTemp: number;
  currentMessage?: string | null;
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
  const looksLikeStatus = /status/i.test(response) || /\bmod\s*\[/i.test(response) || /\bink\s*[:[\s]/i.test(response) || /\bmakeup\s*[:[\s]/i.test(response) || /\bmodulation/i.test(response);
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

  // INK:FULL MAKEUP:GOOD (allow optional spaces, colons, brackets, "Level" suffix, etc.)
  // Some firmware returns numeric codes: 0=EMPTY, 1=LOW, 2=GOOD, 3=FULL
  const mapFluidLevel = (raw: string | null): string => {
    if (!raw) return 'UNKNOWN';
    const upper = raw.toUpperCase().trim();
    if (['FULL', 'GOOD', 'LOW', 'EMPTY', 'UNKNOWN'].includes(upper)) return upper;
    // Numeric mapping per V2.6 protocol
    const num = parseInt(raw.trim(), 10);
    if (!isNaN(num)) {
      if (num >= 3) return 'FULL';
      if (num === 2) return 'GOOD';
      if (num === 1) return 'LOW';
      return 'EMPTY';
    }
    return 'UNKNOWN';
  };

  // Try multiple patterns for ink level (broadened for firmware variation)
  const inkRaw = extract(/INK\s*:\s*(\w+)/i)
    || extract(/INK\s*\[\s*(\w+)\s*\]/i)
    || extract(/\bInk\s+(\w+)/i)
    || extract(/INK\s+LEVEL\s*:\s*(\w+)/i)
    || extract(/\bInk\s*Level\s*:\s*(\w+)/i)
    || extract(/\bInk\s*=\s*(\w+)/i)
    || extract(/\bI\s*:\s*(\w+)/i);  // ultra-terse: "I:FULL"
  
  const makeupRaw = extract(/MAKEUP\s*:\s*(\w+)/i)
    || extract(/MAKEUP\s*\[\s*(\w+)\s*\]/i)
    || extract(/\bMakeup\s+(\w+)/i)
    || extract(/MAKEUP\s+LEVEL\s*:\s*(\w+)/i)
    || extract(/\bMakeup\s*Level\s*:\s*(\w+)/i)
    || extract(/\bMakeup\s*=\s*(\w+)/i)
    || extract(/\bMKP\s*:\s*(\w+)/i)   // abbreviation
    || extract(/\bM\s*:\s*(\w+)/i);    // ultra-terse: "M:GOOD"

  console.log('[parseStatusResponse] ink raw match:', inkRaw, '| makeup raw match:', makeupRaw);

  const inkLevel = mapFluidLevel(inkRaw);
  const makeupLevel = mapFluidLevel(makeupRaw);

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

  // Print Status: Use the printer's own "Print Status:" line if available,
  // as HVDeflection alone is not reliable (can be 1 even when jet is off).
  // Fall back to HVDeflection only if the printer doesn't include a Print Status line.
  const rawPrintStatus = extract(/Print\s+Status\s*:\s*([\w\s]+)/i)?.trim();
  // PRINT:1 is a terse variant meaning "printing active"
  const printFlag = extract(/\bPRINT\s*:\s*(\d)/i);
  const printStatus = rawPrintStatus 
    ? (/ready/i.test(rawPrintStatus) && !/not\s+ready/i.test(rawPrintStatus) ? 'Ready' : 'Not ready')
    : (printFlag !== null ? (printFlag === '1' ? 'Ready' : 'Not ready')
    : (hvDeflection ? 'Ready' : 'Not ready'));

  // AllowErrors and Err flags (v2.6)
  const allowErrors =
    (extract(/AllowErrors\[\s*(\d)\s*\]/i) || extract(/\bAEr\[\s*(\d)\s*\]/i)) === '1';
  const errorActive =
    (extract(/\bErr\[\s*(\d)\s*\]/i) || extract(/\bError\[\s*(\d)\s*\]/i)) === '1';

  // Current message name from ^SU response
  // Verbose: "Message: NAME" or "Message[NAME]", terse: "MSG: NAME" or "Msg[NAME]"
  const currentMessage = extract(/\bMessage\s*:\s*(.+)/i)?.trim()
    || extract(/\bMSG\s*:\s*(.+)/i)?.trim()
    || extract(/\bMessage\[\s*(.+?)\s*\]/i)?.trim()
    || extract(/\bMsg\[\s*(.+?)\s*\]/i)?.trim()
    || extract(/\bCurMsg\[\s*(.+?)\s*\]/i)?.trim()
    || null;

  console.log('[parseStatusResponse] parsed:', {
    modulation, charge, pressure, rps, phaseQual, hvDeflection, viscosity,
    inkLevel, makeupLevel, printStatus, allowErrors, errorActive, v300up, vltOn, gutOn, modOn, currentMessage,
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
    allowErrors,
    errorActive,
    currentMessage,
    printheadTemp: 0, // Will be populated from ^TP command
    electronicsTemp: 0, // Will be populated from ^TP command
    subsystems: {
      v300up,
      vltOn,
      gutOn,
      modOn,
    },
  };
}

/**
 * Parse ^TP temperature response
 * Example (echo off): P[24.71] E[30.78]
 * Example (echo on): TEMPS: Printhead[24.71°C] Electric[30.78°C]
 */
export function parseTemperatureResponse(response: string): { printheadTemp: number; electronicsTemp: number } | null {
  // Debug: log raw response
  console.log('[parseTemperatureResponse] raw:', response);

  // Try verbose format first
  let printheadMatch = response.match(/Printhead\[\s*([\d.]+)/i);
  let electronicsMatch = response.match(/Electric\[\s*([\d.]+)/i);

  // Fall back to terse format
  if (!printheadMatch) {
    printheadMatch = response.match(/P\[\s*([\d.]+)/);
  }
  if (!electronicsMatch) {
    electronicsMatch = response.match(/E\[\s*([\d.]+)/);
  }

  if (!printheadMatch && !electronicsMatch) {
    console.log('[parseTemperatureResponse] no temperature data found');
    return null;
  }

  const printheadTemp = printheadMatch ? parseFloat(printheadMatch[1]) : 0;
  const electronicsTemp = electronicsMatch ? parseFloat(electronicsMatch[1]) : 0;

  console.log('[parseTemperatureResponse] parsed:', { printheadTemp, electronicsTemp });

  return { printheadTemp, electronicsTemp };
}

/**
 * Parse ^VV version response
 * Example: Remote Server N-86 STD v01.09.00.14 NB X.602 built Oct 7 2025
 */
export function parseVersionResponse(response: string): string | null {
  const match = response.match(/v(\d+\.\d+\.\d+\.\d+)/);
  return match ? `v${match[1]}` : null;
}
