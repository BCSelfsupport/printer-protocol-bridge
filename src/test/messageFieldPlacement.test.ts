import { describe, expect, it } from 'vitest';
import { canvasYAfterFontChange, getValidCanvasYPositions, buildMessageDetails, parseGmResponse, parseLfResponse } from '@/lib/messageProtocol';
import { clampDragX } from '@/components/messages/MessageCanvas';

describe('mixed-font and multiline readback', () => {
  it('keeps FINLOGIC with AB above 23 on a 16-dot template across repeated reads', () => {
    let fields = [
      { x: 0, y: 16, height: 16, font: 5, data: 'FINLOGIC' },
      { x: 88, y: 17, height: 7, font: 2, data: 'AB' },
      { x: 88, y: 25, height: 7, font: 2, data: '23' },
    ];
    for (let cycle = 0; cycle < 3; cycle++) {
      const lf = fields.flatMap((f, i) => [
        `Field ${i + 1}: T:4000 (${f.x}, ${32 - f.y - f.height}) W:30 H:${f.height} S:${f.font} B:0 G:1, R:0`,
        `Element: T:0 D:${f.data}`,
      ]).join('\r\n');
      const result = buildMessageDetails('PROVAFIERA', parseLfResponse(lf, 'PROVAFIERA'), parseGmResponse('T:4 S:0 O:0 P:0'));
      expect(result.fields.map(f => [f.x, f.y, f.height, f.data])).toEqual([
        [0, 16, 16, 'FINLOGIC'], [88, 17, 7, 'AB'], [88, 25, 7, '23'],
      ]);
      fields = result.fields.map((f, i) => ({ ...f, font: fields[i].font }));
    }
  });

  it('uses the explicit text font height rather than a mismatching field box', () => {
    const lf = 'Field 1: T:4000 (88, 8) W:30 H:9 S:2 B:0 G:1, R:0\r\nElement: T:0 D:AB';
    const result = buildMessageDetails('TEST', parseLfResponse(lf, 'TEST'), parseGmResponse('T:4 S:0 O:0 P:0'));
    expect([result.fields[0].y, result.fields[0].height, result.fields[0].fontSize]).toEqual([17, 7, 'Standard7High']);
  });

  it('bottom-aligns smaller fonts within multiline slots consistently with printer Y', () => {
    expect(getValidCanvasYPositions('multi-2x9', 19, 7)).toEqual([15, 25]);
    expect(canvasYAfterFontChange('multi-2x9', 19, 7, 15)).toBe(15);
    expect(canvasYAfterFontChange('16', 16, 7, 17)).toBe(17);
    expect(canvasYAfterFontChange('16', 16, 7, 25)).toBe(25);
  });
});

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