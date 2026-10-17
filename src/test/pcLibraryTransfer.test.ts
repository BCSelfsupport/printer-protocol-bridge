import { describe, it, expect, vi } from 'vitest';
import { transferPcLibraryMessage } from '@/lib/pcLibraryTransfer';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';
import type { Printer } from '@/types/printer';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';

const message: MessageDetails = {
  name: 'SHOWCODE', templateValue: '16',
  fields: [{ id: 1, type: 'text', data: 'PACK EXPO', x: 0, y: 0, fontSize: 'Standard7High' }],
} as MessageDetails;
const target: Printer = { id: 2, name: 'Printer 2', ipAddress: '192.168.1.20', port: 23,
  isConnected: false, isAvailable: true, status: 'ready', hasActiveErrors: false };

describe('PC Library cross-printer transfers', () => {
  it('transfers a saved PC message to a different emulator and retains it after reload', async () => {
    const source = { ...target, id: 1, ipAddress: '192.168.1.19' };
    multiPrinterEmulator.syncConfiguredPrinters([]);
    localStorage.clear();
    multiPrinterEmulator.enabled = true;
    multiPrinterEmulator.syncConfiguredPrinters([source, target]);
    localStorage.setItem('bestcode-pc-library', JSON.stringify({ '1:SHOWCODE': message }));
    try {
      const ok = await transferPcLibraryMessage(message, target, 1, {
        existingNames: multiPrinterEmulator.getInstanceByIp(target.ipAddress, 23)?.getState().messages ?? [],
        write: async (printer, details) => multiPrinterEmulator.getInstanceByIp(printer.ipAddress, printer.port)
          ?.processCommand(`^NM 4;0;0;0;${details.name}^AT 0;0;0;0;0;PACK EXPO`).success ?? false,
        save: (details, id) => localStorage.setItem(`saved-${id}`, JSON.stringify(details)),
        remove: (name, id) => {
          const library = JSON.parse(localStorage.getItem('bestcode-pc-library') ?? '{}');
          delete library[`${id}:${name}`];
          localStorage.setItem('bestcode-pc-library', JSON.stringify(library));
        },
      });
      expect(ok).toBe(true);
      expect(multiPrinterEmulator.getInstanceByIp(source.ipAddress, 23)?.getState().messages).not.toContain('SHOWCODE');
      expect(multiPrinterEmulator.getInstanceByIp(target.ipAddress, 23)?.getState().messages).toContain('SHOWCODE');
      expect(multiPrinterEmulator.getInstanceByIp(target.ipAddress, 23)?.getState().messages).toContain('SAMPLE');
      expect(multiPrinterEmulator.getInstanceByIp(target.ipAddress, 23)?.getState().messages).toContain('TEST');
      expect(JSON.parse(localStorage.getItem('saved-2') ?? '{}').fields[0].data).toBe('PACK EXPO');
      expect(JSON.parse(localStorage.getItem('bestcode-pc-library') ?? '{}')).toEqual({});
      multiPrinterEmulator.syncConfiguredPrinters([]);
      multiPrinterEmulator.syncConfiguredPrinters([source, target]);
      expect(multiPrinterEmulator.getInstanceByIp(target.ipAddress, 23)?.getState().messages).toContain('SHOWCODE');
    } finally {
      multiPrinterEmulator.syncConfiguredPrinters([]);
      multiPrinterEmulator.enabled = false;
    }
  });
  it('writes to printer 2 and removes the printer 1 library key only after success', async () => {
    const actions = { existingNames: ['SAMPLE', 'TEST'], write: vi.fn().mockResolvedValue(true), save: vi.fn(), remove: vi.fn() };
    expect(await transferPcLibraryMessage(message, target, 1, actions)).toBe(true);
    expect(actions.write).toHaveBeenCalledWith(target, message);
    expect(actions.save).toHaveBeenCalledWith(message, 2);
    expect(actions.remove).toHaveBeenCalledWith('SHOWCODE', 1);
    expect(actions.write.mock.invocationCallOrder[0]).toBeLessThan(actions.remove.mock.invocationCallOrder[0]);
  });
  it('keeps the PC copy and destination bookkeeping unchanged when sending fails', async () => {
    const actions = { existingNames: ['SAMPLE', 'TEST'], write: vi.fn().mockResolvedValue(false), save: vi.fn(), remove: vi.fn() };
    expect(await transferPcLibraryMessage(message, target, 1, actions)).toBe(false);
    expect(actions.save).not.toHaveBeenCalled();
    expect(actions.remove).not.toHaveBeenCalled();
  });
  it('never overwrites an existing same-name message, even with different case', async () => {
    const actions = { existingNames: ['showcode'], write: vi.fn(), save: vi.fn(), remove: vi.fn() };
    expect(await transferPcLibraryMessage(message, target, 1, actions)).toBe(false);
    expect(actions.write).not.toHaveBeenCalled();
    expect(actions.save).not.toHaveBeenCalled();
    expect(actions.remove).not.toHaveBeenCalled();
  });
});