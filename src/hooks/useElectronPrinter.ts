import { useCallback } from 'react';

export function useElectronPrinter() {
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

  const checkPrinterStatus = useCallback(async (printers: { id: number; ipAddress: string; port: number }[]) => {
    if (!isElectron || !window.electronAPI) {
      throw new Error('Not running in Electron');
    }
    return window.electronAPI.printer.checkStatus(printers);
  }, [isElectron]);

  const connectPrinter = useCallback(async (printer: { id: number; ipAddress: string; port: number }) => {
    if (!isElectron || !window.electronAPI) {
      throw new Error('Not running in Electron');
    }
    return window.electronAPI.printer.connect(printer);
  }, [isElectron]);

  const disconnectPrinter = useCallback(async (printerId: number) => {
    if (!isElectron || !window.electronAPI) {
      throw new Error('Not running in Electron');
    }
    return window.electronAPI.printer.disconnect(printerId);
  }, [isElectron]);

  const sendCommand = useCallback(async (printerId: number, command: string) => {
    if (!isElectron || !window.electronAPI) {
      throw new Error('Not running in Electron');
    }
    return window.electronAPI.printer.sendCommand(printerId, command);
  }, [isElectron]);

  return {
    isElectron,
    checkPrinterStatus,
    connectPrinter,
    disconnectPrinter,
    sendCommand,
  };
}
