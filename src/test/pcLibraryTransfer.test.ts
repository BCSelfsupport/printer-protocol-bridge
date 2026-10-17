import { describe, it, expect, vi } from 'vitest';
import { transferPcLibraryMessage } from '@/lib/pcLibraryTransfer';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';
import type { Printer } from '@/types/printer';

const message: MessageDetails = {
  name: 'SHOWCODE', templateValue: '16',
  fields: [{ id: 1, type: 'text', data: 'PACK EXPO', x: 0, y: 0, fontSize: 'Standard7High' }],
} as MessageDetails;
const target: Printer = { id: 2, name: 'Printer 2', ipAddress: '192.168.1.20', port: 23,
  isConnected: false, isAvailable: true, status: 'ready', hasActiveErrors: false };

describe('PC Library cross-printer transfers', () => {
  it('writes to printer 2 and removes the printer 1 library key only after success', async () => {
    const actions = { write: vi.fn().mockResolvedValue(true), save: vi.fn(), remove: vi.fn(), setSlot: vi.fn() };
    expect(await transferPcLibraryMessage(message, target, 1, actions)).toBe(true);
    expect(actions.write).toHaveBeenCalledWith(target, message);
    expect(actions.save).toHaveBeenCalledWith(message, 2);
    expect(actions.remove).toHaveBeenCalledWith('SHOWCODE', 1);
    expect(actions.setSlot).toHaveBeenCalledWith('SHOWCODE', 2);
    expect(actions.write.mock.invocationCallOrder[0]).toBeLessThan(actions.remove.mock.invocationCallOrder[0]);
  });
  it('keeps the PC copy and destination bookkeeping unchanged when sending fails', async () => {
    const actions = { write: vi.fn().mockResolvedValue(false), save: vi.fn(), remove: vi.fn(), setSlot: vi.fn() };
    expect(await transferPcLibraryMessage(message, target, 1, actions)).toBe(false);
    expect(actions.save).not.toHaveBeenCalled();
    expect(actions.remove).not.toHaveBeenCalled();
    expect(actions.setSlot).not.toHaveBeenCalled();
  });
});