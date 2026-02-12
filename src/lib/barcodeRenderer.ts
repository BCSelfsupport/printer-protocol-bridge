// @ts-ignore - bwip-js browser bundle
import bwipjs from 'bwip-js/browser';
import { renderText, getFontInfo } from '@/lib/dotMatrixFonts';

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

// ── Check digit calculators ───────────────────────────────────────────
/** UPC/EAN check digit (works for UPC-A 11 digits, EAN-8 7 digits, UPC-E 7 digits) */
function calcUPCCheckDigit(digits: string): string {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = parseInt(digits[i], 10);
    sum += (i % 2 === 0) ? d * 3 : d;
  }
  return ((10 - (sum % 10)) % 10).toString();
}

/** EAN-13 check digit (12 digits input) */
function calcEAN13CheckDigit(digits: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits[i], 10);
    sum += (i % 2 === 0) ? d : d * 3;
  }
  return ((10 - (sum % 10)) % 10).toString();
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
    
    const is2D = ['datamatrix', 'qrcode', 'dotcode'].includes(encoding);
    // Reserve dots for human readable text below barcode
    const textHeightDots = (humanReadable && !is2D) ? 5 : 0;
    const barcodeHeightDots = targetHeight - textHeightDots;
    
    const DOT_PX = 8;
    const targetBarPx = barcodeHeightDots * DOT_PX; // target bar pixel height
    
    const options: bwipjs.RenderOptions = {
      bcid: bwipEncoder,
      text: data,
      scale: 1,
      includetext: false,
      backgroundcolor: 'f5e6c8',
    };
    
    if (is2D) {
      const size = Math.max(4, barcodeHeightDots);
      options.height = size;
      options.width = size;
      options.scale = Math.max(1, Math.floor(targetBarPx / (size * 2)));
    } else {
      // bwip-js height is in mm at 72dpi. 1mm ≈ 2.835 pixels at 72dpi.
      // With scale=S, pixel height ≈ height_mm * 2.835 * S
      // We want pixel height ≈ targetBarPx, so pick scale first then solve height.
      const moduleScale = 2;
      // height_mm = targetBarPx / (2.835 * scale)
      const heightMm = Math.max(5, Math.round(targetBarPx / (2.835 * moduleScale)));
      options.scale = moduleScale;
      options.height = heightMm;
    }
    
    await bwipjs.toCanvas(tempCanvas, options);
    
    // If human readable, composite barcode + dot-matrix text below
    if (humanReadable && !is2D) {
      const DOT_PX = 8;
      const hrFont = 'Standard5High';
      const fontInfo = getFontInfo(hrFont);
      const textRowsPx = (fontInfo.height + 1) * DOT_PX; // 5 dots + 1 gap = 6 dots
      
      // Compute check digit if needed, then format with guard bar splits
      let fullData = data;
      if (encoding === 'upca' && data.length === 11) {
        fullData = data + calcUPCCheckDigit(data);
      } else if (encoding === 'ean13' && data.length === 12) {
        fullData = data + calcEAN13CheckDigit(data);
      } else if (encoding === 'ean8' && data.length === 7) {
        fullData = data + calcUPCCheckDigit(data); // EAN-8 uses same algo as UPC
      } else if (encoding === 'upce' && data.length === 7) {
        fullData = data + calcUPCCheckDigit(data);
      }
      
      let displayText = fullData;
      if (encoding === 'upca' && fullData.length >= 12) {
        displayText = `${fullData[0]} ${fullData.substring(1, 6)} ${fullData.substring(6, 11)} ${fullData[11]}`;
      } else if (encoding === 'upce' && fullData.length >= 7) {
        displayText = `${fullData[0] || '0'} ${fullData.substring(1, 7)} ${fullData[fullData.length - 1] || ''}`.trim();
      } else if (encoding === 'ean13' && fullData.length >= 13) {
        displayText = `${fullData[0]} ${fullData.substring(1, 7)} ${fullData.substring(7, 13)}`;
      } else if (encoding === 'ean8' && fullData.length >= 8) {
        displayText = `${fullData.substring(0, 4)} ${fullData.substring(4, 8)}`;
      }
      
      // Calculate text width in pixels
      const textWidthPx = displayText.length * (fontInfo.charWidth + 1) * DOT_PX;
      
      const finalCanvas = document.createElement('canvas');
      const finalWidth = Math.max(tempCanvas.width, textWidthPx);
      finalCanvas.width = finalWidth;
      finalCanvas.height = tempCanvas.height + textRowsPx;
      
      const ctx = finalCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f5e6c8';
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        
        // Stretch barcode to match the final width so bars align with HR text
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height,
                      0, 0, finalWidth, tempCanvas.height);
        ctx.imageSmoothingEnabled = true;
        
        // Render human-readable text using dot-matrix 5-high font, centered below barcode
        ctx.fillStyle = '#1a1a1a';
        const textX = Math.max(0, Math.floor((finalWidth - textWidthPx) / 2));
        renderText(ctx, displayText, textX, tempCanvas.height, hrFont, DOT_PX);
        
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
