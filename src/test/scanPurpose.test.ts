import { describe, it, expect } from 'vitest';
import { findMessageByScan, isSelectMessageScan, SELECT_MESSAGE_SCAN } from '@/lib/scanPurpose';

const msgs = [{ name: 'PACKEXPO' }, { name: 'BESTCODE' }];

describe('scan to select message', () => {
  it('matches the work-sheet code to the message name ignoring case and spaces', () => {
    expect(findMessageByScan(msgs, ' packexpo \n')?.name).toBe('PACKEXPO');
  });
  it('returns nothing when no message has that name', () => {
    expect(findMessageByScan(msgs, 'PACKEXP')).toBeNull();
  });
  it('tells select requests apart from field scans', () => {
    expect(isSelectMessageScan(SELECT_MESSAGE_SCAN)).toBe(true);
    expect(isSelectMessageScan('PACKEXPO')).toBe(false);
  });
});
