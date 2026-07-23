/**
 * Parser utilities for BestCode message-related protocol responses (^LF, ^GM).
 * Converts raw printer responses into MessageDetails for the PC editor.
 * 
 * Reference: BestCode Remote Communications Protocol v2.6, sections 4.2.1, 4.2.5, 5.20, 5.24.
 */

import type { MessageField, MessageDetails } from '@/components/screens/EditMessageScreen';
import { PROTOCOL_DATE_TO_FORMAT } from '@/lib/autoCodeProtocol';

const ALPHA_MONTH_VALUES = new Set([
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
]);

function inferFetchedAutoCodeMeta(
  fieldType: MessageField['type'],
  rawValue: string,
): Pick<MessageField, 'autoCodeFieldType' | 'autoCodeFormat'> {
  const value = rawValue.trim().toUpperCase();
  if (!value) return {};

  if (fieldType === 'time') {
    if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return { autoCodeFieldType: 'time', autoCodeFormat: 'HH:MM:SS' };
    if (/^\d{2}:\d{2}$/.test(value)) return { autoCodeFieldType: 'time', autoCodeFormat: 'HH:MM' };
    if (/^\d{6}$/.test(value)) return { autoCodeFieldType: 'time', autoCodeFormat: 'HHMMSS' };
    if (/^\d{4}$/.test(value)) return { autoCodeFieldType: 'time', autoCodeFormat: 'HHMM' };
    if (/^\d{2}$/.test(value)) return { autoCodeFieldType: 'time', autoCodeFormat: 'HH' };
    return {};
  }

  if (fieldType !== 'date') return {};

  if (ALPHA_MONTH_VALUES.has(value)) {
    return { autoCodeFieldType: 'date_normal_alpha_month' };
  }
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(value)) {
    return { autoCodeFieldType: 'date_normal', autoCodeFormat: 'MM/DD/YY' };
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return { autoCodeFieldType: 'date_normal', autoCodeFormat: 'MM/DD/YYYY' };
  }
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(value)) {
    return { autoCodeFieldType: 'date_normal', autoCodeFormat: 'YYYY/MM/DD' };
  }
  if (/^\d{3}$/.test(value)) {
    return { autoCodeFieldType: 'date_normal_doy' };
  }
  if (/^\d{4}$/.test(value)) {
    return { autoCodeFieldType: 'date_normal_yyyy' };
  }
  if (/^\d{2}$/.test(value)) {
    return { autoCodeFieldType: 'date_normal_dom' };
  }

  return {};
}

// ── Font mappings (protocol v2.6 §4.2.5) ────────────────────────────────────

/** Protocol font code → font size name */
const PROTOCOL_CODE_TO_FONT: Record<number, string> = {
  0: 'Standard5High',
  1: 'Narrow7High',
  2: 'Standard7High',
  3: 'Standard9High',
  4: 'Standard12High',
  5: 'Standard16High',
  6: 'Standard19High',
  7: 'Standard25High',
  8: 'Standard32High',
};

/** Font code → dot height */
const FONT_CODE_TO_HEIGHT: Record<number, number> = {
  0: 5, 1: 7, 2: 7, 3: 9, 4: 12, 5: 16, 6: 19, 7: 25, 8: 32,
};

/** Dot height → default font code (prefer Standard over Narrow) */
const HEIGHT_TO_FONT_CODE: Record<number, number> = {
  5: 0, 7: 2, 9: 3, 12: 4, 16: 5, 19: 6, 25: 7, 32: 8,
};

// ── Template mappings (protocol v2.6 §4.2.1) ────────────────────────────────

/** Protocol template code → template value */
const PROTOCOL_CODE_TO_TEMPLATE: Record<number, string> = {
  0: '5', 1: '7', 2: '9', 3: '12', 4: '16', 5: '19', 6: '25', 7: '32',
  8: 'multi-2x7', 9: 'multi-2x9', 10: 'multi-2x12',
  12: 'multi-3x7', 13: 'multi-3x9',
  14: 'multi-4x7', 15: 'multi-5x5',
  16: '3',  // 1x3 per protocol
  17: 'multi-2x5',
  20: '5s', 21: '7s',
  23: 'multi-2x7s',
};

/** Template value → total height in dots.
 * Multi-line heights = (lines × dotsPerLine) + ((lines - 1) × gap).
 * Gap is 1 dot for every multi-line template — confirmed against the HMI
 * (2×7 shows a single blank dot-row between the two 7-dot lines).
 */
const TEMPLATE_HEIGHTS: Record<string, number> = {
  '3': 3,
  '5': 5, '5s': 5,
  '7': 7, '7s': 7,
  '9': 9, '12': 12, '16': 16, '19': 19, '25': 25, '32': 32,
  'multi-5x5': 29,   // 5×5 + 4×1 = 29
  'multi-4x7': 31,   // 4×7 + 3×1 = 31
  'multi-4x5': 23,   // 4×5 + 3×1 = 23
  'multi-3x9': 29,   // 3×9 + 2×1 = 29
  'multi-3x7': 23,   // 3×7 + 2×1 = 23
  'multi-2x12': 25,  // 2×12 + 1×1 = 25
  'multi-2x9': 19,   // 2×9 + 1×1 = 19
  'multi-2x7': 15,   // 2×7 + 1×1 = 15  (1-dot gap, matches HMI)
  'multi-2x7s': 15,  // 2×7 + 1×1 = 15  (1-dot gap, matches HMI)
  'multi-2x5': 11,   // 2×5 + 1×1 = 11
};

/**
 * Firmware-defined Y positions (printer coords, 0=bottom) for each line slot
 * in multi-line templates. Derived from protocol doc §4.2.1 template definitions
 * and confirmed by ^LF output (section 5.24 example).
 *
 * Lines are ordered bottom-to-top (line 1 = bottom row at Y=0).
 */
export const TEMPLATE_LINE_Y_POSITIONS: Record<string, number[]> = {
  // 2×7: gap=1 → Y=0, Y=8   (7+1=8) — matches HMI 1-dot spacing
  'multi-2x7':  [0, 8],
  'multi-2x7s': [0, 8],
  // 2×9: gap=1 → Y=0, Y=10  (9+1=10)
  'multi-2x9':  [0, 10],
  // 2×12: gap=1 → Y=0, Y=13 (12+1=13)
  'multi-2x12': [0, 13],
  // 2×5: gap=1 → Y=0, Y=6   (5+1=6)
  'multi-2x5':  [0, 6],
  // 3×7: gap=1 → Y=0, Y=8, Y=16   (7+1=8)
  'multi-3x7':  [0, 8, 16],
  // 3×9: gap=1 → Y=0, Y=10, Y=20  (9+1=10)
  'multi-3x9':  [0, 10, 20],
  // 4×7: gap=1 → Y=0, Y=8, Y=16, Y=24
  'multi-4x7':  [0, 8, 16, 24],
  // 4×5: gap=1 → Y=0, Y=6, Y=12, Y=18
  'multi-4x5':  [0, 6, 12, 18],
  // 5×5: gap=1 → Y=0, Y=6, Y=12, Y=18, Y=24
  'multi-5x5':  [0, 6, 12, 18, 24],
};

/**
 * Compute firmware-valid canvas Y positions for a given template and font height.
 * 
 * For multi-line templates, returns positions derived from TEMPLATE_LINE_Y_POSITIONS.
 * For single-line templates, computes how many rows of `fontHeight` fit with the
 * standard 1-dot gap, starting from the bottom (printer Y=0) — exactly as the
 * firmware lays out fields.
 * 
 * Returns canvas Y positions (0=top of 32-dot grid), sorted top-to-bottom.
 */
export function getValidCanvasYPositions(
  templateValue: string,
  templateHeight: number,
  fontHeight: number,
): number[] {
  const blockedRows = 32 - templateHeight;
  const canvasPositions: number[] = [];

  // Multi-line templates: use the firmware-defined positions
  if (templateValue.startsWith('multi-')) {
    const firmwareYs = TEMPLATE_LINE_Y_POSITIONS[templateValue];
    if (firmwareYs) {
      const match = templateValue.match(/multi-\d+x(\d+)/);
      const lineHeight = match ? parseInt(match[1], 10) : fontHeight;

      for (let i = firmwareYs.length - 1; i >= 0; i--) {
        if (fontHeight <= lineHeight) {
          const printerY = firmwareYs[i];
          const canvasY = templateHeight - printerY - lineHeight + blockedRows;
          canvasPositions.push(Math.max(blockedRows, canvasY));
        }
      }
      if (canvasPositions.length > 0) return canvasPositions.sort((a, b) => a - b);
    }
  }

  // Single-line templates: compute positions using 1-dot gap (firmware standard)
  // Fields are laid out from the bottom (printer Y=0) upward.
  const gap = 1;
  const stride = fontHeight + gap;
  const maxLines = Math.floor((templateHeight + gap) / stride);

  for (let line = maxLines - 1; line >= 0; line--) {
    const printerY = line * stride;
    const canvasY = templateHeight - printerY - fontHeight + blockedRows;
    if (canvasY >= blockedRows && canvasY + fontHeight <= 32) {
      canvasPositions.push(canvasY);
    }
  }

  // Deduplicate and sort top-to-bottom
  return [...new Set(canvasPositions)].sort((a, b) => a - b);
}

// ── ^LF Field type codes (protocol v2.6 §5.24) ──────────────────────────────
// The T: value on a Field line is in HEXADECIMAL notation per the spec.

/** Hex field-type code → high-level field type for the editor */
const HEX_FIELD_TYPE_MAP: Record<number, { type: MessageField['type']; barcodeEncoding?: string }> = {
  0x0001: { type: 'logo' },     // Graphic
  0x0002: { type: 'text' },     // Block
  0x4000: { type: 'text' },     // Text
  0x8001: { type: 'barcode', barcodeEncoding: 'i25' },
  0x8002: { type: 'barcode', barcodeEncoding: 'upca' },
  0x8003: { type: 'barcode', barcodeEncoding: 'upce' },
  0x8004: { type: 'barcode', barcodeEncoding: 'ean13' },
  0x8005: { type: 'barcode', barcodeEncoding: 'ean8' },
  0x8006: { type: 'barcode', barcodeEncoding: 'code39' },
  0x8007: { type: 'barcode', barcodeEncoding: 'code128' },
  0x8008: { type: 'barcode', barcodeEncoding: 'datamatrix' },
  0x8009: { type: 'barcode', barcodeEncoding: 'qrcode' },
  0x800A: { type: 'barcode', barcodeEncoding: 'dotcode' },
};

/** Element line T: codes (protocol v2.6 §5.24) */
const ELEMENT_TYPE_MAP: Record<number, MessageField['type']> = {
  0: 'text',       // Static element
  1: 'userdefine', // User defined element
  2: 'time',       // Time element
  3: 'date',       // Date element
  4: 'date',       // Programmed element (program date/time)
  5: 'counter',    // Counter element
  6: 'text',       // Shift element (treat as text)
  7: 'text',       // Block element
};

const PROTOCOL_TIME_TO_FORMAT: Record<number, string> = {
  23: 'HH', 24: 'MM', 25: 'SS', 26: 'HHMM', 27: 'HHMMSS', 28: 'HH:MM', 29: 'HH:MM:SS',
};

/** Barcode subtype → encoding key (for ^AB type parameter) */
const BARCODE_SUBTYPE_TO_ENCODING: Record<number, string> = {
  0: 'i25', 1: 'upca', 2: 'upce', 3: 'ean13', 4: 'ean8',
  5: 'code39', 6: 'code128', 7: 'datamatrix', 8: 'qrcode',
  9: 'code128_ucc', 10: 'code128_sscc', 11: 'code128_multi', 12: 'dotcode',
};

// ── Parser types ─────────────────────────────────────────────────────────────

interface ParsedField {
  fieldNum: number;
  fontCode: number;
  x: number;
  y: number;
  width: number;
  height: number;
  bold: number;
  gap: number;
  rotation: number;
  elementType: number;
  elementData: string;
  /** Field type hex code from ^LF Field line T: */
  hexFieldType?: number;
  /** Barcode encoding string derived from hex field type */
  barcodeEncoding?: string;
  /** Native protocol subcommand when it can be recovered from ^LF detail text. */
  protocolCommand?: 'AT' | 'AD' | 'AH' | 'AP' | 'AE' | 'AC' | 'AB' | 'AL';
  /** Native date/time/counter subtype from the field payload, when present. */
  protocolTypeCode?: number;
  /** Native counter slot from ^AC, when present. */
  counterSlot?: number;
}

function inferProtocolMetaFromFieldLine(line: string, fieldType: MessageField['type'] | undefined): Pick<ParsedField, 'protocolCommand' | 'protocolTypeCode' | 'counterSlot'> {
  const cmdMatch = line.match(/\^(AT|AD|AH|AP|AE|AC|AB|AL)\d+\s*;([^\r\n]*)/i);
  if (cmdMatch) {
    const protocolCommand = cmdMatch[1].toUpperCase() as ParsedField['protocolCommand'];
    const parts = cmdMatch[2].split(';').map(part => part.trim());
    if (protocolCommand === 'AD' || protocolCommand === 'AH' || protocolCommand === 'AP' || protocolCommand === 'AE') {
      return { protocolCommand, protocolTypeCode: Number.parseInt(parts[3] ?? '', 10) };
    }
    if (protocolCommand === 'AC') {
      return { protocolCommand, counterSlot: Number.parseInt(parts[3] ?? '', 10), protocolTypeCode: Number.parseInt(parts[4] ?? '', 10) };
    }
    return { protocolCommand };
  }

  const labelMatch = line.match(/\b(?:CMD|COMMAND|SUBCOMMAND|TYPE|KIND)\s*[:=]\s*(AT|AD|AH|AP|AE|AC|AB|AL)\b/i)
    || line.match(/\b(Text|Date|Time|Program(?:mable)?|Counter|Barcode|Graphic|Logo)\b/i);
  const label = labelMatch?.[1]?.toLowerCase();
  let protocolCommand: ParsedField['protocolCommand'] | undefined;
  if (label) {
    if (label === 'text') protocolCommand = 'AT';
    else if (label === 'date') protocolCommand = 'AD';
    else if (label === 'time') protocolCommand = 'AH';
    else if (label.startsWith('program')) protocolCommand = 'AP';
    else if (label === 'counter') protocolCommand = 'AC';
    else if (label === 'barcode') protocolCommand = 'AB';
    else if (label === 'graphic' || label === 'logo') protocolCommand = 'AL';
    else protocolCommand = label.toUpperCase() as ParsedField['protocolCommand'];
  }

  const codeMatch = line.match(/\b(?:D|TYPECODE|CODE|FMT|FORMAT)\s*[:=]\s*(\d+)\b/i);
  const slotMatch = line.match(/\b(?:C|COUNTER|SLOT)\s*[:=]\s*([1-4])\b/i);
  return {
    protocolCommand: protocolCommand ?? (fieldType === 'counter' ? 'AC' : undefined),
    protocolTypeCode: codeMatch ? Number.parseInt(codeMatch[1], 10) : undefined,
    counterSlot: slotMatch ? Number.parseInt(slotMatch[1], 10) : undefined,
  };
}

// ── ^GM parser ───────────────────────────────────────────────────────────────

/**
 * Parse ^GM (Get Message params) response.
 * 
 * Example responses:
 *   Verbose: "T:4 S:0 O:0 P:0"
 *   Terse:   "4;0;0;0"
 *   Extended: "Template:4 Speed:0 Orientation:0 PrintMode:0"
 */
export function parseGmResponse(response: string): {
  templateCode: number;
  templateValue: string;
  templateHeight: number;
  speed: number;
  orientation: number;
  printMode: number;
} | null {
  console.log('[parseGmResponse] raw:', response);

  let templateCode = -1;
  let speed = 0;
  let orientation = 0;
  let printMode = 0;

  // Try "T:n S:n O:n P:n" format
  const tMatch = response.match(/\bT\s*:\s*(\d+)/i);
  const sMatch = response.match(/\bS\s*:\s*(\d+)/i);
  const oMatch = response.match(/\bO\s*:\s*(\d+)/i);
  const pMatch = response.match(/\bP\s*:\s*(\d+)/i);

  if (tMatch) {
    templateCode = parseInt(tMatch[1], 10);
    speed = sMatch ? parseInt(sMatch[1], 10) : 0;
    orientation = oMatch ? parseInt(oMatch[1], 10) : 0;
    printMode = pMatch ? parseInt(pMatch[1], 10) : 0;
  } else {
    // Try "Template:n" verbose format
    const tVerbose = response.match(/Template\s*:\s*(\d+)/i);
    if (tVerbose) {
      templateCode = parseInt(tVerbose[1], 10);
      const sV = response.match(/Speed\s*:\s*(\d+)/i);
      const oV = response.match(/Orientation\s*:\s*(\d+)/i);
      const pV = response.match(/(?:PrintMode|Mode)\s*:\s*(\d+)/i);
      speed = sV ? parseInt(sV[1], 10) : 0;
      orientation = oV ? parseInt(oV[1], 10) : 0;
      printMode = pV ? parseInt(pV[1], 10) : 0;
    } else {
      // Try semicolon-delimited "t;s;o;p"
      const semiMatch = response.match(/(\d+)\s*;\s*(\d+)\s*;\s*(\d+)\s*;\s*(\d+)/);
      if (semiMatch) {
        templateCode = parseInt(semiMatch[1], 10);
        speed = parseInt(semiMatch[2], 10);
        orientation = parseInt(semiMatch[3], 10);
        printMode = parseInt(semiMatch[4], 10);
      }
    }
  }

  if (templateCode < 0) {
    console.log('[parseGmResponse] could not parse template code');
    return null;
  }

  const templateValue = PROTOCOL_CODE_TO_TEMPLATE[templateCode] ?? '16';
  const templateHeight = TEMPLATE_HEIGHTS[templateValue] ?? 16;

  console.log('[parseGmResponse] parsed:', { templateCode, templateValue, templateHeight, speed, orientation, printMode });
  return { templateCode, templateValue, templateHeight, speed, orientation, printMode };
}

// ── ^LF parser ───────────────────────────────────────────────────────────────

/**
 * Parse the hex T: value from a Field line in ^LF response.
 * Protocol v2.6 §5.24 states T: is in hexadecimal notation.
 * Values like "4000" and "8009" are hex.
 * Also handles the T: regex matching hex digits (e.g. "800A").
 */
function parseFieldTypeHex(tRaw: string): number {
  // The firmware outputs values like 4000, 8009, 800A — parse as hex
  return parseInt(tRaw, 16);
}

/**
 * Parse ^LF (List Fields) response into an array of field descriptors.
 * 
 * Example response (from protocol doc §5.24):
 *   BESTCODE: H:16 L:1 W:135 S:0 R:0 P:0
 *   Fields (3):
 *   Field 1: T:4000 (0, 0) W:87 H:16 B:0 G:1, R:0
 *   Element: T:0 D:BC-GEN2
 *   Field 2: T:4000 (88, 9) W:47 H:7 B:0 G:1, R:0
 *   Element: T:2 D:14:18:36
 *   Field 3: T:4000 (88, 0) W:47 H:7 B:0 G:1, R:0
 *   Element: T:3 D:06/15/18
 * 
 * T: on Field line = hex field type (4000=text, 8009=QR, etc.)
 * T: on Element line = element type (0=static, 2=time, 3=date, 5=counter)
 */
export function parseLfResponse(response: string, messageName: string): ParsedField[] {
  console.log('[parseLfResponse] raw:', response);

  const fields: ParsedField[] = [];
  const lines = response.split(/[\r\n]+/);

  let currentField: Partial<ParsedField> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip header, noise, echo
    const upper = trimmed.toUpperCase();
    if (upper.startsWith('^') || upper === '//EOL' || upper === '>' 
        || upper.includes('COMMAND SUCCESSFUL') || upper === 'SUCCESS' || upper === 'OK') continue;

    // ── Parse "Field N:" line ──
    // Field 1: T:4000 (0, 0) W:87 H:16 B:0 G:1, R:0
    const fieldMatch = trimmed.match(/Field\s+(\d+)\s*:/i);
    if (fieldMatch) {
      // Save previous field
      if (currentField && currentField.fieldNum != null) {
        fields.push(currentField as ParsedField);
      }

      const fieldNum = parseInt(fieldMatch[1], 10);
      
      // Extract position (x, y)
      const posMatch = trimmed.match(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
      const x = posMatch ? parseInt(posMatch[1], 10) : 0;
      const y = posMatch ? parseInt(posMatch[2], 10) : 0;

      // Extract W:width H:height B:bold G:gap R:rotation
      const wMatch = trimmed.match(/\bW\s*:\s*(\d+)/i);
      const hMatch = trimmed.match(/\bH\s*:\s*(\d+)/i);
      const bMatch = trimmed.match(/\bB\s*:\s*(\d+)/i);
      const gMatch = trimmed.match(/\bG\s*:\s*(\d+)/i);
      const rMatch = trimmed.match(/\bR\s*:\s*(\d+)/i);
      
      // T: on Field line is a HEX field-type code per protocol v2.6 §5.24.
      // Match hex digits including A-F (e.g. "800A" for DotCode).
      const tHexMatch = trimmed.match(/\bT\s*:\s*([0-9A-Fa-f]+)/i);
      
      let fontCode = 5; // Default 16-high
      let hexFieldType: number | undefined;
      let barcodeEncoding: string | undefined;
      let fieldTypeFromHex: MessageField['type'] | undefined;

      if (tHexMatch) {
        const hexVal = parseFieldTypeHex(tHexMatch[1]);
        const lookup = HEX_FIELD_TYPE_MAP[hexVal];
        if (lookup) {
          hexFieldType = hexVal;
          barcodeEncoding = lookup.barcodeEncoding;
          fieldTypeFromHex = lookup.type;
          console.log(`[parseLfResponse] T:${tHexMatch[1]} (0x${hexVal.toString(16)}) → ${lookup.type}${barcodeEncoding ? ` [${barcodeEncoding}]` : ''}`);
        } else {
          console.log(`[parseLfResponse] T:${tHexMatch[1]} (0x${hexVal.toString(16)}) → unknown hex type, defaulting to text`);
        }
      }

      const protocolMeta = inferProtocolMetaFromFieldLine(trimmed, fieldTypeFromHex);

      // Font code: derive from H: (actual dot height) which is always reliable
      const parsedH = hMatch ? parseInt(hMatch[1], 10) : 0;
      if (parsedH > 0) {
        const derived = HEIGHT_TO_FONT_CODE[parsedH];
        if (derived !== undefined) {
          fontCode = derived;
        }
      }

      // Also check S: if present (some firmware versions include font code as S:)
      const sInField = trimmed.match(/\bS\s*:\s*(\d+)/i);
      if (sInField) {
        const sVal = parseInt(sInField[1], 10);
        if (sVal >= 0 && sVal <= 8) {
          fontCode = sVal;
        }
      }

      currentField = {
        fieldNum,
        fontCode,
        x,
        y,
        width: wMatch ? parseInt(wMatch[1], 10) : 0,
        height: parsedH || FONT_CODE_TO_HEIGHT[fontCode] || 16,
        bold: bMatch ? parseInt(bMatch[1], 10) : 0,
        gap: gMatch ? parseInt(gMatch[1], 10) : 1,
        rotation: rMatch ? parseInt(rMatch[1], 10) : 0,
        elementType: 0,
        elementData: '',
        hexFieldType,
        barcodeEncoding,
        ...protocolMeta,
      };
      continue;
    }

    // ── Parse "Element:" line ──
    // Element: T:0 D:BESTCODE
    const elementMatch = trimmed.match(/Element\s*:/i);
    if (elementMatch && currentField) {
      const etMatch = trimmed.match(/\bT\s*:\s*(\d+)/i);
      const edMatch = trimmed.match(/\bD\s*:\s*(.+)/i);
      if (etMatch) {
        const elementType = parseInt(etMatch[1], 10);
        currentField.elementType = elementType;
        if (!currentField.protocolCommand) {
          if (elementType === 2) currentField.protocolCommand = 'AH';
          else if (elementType === 3) currentField.protocolCommand = 'AD';
          else if (elementType === 4) currentField.protocolCommand = 'AP';
          else if (elementType === 5) currentField.protocolCommand = 'AC';
        }
      }
      if (edMatch) currentField.elementData = edMatch[1].trim();
      continue;
    }

    // ── Flat format: "1: T:0 (10, 5) W:60 H:16 S:5 B:0 G:1 R:0 D:HELLO" ──
    const flatMatch = trimmed.match(/^(\d+)\s*:\s*/);
    if (flatMatch) {
      if (currentField && currentField.fieldNum != null) {
        fields.push(currentField as ParsedField);
      }

      const fieldNum = parseInt(flatMatch[1], 10);
      const posMatch = trimmed.match(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
      const x = posMatch ? parseInt(posMatch[1], 10) : 0;
      const y = posMatch ? parseInt(posMatch[2], 10) : 0;
      const wMatch = trimmed.match(/\bW\s*:\s*(\d+)/i);
      const hMatch = trimmed.match(/\bH\s*:\s*(\d+)/i);
      const sMatch = trimmed.match(/\bS\s*:\s*(\d+)/i);
      const bMatch = trimmed.match(/\bB\s*:\s*(\d+)/i);
      const gMatch = trimmed.match(/\bG\s*:\s*(\d+)/i);
      const rMatch = trimmed.match(/\bR\s*:\s*(\d+)/i);
      const tMatch = trimmed.match(/\bT\s*:\s*([0-9A-Fa-f]+)/i);
      const dMatch = trimmed.match(/\bD\s*:\s*(.+)/i);

      const parsedH = hMatch ? parseInt(hMatch[1], 10) : 0;
      let fontCode = 5;
      if (sMatch) {
        fontCode = parseInt(sMatch[1], 10);
      } else if (parsedH > 0) {
        const derived = HEIGHT_TO_FONT_CODE[parsedH];
        if (derived !== undefined) fontCode = derived;
      }

      const flatProtocolMeta = inferProtocolMetaFromFieldLine(trimmed, undefined);
      currentField = {
        fieldNum,
        fontCode,
        x,
        y,
        width: wMatch ? parseInt(wMatch[1], 10) : 0,
        height: parsedH || FONT_CODE_TO_HEIGHT[fontCode] || 16,
        bold: bMatch ? parseInt(bMatch[1], 10) : 0,
        gap: gMatch ? parseInt(gMatch[1], 10) : 1,
        rotation: rMatch ? parseInt(rMatch[1], 10) : 0,
        elementType: tMatch ? parseInt(tMatch[1], 10) : 0,
        elementData: dMatch ? dMatch[1].trim() : '',
        ...flatProtocolMeta,
      };
      continue;
    }
  }

  // Push last field
  if (currentField && currentField.fieldNum != null) {
    fields.push(currentField as ParsedField);
  }

  console.log('[parseLfResponse] parsed fields:', fields.length, fields);
  return fields;
}

function autoCodeMetaFromProtocol(pf: ParsedField): Pick<MessageField, 'autoCodeFieldType' | 'autoCodeFormat'> {
  const command = pf.protocolCommand;
  const code = pf.protocolTypeCode;

  if (command === 'AC') {
    const slot = pf.counterSlot && pf.counterSlot >= 1 && pf.counterSlot <= 4 ? pf.counterSlot : 1;
    return { autoCodeFieldType: `counter_${slot}` };
  }

  if (command === 'AH' && code !== undefined) {
    return { autoCodeFieldType: 'time', autoCodeFormat: PROTOCOL_TIME_TO_FORMAT[code] ?? undefined };
  }

  if ((command === 'AD' || command === 'AP' || command === 'AE') && code !== undefined) {
    const prefix = command === 'AE' ? 'date_expiry' : 'date_normal';
    const individualTypes: Record<number, string> = {
      1: 'dow_num', 2: 'dow_alpha', 3: 'dom', 4: 'doy', 5: 'ww', 6: 'mm', 7: 'alpha_month', 8: 'y', 9: 'yy', 10: 'yyyy',
    };
    if (individualTypes[code]) {
      const codeType = command === 'AP' ? `program_${individualTypes[code]}` : individualTypes[code];
      return { autoCodeFieldType: `${prefix}_${codeType}` };
    }
    return { autoCodeFieldType: prefix, autoCodeFormat: PROTOCOL_DATE_TO_FORMAT[code] };
  }

  return {};
}

// ── Message builder ──────────────────────────────────────────────────────────

/**
 * Convert parsed ^LF fields + ^GM template info into a full MessageDetails
 * suitable for the editor and localStorage storage.
 * 
 * Handles Y-axis inversion: printer Y (0=bottom) → canvas Y (0=top, 32-dot grid).
 */
export function buildMessageDetails(
  messageName: string,
  parsedFields: ParsedField[],
  gmResult: { templateValue: string; templateHeight: number } | null,
): MessageDetails {
  const templateValue = gmResult?.templateValue ?? '16';
  const templateHeight = gmResult?.templateHeight ?? TEMPLATE_HEIGHTS[templateValue] ?? 16;
  const blockedRows = 32 - templateHeight; // blocked area at top of 32-dot canvas

  const fields: MessageField[] = parsedFields.map((pf, idx) => {
    const fontName = PROTOCOL_CODE_TO_FONT[pf.fontCode] ?? 'Standard16High';
    const fontHeight = FONT_CODE_TO_HEIGHT[pf.fontCode] ?? 16;
    
    // Determine field type from hex field-type code (primary) or element type (fallback)
    let fieldType: MessageField['type'];
    let barcodeEncoding: string | undefined;

    if (pf.protocolCommand === 'AD' || pf.protocolCommand === 'AE' || pf.protocolCommand === 'AP') {
      fieldType = 'date';
    } else if (pf.protocolCommand === 'AH') {
      fieldType = 'time';
    } else if (pf.protocolCommand === 'AC') {
      fieldType = 'counter';
    } else if (pf.protocolCommand === 'AB') {
      fieldType = 'barcode';
      barcodeEncoding = pf.barcodeEncoding;
    } else if (pf.protocolCommand === 'AT') {
      fieldType = 'text';
    } else if (pf.protocolCommand === 'AL') {
      fieldType = 'logo';
    } else {

      if (pf.hexFieldType !== undefined) {
        const lookup = HEX_FIELD_TYPE_MAP[pf.hexFieldType];
        if (lookup) {
          fieldType = lookup.type;
          barcodeEncoding = lookup.barcodeEncoding;
        } else {
          fieldType = ELEMENT_TYPE_MAP[pf.elementType] ?? 'text';
        }
      } else if (pf.barcodeEncoding) {
        fieldType = 'barcode';
        barcodeEncoding = pf.barcodeEncoding;
      } else {
        fieldType = ELEMENT_TYPE_MAP[pf.elementType] ?? 'text';
      }
    }

    // For non-barcode hex field types, refine using element type when no native
    // subcommand is present. Native ^AP/^AD/^AC wins over generic Element labels.
    if (!pf.protocolCommand && fieldType === 'text' && pf.elementType > 0) {
      const elementDerived = ELEMENT_TYPE_MAP[pf.elementType];
      if (elementDerived) {
        fieldType = elementDerived;
      }
    }

    // Invert Y: printer Y (0=bottom) → canvas Y (0=top)
    const fieldHeight = pf.height || fontHeight;
    const templateRelativeY = templateHeight - pf.y - fieldHeight;
    let canvasY = Math.max(0, templateRelativeY + blockedRows);

    // Multi-line firmware can report the upper 2L×7 line as Y=7 even though
    // the HMI reserves a blank separator row and the editor must render that
    // line at canvas Y=17 (rows 17-23), not Y=18 (rows 18-24). Snap near-line
    // ^LF coordinates back to the authoritative template slots so the one-dot
    // inter-line gap remains visible in CodeSync.
    if (templateValue.startsWith('multi-')) {
      const validCanvasYs = getValidCanvasYPositions(templateValue, templateHeight, fieldHeight);
      if (validCanvasYs.length > 0) {
        let nearestY = validCanvasYs[0];
        let nearestDistance = Math.abs(canvasY - nearestY);
        for (const validY of validCanvasYs) {
          const distance = Math.abs(canvasY - validY);
          if (distance < nearestDistance) {
            nearestY = validY;
            nearestDistance = distance;
          }
        }
        if (nearestDistance <= 1) {
          canvasY = nearestY;
        }
      }
    }

    // For barcode fields, wrap data with [ENCODING] prefix
    let fieldData = pf.elementData || '';
    if (fieldType === 'barcode' && barcodeEncoding) {
      const encodingLabel = barcodeEncoding.toUpperCase();
      if (!fieldData.startsWith('[')) {
        fieldData = `[${encodingLabel}] ${fieldData}`;
      }
      console.log(`[buildMessageDetails] barcode field ${idx + 1}: encoding=${barcodeEncoding}, data="${fieldData}"`);
    }

    const protocolAutoCodeMeta = autoCodeMetaFromProtocol(pf);
    const inferredAutoCodeMeta = inferFetchedAutoCodeMeta(fieldType, fieldData);

    return {
      id: pf.fieldNum,
      type: fieldType,
      data: fieldData,
      x: pf.x,
      y: canvasY,
      width: pf.width || 60,
      height: fieldHeight,
      fontSize: fontName,
      bold: pf.bold,
      gap: pf.gap,
      rotation: pf.rotation === 0 ? 'Normal' as const : 'Normal' as const,
      autoCodeFieldType: protocolAutoCodeMeta.autoCodeFieldType ?? inferredAutoCodeMeta.autoCodeFieldType,
      autoCodeFormat: protocolAutoCodeMeta.autoCodeFormat ?? inferredAutoCodeMeta.autoCodeFormat,
      autoNumerals: 0,
    };
  });

  return {
    name: messageName,
    height: templateHeight,
    width: 200,
    fields,
    templateValue,
  };
}
