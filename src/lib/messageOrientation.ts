export type PrinterRotation = 'Normal' | 'Flip' | 'Mirror' | 'Mirror Flip';
export type MessageOrientation = PrinterRotation | 'Tower' | 'Tower Flip' | 'Tower Mirror' | 'Tower Mirror Flip';

export const MESSAGE_ORIENTATION_TO_CODE: Record<MessageOrientation, number> = {
  Normal: 0,
  Flip: 1,
  Mirror: 2,
  'Mirror Flip': 3,
  Tower: 4,
  'Tower Flip': 5,
  'Tower Mirror': 6,
  'Tower Mirror Flip': 7,
};

export const CODE_TO_MESSAGE_ORIENTATION: Record<number, MessageOrientation> = {
  0: 'Normal',
  1: 'Flip',
  2: 'Mirror',
  3: 'Mirror Flip',
  4: 'Tower',
  5: 'Tower Flip',
  6: 'Tower Mirror',
  7: 'Tower Mirror Flip',
};

export function isTowerOrientation(rotation: MessageOrientation | string | undefined): boolean {
  return rotation?.startsWith('Tower') ?? false;
}

export function basePrinterRotation(rotation: MessageOrientation | string | undefined): PrinterRotation {
  if (rotation === 'Flip' || rotation === 'Tower Flip') return 'Flip';
  if (rotation === 'Mirror' || rotation === 'Tower Mirror') return 'Mirror';
  if (rotation === 'Mirror Flip' || rotation === 'Tower Mirror Flip') return 'Mirror Flip';
  return 'Normal';
}

const ROTATE_180: Record<PrinterRotation, PrinterRotation> = {
  Normal: 'Mirror Flip', 'Mirror Flip': 'Normal', Flip: 'Mirror', Mirror: 'Flip',
};

/** towerReverse rotates the tower print 180° (Mirror+Flip) so it reads the opposite direction (ABC vs CBA). */
export function withTowerRotation(rotation: MessageOrientation | string | undefined, towerPrint: boolean, towerReverse = false): MessageOrientation {
  let base = basePrinterRotation(rotation);
  if (!towerPrint) return base;
  if (towerReverse) base = ROTATE_180[base];
  if (base === 'Flip') return 'Tower Flip';
  if (base === 'Mirror') return 'Tower Mirror';
  if (base === 'Mirror Flip') return 'Tower Mirror Flip';
  return 'Tower';
}