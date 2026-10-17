import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';

const printers = [{ id: 1, name: 'Show Printer', ipAddress: '192.168.90.20', port: 23 }];
beforeEach(() => {
  multiPrinterEmulator.syncConfiguredPrinters([]);
  localStorage.clear();
  multiPrinterEmulator.enabled = true;
});
afterEach(() => {
  multiPrinterEmulator.syncConfiguredPrinters([]);
  multiPrinterEmulator.enabled = false;
});
describe('emulated message persistence', () => {
  it('does not restore deleted SAMPLE after recreating the printer', () => {
    multiPrinterEmulator.syncConfiguredPrinters(printers);
    const instance = multiPrinterEmulator.getInstanceByIp(printers[0].ipAddress, 23);
    expect(instance?.processCommand('^DM SAMPLE').success).toBe(true);
    expect(instance?.processCommand('^NM 4;0;0;0;SHOWCODE').success).toBe(true);
    multiPrinterEmulator.syncConfiguredPrinters([]);
    multiPrinterEmulator.syncConfiguredPrinters(printers);
    const messages = multiPrinterEmulator.getInstanceByIp(printers[0].ipAddress, 23)?.getState().messages;
    expect(messages).not.toContain('SAMPLE');
    expect(messages).toContain('SHOWCODE');
  });
  it('does not seed sample messages over a saved empty list', () => {
    localStorage.setItem(`emulator-messages-${printers[0].ipAddress}`, '[]');
    multiPrinterEmulator.syncConfiguredPrinters(printers);
    expect(multiPrinterEmulator.getInstanceByIp(printers[0].ipAddress, 23)?.getState().messages).toEqual([]);
  });
});