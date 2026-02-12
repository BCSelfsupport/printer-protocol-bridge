// @ts-ignore - bwip-js browser bundle
import bwipjs from 'bwip-js/browser';

// Map our encoding names to bwip-js encoder names
const ENCODING_MAP: Record<string, string> = {
  'i25': 'interleaved2of5',
  'upca': 'upca',
  'upce': 'upce',
  'ean13': 'ean13',
  'ean8': 'ean8',
  'code39': 'code39',
  'code128': 'code128',
  'code128_ucc': 'gs1-128',
  'code128_sscc': 'sscc18',
  'code128_multi': 'gs1-128',
  'datamatrix': 'datamatrix',
  'qrcode': 'qrcode',
  'dotcode': 'dotcode',
};

// ── Validation rules per encoding ──────────────────────────────────────
export interface BarcodeValidation {
  valid: boolean;
  error?: string;
}

const DIGITS_ONLY = /^\d+$/;
const ALPHANUMERIC = /^[A-Z0-9 \-.$\/+%]+$/i;

export function validateBarcodeData(encoding: string, data: string): BarcodeValidation {
  if (!data || data.trim() === '') {
    return { valid: false, error: 'Data cannot be empty' };
  }

  const d = data.trim();

  switch (encoding) {
    case 'upce':
      // UPC-E: 6, 7, or 8 digits (bwip-js accepts 6-digit core or 7/8 with check)
      if (!DIGITS_ONLY.test(d)) return { valid: false, error: 'UPC-E requires digits only' };
      if (d.length < 6 || d.length > 8) return { valid: false, error: `UPC-E requires 6-8 digits (got ${d.length})` };
      return { valid: true };

    case 'upca':
      // UPC-A: 11 or 12 digits
      if (!DIGITS_ONLY.test(d)) return { valid: false, error: 'UPC-A requires digits only' };
      if (d.length < 11 || d.length > 12) return { valid: false, error: `UPC-A requires 11-12 digits (got ${d.length})` };
      return { valid: true };

    case 'ean13':
      // EAN-13: 12 or 13 digits
      if (!DIGITS_ONLY.test(d)) return { valid: false, error: 'EAN-13 requires digits only' };
      if (d.length < 12 || d.length > 13) return { valid: false, error: `EAN-13 requires 12-13 digits (got ${d.length})` };
      return { valid: true };

    case 'ean8':
      // EAN-8: 7 or 8 digits
      if (!DIGITS_ONLY.test(d)) return { valid: false, error: 'EAN-8 requires digits only' };
      if (d.length < 7 || d.length > 8) return { valid: false, error: `EAN-8 requires 7-8 digits (got ${d.length})` };
      return { valid: true };

    case 'i25':
      // Interleaved 2 of 5: digits only, must be even count
      if (!DIGITS_ONLY.test(d)) return { valid: false, error: 'I2of5 requires digits only' };
      if (d.length < 2) return { valid: false, error: 'I2of5 requires at least 2 digits' };
      if (d.length % 2 !== 0) return { valid: false, error: `I2of5 requires even number of digits (got ${d.length})` };
      return { valid: true };

    case 'code39':
      // Code 39: uppercase alphanumeric + some special chars
      if (!ALPHANUMERIC.test(d)) return { valid: false, error: 'Code 39: A-Z, 0-9, space, -.$/+% only' };
      return { valid: true };

    case 'code128':
    case 'code128_ucc':
    case 'code128_sscc':
    case 'code128_multi':
      // Code 128: full ASCII
      if (d.length < 1) return { valid: false, error: 'Data cannot be empty' };
      return { valid: true };

    case 'datamatrix':
    case 'qrcode':
    case 'dotcode':
      // 2D codes are flexible
      if (d.length < 1) return { valid: false, error: 'Data cannot be empty' };
      return { valid: true };

    default:
      return { valid: true };
  }
}

// Extract encoding type and settings from barcode field data string like "[CODE128|HR] 12345"
// HR = Human Readable enabled
export function parseBarcodeLabelData(label: string): { encoding: string; data: string; humanReadable: boolean } | null {
  // Match pattern: [ENCODING|FLAGS] data or [ENCODING] data
  const match = label.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!match) return null;
  
  const encodingPart = match[1];
  const data = match[2];
  
  // Check for flags (e.g., CODE128|HR)
  const parts = encodingPart.split('|');
  const encodingLabel = parts[0].toLowerCase();
  const flags = parts.slice(1).map(f => f.toUpperCase());
  const humanReadable = flags.includes('HR');
  
  // Map label back to encoding key
  const encodingMap: Record<string, string> = {
    'i25': 'i25',
    'interleaved 2 of 5': 'i25',
    'upca': 'upca',
    'upc-a': 'upca',
    'upce': 'upce',
    'upc-e': 'upce',
    'ean13': 'ean13',
    'ean 13': 'ean13',
    'ean8': 'ean8',
    'ean 8': 'ean8',
    'code39': 'code39',
    'code 39': 'code39',
    'code128': 'code128',
    'code 128': 'code128',
    'code128_ucc': 'code128_ucc',
    'a ucc/ean-128': 'code128_ucc',
    'code128_sscc': 'code128_sscc',
    'ucc/ean-128 sscc': 'code128_sscc',
    'code128_multi': 'code128_multi',
    'multi-information': 'code128_multi',
    'datamatrix': 'datamatrix',
    'data matrix': 'datamatrix',
    'qrcode': 'qrcode',
    'qr code': 'qrcode',
    'dotcode': 'dotcode',
  };
  
  const encoding = encodingMap[encodingLabel] || 'code128';
  return { encoding, data, humanReadable };
}

// ── Width estimation per encoding (in dots) ────────────────────────────
// Based on v2.6 protocol width formulas; bold=0 (standard weight)
export function estimateBarcodeWidthDots(encoding: string, data: string, humanReadable: boolean): number {
  const n = data.length;
  const bold = 0; // standard weight

  switch (encoding) {
    case 'upce':
      // 51 × (bold + 1)
      return 51 * (bold + 1);
    case 'upca':
      // 95 × (bold + 1)
      return 95 * (bold + 1);
    case 'ean13':
      // 95 × (bold + 1)
      return 95 * (bold + 1);
    case 'ean8':
      // 67 × (bold + 1)
      return 67 * (bold + 1);
    case 'i25':
      // (6n + 9 + n + 3) × (bold + 1) simplified
      return (7 * n + 12) * (bold + 1);
    case 'code39':
      // (12n + 12 + n + 3) × (bold + 1)
      return (13 * n + 15) * (bold + 1);
    case 'code128':
    case 'code128_ucc':
    case 'code128_sscc':
    case 'code128_multi':
      // (11n + 35) × (bold + 1)  — approximation
      return (11 * n + 35) * (bold + 1);
    case 'datamatrix':
    case 'qrcode':
    case 'dotcode':
      // 2D codes: square-ish, use height as width estimate
      return 32; // will be overridden by actual render
    default:
      return Math.max(40, n * 8);
  }
}

// Cache for rendered barcode images
const barcodeCache = new Map<string, HTMLCanvasElement>();

export async function renderBarcodeToCanvas(
  encoding: string,
  data: string,
  targetHeight: number, // in dots
  humanReadable: boolean = false
): Promise<HTMLCanvasElement | null> {
  if (!data || data.trim() === '') return null;
  
  // Validate data before attempting render
  const validation = validateBarcodeData(encoding, data);
  if (!validation.valid) {
    console.warn(`Barcode validation failed (${encoding}): ${validation.error}`);
    return null;
  }
  
  const cacheKey = `${encoding}:${data}:${targetHeight}:${humanReadable}`;
  if (barcodeCache.has(cacheKey)) {
    return barcodeCache.get(cacheKey)!;
  }
  
  const bwipEncoder = ENCODING_MAP[encoding] || 'code128';
  
  try {
    const tempCanvas = document.createElement('canvas');
    
    // Reserve space for human readable text (in dots)
    const is2D = ['datamatrix', 'qrcode', 'dotcode'].includes(encoding);
    const textHeightDots = (humanReadable && !is2D) ? 3 : 0;
    const barcodeHeightDots = targetHeight - textHeightDots;
    
    // Scale each barcode module to multiple pixels so bars are thick and visible.
    // DOT_SIZE (8px per dot) means we want each module ≈ 2-3 pixels wide
    // so the final image looks like a real barcode on the dot-matrix canvas.
    const moduleScale = 3;
    
    const options: bwipjs.RenderOptions = {
      bcid: bwipEncoder,
      text: data,
      scale: moduleScale,
      includetext: false,
      backgroundcolor: 'f5e6c8',
    };
    
    if (is2D) {
      // 2D barcodes: constrain to square matching target height
      const size = Math.max(4, barcodeHeightDots);
      options.height = size;
      options.width = size;
    } else {
      // 1D barcodes: height controls the bar height in bwip-js units (mm at 72dpi)
      // We want bars to fill the available dot-matrix height
      options.height = Math.max(5, barcodeHeightDots);
    }
    
    await bwipjs.toCanvas(tempCanvas, options);
    
    // If human readable, composite barcode + text
    if (humanReadable && !is2D) {
      const finalCanvas = document.createElement('canvas');
      // Text area: proportional to barcode, minimum 8px
      const textPx = Math.max(8, Math.floor(tempCanvas.height * 0.25));
      finalCanvas.width = tempCanvas.width;
      finalCanvas.height = tempCanvas.height + textPx;
      
      const ctx = finalCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f5e6c8';
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        ctx.drawImage(tempCanvas, 0, 0);
        
        // Draw human-readable text below barcode
        ctx.fillStyle = '#1a1a1a';
        const fontSize = Math.max(7, textPx - 2);
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        
        // For UPC/EAN, format the text with spaces (mimic guard bar splits)
        let displayText = data;
        if (encoding === 'upca' && data.length >= 11) {
          // UPC-A: X XXXXX XXXXX X
          displayText = `${data[0]} ${data.substring(1, 6)} ${data.substring(6, 11)} ${data[11] || ''}`.trim();
        } else if (encoding === 'upce' && data.length >= 6) {
          // UPC-E: X XXXXXX X
          displayText = `${data[0] || '0'} ${data.substring(data.length >= 8 ? 1 : 0, data.length >= 8 ? 7 : 6)} ${data[data.length - 1] || ''}`.trim();
        } else if (encoding === 'ean13' && data.length >= 12) {
          // EAN-13: X XXXXXX XXXXXX
          displayText = `${data[0]} ${data.substring(1, 7)} ${data.substring(7, 13)}`.trim();
        } else if (encoding === 'ean8' && data.length >= 7) {
          // EAN-8: XXXX XXXX
          displayText = `${data.substring(0, 4)} ${data.substring(4, 8)}`.trim();
        }
        
        ctx.fillText(displayText, finalCanvas.width / 2, finalCanvas.height - 1);
        
        barcodeCache.set(cacheKey, finalCanvas);
        return finalCanvas;
      }
    }
    
    barcodeCache.set(cacheKey, tempCanvas);
    return tempCanvas;
  } catch (error) {
    console.warn(`Failed to render barcode (${encoding}): ${data}`, error);
    return null;
  }
}

// Clear the barcode cache (useful if data changes frequently)
export function clearBarcodeCache() {
  barcodeCache.clear();
}
