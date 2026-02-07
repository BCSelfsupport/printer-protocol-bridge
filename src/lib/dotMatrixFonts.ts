/**
 * Dot Matrix Font System
 * 
 * Font files are stored in /public/fonts/ as .bin files from the printer.
 * Until we fully reverse-engineer the binary format, this provides
 * scaled bitmap rendering for each font height.
 */

export interface FontInfo {
  name: string;
  height: number;
  file: string;
  charWidth: number; // approximate character width in dots
}

// Available fonts matching the printer's actual fonts
export const PRINTER_FONTS: Record<string, FontInfo> = {
  'Standard5High': { name: 'Standard 5 High', height: 5, file: 'Standard5High.bin', charWidth: 4 },
  'Standard7High': { name: 'Standard 7 High', height: 7, file: 'Standard7High.bin', charWidth: 5 },
  'Narrow7High': { name: 'Narrow 7 High', height: 7, file: 'Narrow7High.bin', charWidth: 4 },
  'Standard9High': { name: 'Standard 9 High', height: 9, file: 'Standard9High.bin', charWidth: 6 },
  'Standard12High': { name: 'Standard 12 High', height: 12, file: 'Standard12High.bin', charWidth: 8 },
  'Standard16High': { name: 'Standard 16 High', height: 16, file: 'Standard16High.bin', charWidth: 10 },
  'Standard19High': { name: 'Standard 19 High', height: 19, file: 'Standard19High.bin', charWidth: 12 },
  'Standard25High': { name: 'Standard 25 High', height: 25, file: 'Standard25High.bin', charWidth: 16 },
  'Standard32High': { name: 'Standard 32 High', height: 32, file: 'Standard32High.bin', charWidth: 20 },
};

// Basic 5x7 dot matrix patterns (base patterns that get scaled)
const BASE_PATTERNS: Record<string, number[][]> = {
  'A': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  'B': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0]],
  'C': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,1],[0,1,1,1,0]],
  'D': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0]],
  'E': [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  'F': [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0]],
  'G': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[1,0,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'H': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  'I': [[0,1,1,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,1,1,0]],
  'J': [[0,0,1,1,1],[0,0,0,1,0],[0,0,0,1,0],[0,0,0,1,0],[0,0,0,1,0],[1,0,0,1,0],[0,1,1,0,0]],
  'K': [[1,0,0,0,1],[1,0,0,1,0],[1,0,1,0,0],[1,1,0,0,0],[1,0,1,0,0],[1,0,0,1,0],[1,0,0,0,1]],
  'L': [[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  'M': [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  'N': [[1,0,0,0,1],[1,1,0,0,1],[1,0,1,0,1],[1,0,0,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  'O': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'P': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0]],
  'Q': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,0,1,0],[0,1,1,0,1]],
  'R': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,1,0,0],[1,0,0,1,0],[1,0,0,0,1]],
  'S': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[0,1,1,1,0],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'T': [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  'U': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'V': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],[0,1,0,1,0],[0,0,1,0,0]],
  'W': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,1,0,1],[1,1,0,1,1],[1,0,0,0,1]],
  'X': [[1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1],[1,0,0,0,1]],
  'Y': [[1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  'Z': [[1,1,1,1,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  '0': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,1,1],[1,0,1,0,1],[1,1,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '1': [[0,0,1,0,0],[0,1,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,1,1,0]],
  '2': [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,1,1,1,1]],
  '3': [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,1,1,0],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '4': [[0,0,0,1,0],[0,0,1,1,0],[0,1,0,1,0],[1,0,0,1,0],[1,1,1,1,1],[0,0,0,1,0],[0,0,0,1,0]],
  '5': [[1,1,1,1,1],[1,0,0,0,0],[1,1,1,1,0],[0,0,0,0,1],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '6': [[0,0,1,1,0],[0,1,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '7': [[1,1,1,1,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  '8': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '9': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,1],[0,0,0,0,1],[0,0,0,1,0],[0,1,1,0,0]],
  ' ': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
  '-': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
  '.': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,1,0,0]],
  ':': [[0,0,0,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,0,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,0,0,0]],
  '/': [[0,0,0,0,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,0,0,0,0],[1,0,0,0,0]],
};

/**
 * Get the pattern for a character, or a default empty pattern
 */
export function getCharPattern(char: string): number[][] {
  return BASE_PATTERNS[char.toUpperCase()] || BASE_PATTERNS[' '];
}

/**
 * Get font info by font name
 */
export function getFontInfo(fontName: string): FontInfo {
  return PRINTER_FONTS[fontName] || PRINTER_FONTS['Standard16High'];
}

/**
 * Calculate the width of text in dots for a given font
 */
export function getTextWidthDots(text: string, fontName: string): number {
  const font = getFontInfo(fontName);
  return text.length * (font.charWidth + 1); // +1 for spacing
}

/**
 * Render a character bitmap scaled to the target font height
 */
export function renderCharBitmap(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  fontName: string,
  dotSize: number = 8
): number {
  const font = getFontInfo(fontName);
  const pattern = getCharPattern(char);
  
  const baseHeight = 7; // base pattern height
  const baseWidth = 5;  // base pattern width
  
  // Draw scaled dots (use cumulative rounding so total height/width matches exactly)
  // Use floor/ceil bounds to avoid ever “dropping” the last pixel row/col due to rounding.
  const cellH = (font.height / baseHeight) * dotSize;
  const cellW = (font.charWidth / baseWidth) * dotSize;

  for (let row = 0; row < baseHeight; row++) {
    const rowStart = Math.floor(y + row * cellH);
    const rowEnd = Math.ceil(y + (row + 1) * cellH);
    const dotH = Math.max(1, rowEnd - rowStart);

    for (let col = 0; col < baseWidth; col++) {
      if (pattern[row]?.[col] === 1) {
        const colStart = Math.floor(x + col * cellW);
        const colEnd = Math.ceil(x + (col + 1) * cellW);
        const dotW = Math.max(1, colEnd - colStart);

        ctx.fillRect(colStart, rowStart, dotW, dotH);
      }
    }
  }

  // Return the width consumed (for next character positioning)
  return font.charWidth * dotSize;
  // Return the width consumed (for next character positioning)
  return font.charWidth * dotSize;
}

/**
 * Render text string with the specified font
 */
export function renderText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontName: string,
  dotSize: number = 8
): void {
  const font = getFontInfo(fontName);
  let currentX = x;
  
  for (const char of text) {
    renderCharBitmap(ctx, char, currentX, y, fontName, dotSize);
    currentX += (font.charWidth + 1) * dotSize; // +1 dot spacing between chars
  }
}
