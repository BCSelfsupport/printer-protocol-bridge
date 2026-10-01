import { describe, expect, it, vi } from 'vitest';
import { getCharAdvanceDots, getTextWidthDots, renderCharBitmap, renderText } from '@/lib/dotMatrixFonts';

describe('printer Bold preview', () => {
  it('extends each lit dot one column to the right for Bold 1', () => {
    const fillRect = vi.fn();
    const ctx = { fillRect } as unknown as CanvasRenderingContext2D;
    renderCharBitmap(ctx, 'T', 0, 0, 'Standard7High', 1, 1);
    // Five lit dots on the top row each become two dots wide.
    expect(fillRect.mock.calls.filter(([, y]) => y === 0).map(([, , w]) => w)).toEqual([2, 2, 2, 2, 2]);
    expect(getCharAdvanceDots('Standard7High', 1, 1)).toBe(7);
  });

  it('moves the next character by the enlarged glyph width plus its gap', () => {
    const fillRect = vi.fn();
    const ctx = { fillRect } as unknown as CanvasRenderingContext2D;
    renderText(ctx, 'TT', 0, 0, 'Standard7High', 1, 1, 1);
    expect(fillRect.mock.calls.some(([x, y]) => x === 7 && y === 0)).toBe(true);
    expect(getTextWidthDots('TT', 'Standard7High', 1, 1)).toBe(14);
    expect(getTextWidthDots('TT', 'Standard7High')).toBe(12);
  });
});