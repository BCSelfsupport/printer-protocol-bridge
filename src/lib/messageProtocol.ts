/**
 * Parser utilities for BestCode message-related protocol responses (^LF, ^GM).
 * Converts raw printer responses into MessageDetails for the PC editor.
 */

import type { MessageField, MessageDetails } from '@/components/screens/EditMessageScreen';

// Reverse mapping: protocol font code → font size name
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

// Reverse mapping: protocol template code → template value
const PROTOCOL_CODE_TO_TEMPLATE: Record<number, string> = {
  0: '5', 1: '7', 2: '9', 3: '12', 4: '16', 5: '19', 6: '25', 7: '32',
  8: 'multi-2x7', 9: 'multi-2x9', 10: 'multi-2x12',
  12: 'multi-3x7', 13: 'multi-3x9',
  14: 'multi-4x7', 15: 'multi-4x5',
  17: 'multi-2x5',
  20: '5s', 21: '7s',
  23: 'multi-2x7s',
};

// Font code → dot height
const FONT_CODE_TO_HEIGHT: Record<number, number> = {
  0: 5, 1: 7, 2: 7, 3: 9, 4: 12, 5: 16, 6: 19, 7: 25, 8: 32,
};

// Reverse: dot height → default font code (prefer Standard over Narrow)
const HEIGHT_TO_FONT_CODE: Record<number, number> = {
  5: 0, 7: 2, 9: 3, 12: 4, 16: 5, 19: 6, 25: 7, 32: 8,
};

// Template value → total height in dots
const TEMPLATE_HEIGHTS: Record<string, number> = {
  '5': 5, '5s': 5, '7': 7, '7s': 7, '9': 9, '12': 12, '16': 16, '19': 19, '25': 25, '32': 32,
  'multi-5x5': 29, 'multi-4x7': 31, 'multi-4x5': 23,
  'multi-3x9': 29, 'multi-3x7': 23,
  'multi-2x12': 25, 'multi-2x9': 19, 'multi-2x7': 16, 'multi-2x7s': 16, 'multi-2x5': 11,
};

/**
 * Element/field type codes from ^LF response.
 * These correspond to the ^AT, ^AD, ^AH, ^AC, ^AB, ^AG subcommands used in ^NM.
 */
const ELEMENT_TYPE_MAP: Record<number, MessageField['type']> = {
  0: 'text',
  1: 'date',
  2: 'time',
  3: 'counter',
  4: 'barcode',
  5: 'logo',
};

// Barcode subtype → encoding key (matches ^AB type parameter)
const BARCODE_SUBTYPE_TO_ENCODING: Record<number, string> = {
  0: 'i25',
  1: 'upca',
  2: 'upce',
  3: 'ean13',
  4: 'ean8',
  5: 'code39',
  6: 'code128',
  7: 'datamatrix',
  8: 'qrcode',
  9: 'code128_ucc',
  10: 'code128_sscc',
  11: 'code128_multi',
  12: 'dotcode',
};

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
  /** Field type derived from Field line T: (e.g., 4 = barcode) */
  derivedFieldType?: number;
  /** Barcode encoding subtype from Element T: when field is barcode */
  barcodeSubtype?: number;
}

/**
 * Parse ^GM (Get Message params) response.
 * 
 * Example responses:
 *   Verbose: "T:4 S:0 O:0 P:0"
 *   Terse:   "4;0;0;0"
 *   Extended: "Template:4 Speed:0 Orientation:0 PrintMode:0"
 * 
 * Returns the template code and other message-level params.
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

/**
 * Parse ^LF (List Fields) response into an array of field descriptors.
 * 
 * Example response (from emulator):
 *   BESTCODE: H:16 L:1 W:135 S:0 R:0 P:0
 *   Fields (1):
 *   Field 1: T:4000 (0, 0) W:87 H:16 B:0 G:1, R:0
 *   Element: T:0 D:BESTCODE
 * 
 * Real firmware may vary — parser is designed to be flexible.
 * 
 * Field line tokens:
 *   T:fontCodeOrType (x, y) W:width H:height B:bold G:gap R:rotation
 * Element line tokens:
 *   T:elementType D:data
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

    // Parse "Field N:" line
    // Field 1: T:4000 (0, 0) W:87 H:16 B:0 G:1, R:0
    // Also handle: Field 1: (0, 0) W:87 H:16 B:0 G:1 R:0 S:5
    const fieldMatch = trimmed.match(/Field\s+(\d+)\s*:/i);
    if (fieldMatch) {
      // Save previous field if exists
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
      
      // Font code: may appear as T:n or S:n in the Field line
      // T:4000 in emulator seems to be a combined code; real firmware may use S:n for font
      const fontInField = trimmed.match(/\bT\s*:\s*(\d+)/i);
      const sInField = trimmed.match(/\bS\s*:\s*(\d+)/i);
      // If T >= 1000 it's likely a combined type+font code (e.g. 4000 = type 4, font 0)
      // If T < 10 it's likely just a font code
      let fontCode = 5; // Default 16-high
      let derivedFieldType: number | undefined;
      if (sInField) {
        fontCode = parseInt(sInField[1], 10);
      } else if (fontInField) {
        const tVal = parseInt(fontInField[1], 10);
        if (tVal >= 1000) {
          // Combined: first digit = field type (0=text, 4=barcode), last digit(s) = font/subtype
          derivedFieldType = Math.floor(tVal / 1000);
          fontCode = tVal % 10;
        } else if (tVal <= 8) {
          fontCode = tVal;
        }
      }

      // Validate font code against H: (actual dot height) — if H is present and
      // contradicts the derived fontCode, correct it using height-to-code mapping.
      const parsedH = hMatch ? parseInt(hMatch[1], 10) : 0;
      if (parsedH > 0) {
        const expectedHeight = FONT_CODE_TO_HEIGHT[fontCode];
        if (expectedHeight !== parsedH) {
          const corrected = HEIGHT_TO_FONT_CODE[parsedH];
          if (corrected !== undefined) {
            console.log(`[parseLfResponse] font code ${fontCode} (${expectedHeight}h) contradicts H:${parsedH}, correcting to code ${corrected}`);
            fontCode = corrected;
          }
        }
      }

      currentField = {
        fieldNum,
        fontCode,
        x,
        y,
        width: wMatch ? parseInt(wMatch[1], 10) : 0,
        height: hMatch ? parseInt(hMatch[1], 10) : 0,
        bold: bMatch ? parseInt(bMatch[1], 10) : 0,
        gap: gMatch ? parseInt(gMatch[1], 10) : 1,
        rotation: rMatch ? parseInt(rMatch[1], 10) : 0,
        elementType: 0,
        elementData: '',
        derivedFieldType,
      };
      continue;
    }

    // Parse "Element:" line
    // Element: T:0 D:BESTCODE
    const elementMatch = trimmed.match(/Element\s*:/i);
    if (elementMatch && currentField) {
      const etMatch = trimmed.match(/\bT\s*:\s*(\d+)/i);
      const edMatch = trimmed.match(/\bD\s*:\s*(.+)/i);
      if (etMatch) {
        const etVal = parseInt(etMatch[1], 10);
        const looksLikeBarcodeSubtype = BARCODE_SUBTYPE_TO_ENCODING[etVal] !== undefined;

        currentField.elementType = etVal;

        // Some firmware reports barcode type only on the Element line.
        // In that case T: can be the barcode subtype directly (e.g. 8 = QR).
        if (currentField.derivedFieldType === 4 || (looksLikeBarcodeSubtype && etVal > 5)) {
          currentField.barcodeSubtype = etVal;
          currentField.elementType = 4; // force element type to barcode
        }
      }
      if (edMatch) currentField.elementData = edMatch[1].trim();
      continue;
    }

    // Some firmware may use a flat format per field:
    // 1: T:0 (10, 5) W:60 H:16 S:5 B:0 G:1 R:0 D:HELLO
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
      const tMatch = trimmed.match(/\bT\s*:\s*(\d+)/i);
      const dMatch = trimmed.match(/\bD\s*:\s*(.+)/i);

      currentField = {
        fieldNum,
        fontCode: sMatch ? parseInt(sMatch[1], 10) : (tMatch ? Math.min(parseInt(tMatch[1], 10), 8) : 5),
        x,
        y,
        width: wMatch ? parseInt(wMatch[1], 10) : 0,
        height: hMatch ? parseInt(hMatch[1], 10) : 0,
        bold: bMatch ? parseInt(bMatch[1], 10) : 0,
        gap: gMatch ? parseInt(gMatch[1], 10) : 1,
        rotation: rMatch ? parseInt(rMatch[1], 10) : 0,
        elementType: tMatch ? parseInt(tMatch[1], 10) : 0,
        elementData: dMatch ? dMatch[1].trim() : '',
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
    
    // Determine field type: prefer derivedFieldType from Field line T: over Element T:
    let fieldType: MessageField['type'];
    if (pf.derivedFieldType === 4) {
      fieldType = 'barcode';
    } else {
      fieldType = ELEMENT_TYPE_MAP[pf.elementType] ?? 'text';
    }

    // Invert Y: printer Y (0=bottom) → canvas Y (0=top)
    const fieldHeight = pf.height || fontHeight;
    const templateRelativeY = templateHeight - pf.y - fieldHeight;
    const canvasY = Math.max(0, templateRelativeY + blockedRows);

    // For barcode fields, wrap data with [ENCODING] prefix so the canvas renderer
    // can identify the barcode type and render it properly
    let fieldData = pf.elementData || messageName;
    if (fieldType === 'barcode') {
      const encodingKey = BARCODE_SUBTYPE_TO_ENCODING[pf.barcodeSubtype ?? 0] ?? 'code128';
      const encodingLabel = encodingKey.toUpperCase();
      // Only add prefix if not already present
      if (!fieldData.startsWith('[')) {
        fieldData = `[${encodingLabel}] ${fieldData}`;
      }
      console.log(`[buildMessageDetails] barcode field ${idx + 1}: subtype=${pf.barcodeSubtype}, encoding=${encodingKey}, data="${fieldData}"`);
    }

    return {
      id: idx + 1,
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
