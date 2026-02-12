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

// Cache for rendered barcode images
const barcodeCache = new Map<string, HTMLCanvasElement>();

export async function renderBarcodeToCanvas(
  encoding: string,
  data: string,
  targetHeight: number, // in dots
  humanReadable: boolean = false
): Promise<HTMLCanvasElement | null> {
  if (!data || data.trim() === '') return null;
  
  const cacheKey = `${encoding}:${data}:${targetHeight}:${humanReadable}`;
  if (barcodeCache.has(cacheKey)) {
    return barcodeCache.get(cacheKey)!;
  }
  
  const bwipEncoder = ENCODING_MAP[encoding] || 'code128';
  
  try {
    // Create a temporary canvas for bwip-js to render to
    const tempCanvas = document.createElement('canvas');
    
    // Reserve space for text if human readable
    const textHeightDots = humanReadable ? 2 : 0;
    const barcodeHeightDots = targetHeight - textHeightDots;
    
    // Configure barcode options based on type
    const is2D = ['datamatrix', 'qrcode', 'dotcode'].includes(encoding);
    
    // Use scale=1 and set height in mm-like units that bwip-js expects
    // bwip-js height is in millimeters at 72dpi by default
    const options: bwipjs.RenderOptions = {
      bcid: bwipEncoder,
      text: data,
      scale: 1,
      includetext: false,
      backgroundcolor: 'f5e6c8',
    };
    
    if (is2D) {
      // 2D barcodes - constrain to target dot height
      options.height = barcodeHeightDots;
      options.width = barcodeHeightDots;
    } else {
      // 1D barcodes - keep compact; height proportional to dots
      options.height = Math.max(4, barcodeHeightDots);
    }
    
    await bwipjs.toCanvas(tempCanvas, options);
    
    // If human readable, create a new canvas with text below
    if (humanReadable && !is2D) {
      const finalCanvas = document.createElement('canvas');
      const textHeight = Math.max(8, Math.floor(tempCanvas.height * 0.2));
      finalCanvas.width = tempCanvas.width;
      finalCanvas.height = tempCanvas.height + textHeight;
      
      const ctx = finalCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f5e6c8';
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        ctx.drawImage(tempCanvas, 0, 0);
        
        ctx.fillStyle = '#1a1a1a';
        ctx.font = `bold ${Math.max(6, textHeight - 2)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(data, finalCanvas.width / 2, finalCanvas.height - 1);
        
        barcodeCache.set(cacheKey, finalCanvas);
        return finalCanvas;
      }
    }
    
    // Cache the result
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
