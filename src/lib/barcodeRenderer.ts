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

// Extract encoding type from barcode field data string like "[CODE128] 12345"
export function parseBarcodeLabelData(label: string): { encoding: string; data: string } | null {
  const match = label.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!match) return null;
  
  const encodingLabel = match[1].toLowerCase();
  const data = match[2];
  
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
  return { encoding, data };
}

// Cache for rendered barcode images
const barcodeCache = new Map<string, HTMLCanvasElement>();

export async function renderBarcodeToCanvas(
  encoding: string,
  data: string,
  targetHeight: number // in dots
): Promise<HTMLCanvasElement | null> {
  if (!data || data.trim() === '') return null;
  
  const cacheKey = `${encoding}:${data}:${targetHeight}`;
  if (barcodeCache.has(cacheKey)) {
    return barcodeCache.get(cacheKey)!;
  }
  
  const bwipEncoder = ENCODING_MAP[encoding] || 'code128';
  
  try {
    // Create a temporary canvas for bwip-js to render to
    const tempCanvas = document.createElement('canvas');
    
    // Scale factor for reasonable resolution
    const scale = 2;
    const pixelHeight = targetHeight * 8; // 8 pixels per dot
    
    // Configure barcode options based on type
    const is2D = ['datamatrix', 'qrcode', 'dotcode'].includes(encoding);
    
    const options: bwipjs.RenderOptions = {
      bcid: bwipEncoder,
      text: data,
      scale: scale,
      includetext: false, // We won't show human readable text on the dot matrix
      backgroundcolor: 'f5e6c8', // Match canvas background
    };
    
    if (is2D) {
      // 2D barcodes - constrain to target height
      options.height = Math.floor(pixelHeight / scale / 2);
      options.width = Math.floor(pixelHeight / scale / 2);
    } else {
      // 1D barcodes - use target height
      options.height = Math.floor(pixelHeight / scale / 2);
    }
    
    await bwipjs.toCanvas(tempCanvas, options);
    
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
