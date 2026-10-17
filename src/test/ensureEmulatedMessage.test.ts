import { describe, expect, it, vi } from 'vitest';
import { ensureEmulatedMessage } from '@/lib/ensureEmulatedMessage';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';

const details = { name: 'PACKEXPO', templateValue: '16', fields: [
  { id: 1, type: 'text', data: 'PACKEXPO', x: 0, y: 0, fontSize: 'Standard7High' },
] } as MessageDetails;

describe('select saved message across emulated printers', () => {
  it('loads PACKEXPO on missing Printer 13 then selects it on all 13 printers', async () => {
    multiPrinterEmulator.syncConfiguredPrinters([]);
    localStorage.clear();
    multiPrinterEmulator.enabled = true;
    const printers = Array.from({ length: 13 }, (_, index) => ({
      id: index + 1, name: `Printer ${index + 1}`, ipAddress: `192.168.1.${55 + index}`, port: 23,
    }));
    multiPrinterEmulator.syncConfiguredPrinters(printers);
    try {
      for (const printer of printers.slice(0, 12)) {
        multiPrinterEmulator.processCommand(printer.ipAddress, 23, '^NM 4;0;0;0;PACKEXPO');
      }
      expect(multiPrinterEmulator.processCommand(printers[12].ipAddress, 23, '^SM PACKEXPO')?.success).toBe(false);
      const results = await Promise.all(printers.map(async printer => {
        const emulator = multiPrinterEmulator.getInstanceByIp(printer.ipAddress, 23);
        if (!emulator) throw new Error('Missing emulator');
        const write = vi.fn(async (saved: MessageDetails) => emulator.processCommand(`^NM 4;0;0;0;${saved.name}^AT 0;0;0;0;0;PACKEXPO`).success);
        const result = await ensureEmulatedMessage(details.name, emulator.getState().messages, details, write);
        expect(write).toHaveBeenCalledTimes(printer.id === 13 ? 1 : 0);
        return result.ok && emulator.processCommand('^SM PACKEXPO').success;
      }));
      expect(results).toEqual(Array(13).fill(true));
      expect(multiPrinterEmulator.getInstanceByIp(printers[12].ipAddress, 23)?.getState().currentMessage).toBe('PACKEXPO');
    } finally {
      multiPrinterEmulator.syncConfiguredPrinters([]);
      multiPrinterEmulator.enabled = false;
    }
  });
  it('does not report success or select when the missing message upload fails', async () => {
    const write = vi.fn().mockResolvedValue(false);
    const result = await ensureEmulatedMessage('PACKEXPO', ['BESTCODE'], details, write);
    expect(result.ok).toBe(false);
    expect(result.created).toBe(false);
    expect(write).toHaveBeenCalledWith(details);
  });
  it('does not write when the message content is unavailable', async () => {
    const write = vi.fn();
    expect((await ensureEmulatedMessage('PACKEXPO', ['BESTCODE'], null, write)).ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});