/**
 * DataMatrix ECC200 Software Generator
 * 
 * Generates DataMatrix ECC200 barcodes client-side using bwip-js,
 * converts them to printer-compatible column-major bitmap format,
 * and produces ^NG (New Graphic) upload commands for the printer.
 * 
 * This bypasses the need for firmware DataMatrix support by treating
 * the barcode as a graphic/logo field on the printer.
 */

// @ts-ignore - bwip-js browser bundle
import bwipjs from 'bwip-js/browser';

/**
 * Result of generating a DataMatrix bitmap for the printer.
 */
export interface DataMatrixBitmapResult {
  /** Bitmap width in printer dots */
  width: number;
  /** Bitmap height in printer dots */
  height: number;
  /** Column-major hex string for ^NG upload (MSB = top of column) */
  hexData: string;
  /** Generated unique graphic name for ^AL reference */
  graphicName: string;
  /** The ^NG upload command string */
  uploadCommand: string;
}

// Counter for unique graphic names within a session
let dmGraphicCounter = 0;

/**
 * Generate a DataMatrix ECC200 barcode as a printer-compatible bitmap.
 * 
 * @param data - The data to encode in the DataMatrix
 * @param targetHeight - Target height in printer dots (e.g., 18, 24, 32)
 * @param matrixSize - Optional matrix size hint (e.g., "12x12", "16x16")
 * @returns Bitmap result with upload command, or null on failure
 */
export async function generateDataMatrixBitmap(
  data: string,
  targetHeight: number,
  matrixSize?: string,
): Promise<DataMatrixBitmapResult | null> {
  if (!data || data.trim() === '') return null;

  try {
    // Create a temporary canvas for bwip-js rendering
    const tempCanvas = document.createElement('canvas');

    const options: any = {
      bcid: 'datamatrix',
      text: data.trim(),
      scale: 1,
      includetext: false,
      backgroundcolor: 'ffffff',
      paddingwidth: 0,
      paddingheight: 0,
    };

    // If a specific matrix size is requested, set dimensions
    if (matrixSize) {
      const match = matrixSize.match(/(\d+)x(\d+)/);
      if (match) {
        const cols = parseInt(match[1], 10);
        const rows = parseInt(match[2], 10);
        // bwip-js uses 'columns' and 'rows' for DataMatrix
        // But it auto-selects the best size. Let it auto-select for best results.
      }
    }

    await bwipjs.toCanvas(tempCanvas, options);

    // Get raw pixel data
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return null;

    const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const srcWidth = tempCanvas.width;
    const srcHeight = tempCanvas.height;

    // Calculate dots-per-module to fit within target height
    // bwip-js with scale=1 renders 1px per module
    const dotsPerModule = Math.max(1, Math.floor(targetHeight / srcHeight));

    // Final bitmap dimensions in printer dots
    const bitmapWidth = srcWidth * dotsPerModule;
    const bitmapHeight = srcHeight * dotsPerModule;

    // Convert to 1-bit column-major bitmap
    // Format: for each column (left→right), encode vertical dots as bytes
    // MSB = topmost dot in the byte group, working downward
    const bytesPerColumn = Math.ceil(bitmapHeight / 8);
    const hexBytes: string[] = [];

    for (let col = 0; col < bitmapWidth; col++) {
      for (let byteIdx = 0; byteIdx < bytesPerColumn; byteIdx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const dotRow = byteIdx * 8 + bit;
          if (dotRow >= bitmapHeight) break;

          // Map printer dot back to source pixel
          const srcCol = Math.floor(col / dotsPerModule);
          const srcRow = Math.floor(dotRow / dotsPerModule);

          if (srcCol < srcWidth && srcRow < srcHeight) {
            const pixelIdx = (srcRow * srcWidth + srcCol) * 4;
            // Pixel is "on" (ink dot) if it's dark (R channel < 128)
            const isOn = imgData.data[pixelIdx] < 128;
            if (isOn) {
              byte |= (0x80 >> bit); // MSB at top
            }
          }
        }
        hexBytes.push(byte.toString(16).padStart(2, '0').toUpperCase());
      }
    }

    // Generate unique graphic name
    dmGraphicCounter++;
    const graphicName = `_DM${dmGraphicCounter}`;
    const hexData = hexBytes.join('');

    // Build the ^NG (New Graphic) upload command
    // Format: ^NG name;width;height;hex_bitmap_data
    const uploadCommand = `^NG ${graphicName};${bitmapWidth};${bitmapHeight};${hexData}`;

    console.log(`[DataMatrix] Generated ECC200 bitmap: ${bitmapWidth}×${bitmapHeight} dots (${dotsPerModule} dots/module from ${srcWidth}×${srcHeight} source), graphic="${graphicName}", ${hexData.length} hex chars`);

    return {
      width: bitmapWidth,
      height: bitmapHeight,
      hexData,
      graphicName,
      uploadCommand,
    };
  } catch (error) {
    console.warn('[DataMatrix] Failed to generate ECC200 bitmap:', error);
    return null;
  }
}

/**
 * Extract raw data from a DataMatrix barcode field label.
 * Strips the "[DATAMATRIX|...]" prefix to get the encodable data.
 * 
 * @param fieldData - The field data string, e.g. "[DATAMATRIX|S=3] HELLO123"
 * @returns The raw data portion, or the full string if no prefix found
 */
export function extractDataMatrixData(fieldData: string): string {
  const prefixMatch = fieldData.match(/^\[([^\]]*)\]\s*/);
  if (prefixMatch) {
    return fieldData.slice(prefixMatch[0].length);
  }
  return fieldData;
}

/**
 * Check if a field is a DataMatrix barcode field based on its data string.
 */
export function isDataMatrixField(fieldData: string): boolean {
  const upper = fieldData.toUpperCase();
  return upper.startsWith('[DATAMATRIX') || upper.startsWith('[DM');
}

/**
 * Generate ^NG upload commands for all DataMatrix fields in a message.
 * Returns the commands and a mapping of field IDs to graphic names.
 * 
 * @param fields - Message fields to scan
 * @param templateHeight - Message template height in dots
 * @returns Upload commands and field-to-graphic mapping
 */
export async function generateDataMatrixCommands(
  fields: Array<{
    id: number;
    type: string;
    data: string;
    height?: number;
  }>,
  templateHeight: number,
): Promise<{
  uploadCommands: string[];
  graphicMap: Map<number, DataMatrixBitmapResult>;
}> {
  const uploadCommands: string[] = [];
  const graphicMap = new Map<number, DataMatrixBitmapResult>();

  for (const field of fields) {
    if (field.type !== 'barcode') continue;
    if (!isDataMatrixField(field.data)) continue;

    const rawData = extractDataMatrixData(field.data);
    if (!rawData.trim()) continue;

    // Skip if data contains unresolved variable tokens
    if (/\{[A-Z0-9_]+\}/.test(rawData)) continue;

    const targetHeight = field.height || templateHeight;
    const result = await generateDataMatrixBitmap(rawData, targetHeight);

    if (result) {
      uploadCommands.push(result.uploadCommand);
      graphicMap.set(field.id, result);
    }
  }

  return { uploadCommands, graphicMap };
}

/**
 * Generate a DataMatrix bitmap for VDP (Variable Data Printing).
 * Called per-record when a field's data changes.
 * 
 * @param data - The resolved data for this record
 * @param targetHeight - Target height in dots
 * @returns Upload command and graphic name, or null
 */
export async function generateVdpDataMatrixBitmap(
  data: string,
  targetHeight: number,
): Promise<DataMatrixBitmapResult | null> {
  return generateDataMatrixBitmap(data, targetHeight);
}
