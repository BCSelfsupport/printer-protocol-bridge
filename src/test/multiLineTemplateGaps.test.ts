import { describe, it, expect } from 'vitest';
import { buildMessageDetails, TEMPLATE_LINE_Y_POSITIONS } from '@/lib/messageProtocol';

const HEIGHT: Record<string, number> = {
  'multi-2x5': 11, 'multi-2x7': 15, 'multi-2x7s': 15, 'multi-2x9': 19, 'multi-2x12': 25,
  'multi-3x7': 23, 'multi-3x9': 29, 'multi-4x5': 23, 'multi-4x7': 31, 'multi-5x5': 29,
};
const FONT_CODE: Record<number, number> = { 5: 0, 7: 2, 9: 3, 12: 4 };

describe('multi-line templates keep one blank row between every line', () => {
  for (const [tpl, h] of Object.entries(HEIGHT)) {
    const lineH = parseInt(tpl.match(/x(\d+)/)![1], 10);
    for (const packed of [false, true]) {
      it(`${tpl} (${packed ? 'packed' : 'gapped'} ^LF Y)`, () => {
        const slots = TEMPLATE_LINE_Y_POSITIONS[tpl];
        const fields = slots.map((s, i) => ({
          fieldNum: i + 1, x: 0, y: packed ? i * lineH : s, width: 40, height: lineH,
          fontCode: FONT_CODE[lineH], elementType: 0, elementData: `L${i}`, bold: 0, gap: 1, rotation: 0,
          protocolCommand: 'AT',
        })) as any;
        const d = buildMessageDetails('T', fields, { templateValue: tpl, templateHeight: h });
        const ys = d.fields.map(f => f.y).sort((a, b) => a - b);
        for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBe(lineH + 1);
        expect(ys[ys.length - 1] + lineH).toBe(32);
      });
    }
  }
});
