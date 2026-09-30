import { describe, expect, it } from 'vitest';
import { canvasYAfterFontChange, getValidCanvasYPositions, buildMessageDetails, parseGmResponse, parseLfResponse } from '@/lib/messageProtocol';
import { clampDragX } from '@/components/messages/MessageCanvas';

describe('field dragging at the left edge', () => {
  it('stops a single field at column zero', () => {
    expect(clampDragX(-12, [])).toBe(0);
    expect(clampDragX(3, [])).toBe(3);
  });

  it('stops a group when its leftmost piece reaches column zero', () => {
    const offsets = [{ dx: -18 }, { dx: -6 }, { dx: 10 }];
    expect(clampDragX(-4, offsets)).toBe(18);
    expect(clampDragX(12, offsets)).toBe(18);
    expect(clampDragX(24, offsets)).toBe(24);
  });
});

describe('16-dot template with two 7-high lines', () => {
  it('keeps the upper line above the lower line when its font changes', () => {
    const upperY = canvasYAfterFontChange('16', 16, 7, 16);
    const rows = getValidCanvasYPositions('16', 16, 7);
    expect(rows).toEqual([17, 25]);
    expect(upperY).toBe(17);
    expect(rows[1] - (upperY + 7)).toBe(1);
    expect(canvasYAfterFontChange('16', 16, 7, 25)).toBe(25);
  });

  it('round-trips text above a date field from printer coordinates', () => {
    // Save conversion: printerY = 32 - canvasY - fieldHeight.
    const topPrinterY = 32 - 17 - 7;
    const bottomPrinterY = 32 - 25 - 7;
    expect([topPrinterY, bottomPrinterY]).toEqual([8, 0]);
    const lf = [
      'Fields (2):',
      `Field 1: T:4000 (0, ${topPrinterY}) W:30 H:7 B:0 G:1, R:0`,
      'Element: T:0 D:TOP',
      `Field 2: T:4000 (0, ${bottomPrinterY}) W:30 H:7 B:0 G:1, R:0`,
      'Element: T:3 D:09/30/26',
    ].join('\r\n');
    const details = buildMessageDetails('TEST', parseLfResponse(lf, 'TEST'), parseGmResponse('T:4 S:0 O:0 P:0'));
    expect(details.fields.map(f => [f.type, f.y, f.fontSize])).toEqual([
      ['text', 17, 'Standard7High'],
      ['date', 25, 'Standard7High'],
    ]);
  });
});