import { describe, expect, it } from 'vitest';
import {
  CODE_TO_MESSAGE_ORIENTATION,
  MESSAGE_ORIENTATION_TO_CODE,
  withTowerRotation,
} from '@/lib/messageOrientation';
import { buildMessageDetails, parseGmResponse } from '@/lib/messageProtocol';

describe('Tower Print orientation', () => {
  it.each([
    ['Normal', 'Tower', 4],
    ['Flip', 'Tower Flip', 5],
    ['Mirror', 'Tower Mirror', 6],
    ['Mirror Flip', 'Tower Mirror Flip', 7],
  ] as const)('converts %s to %s', (base, tower, code) => {
    expect(withTowerRotation(base, true)).toBe(tower);
    expect(MESSAGE_ORIENTATION_TO_CODE[tower]).toBe(code);
    expect(CODE_TO_MESSAGE_ORIENTATION[code]).toBe(tower);
  });

  it.each([4, 5, 6, 7])('keeps protocol orientation %i during read-back', (orientation) => {
    const parsed = parseGmResponse(`T:4 S:2 O:${orientation} P:0`);
    expect(parsed?.orientation).toBe(orientation);

    const details = buildMessageDetails('CABLE', [], parsed);
    expect(details.towerPrint).toBe(true);
    expect(details.settings?.rotation).toBe(CODE_TO_MESSAGE_ORIENTATION[orientation]);
  });
});