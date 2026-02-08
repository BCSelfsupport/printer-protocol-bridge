import { useState, useCallback, useEffect } from 'react';
import { printerEmulator } from '@/lib/printerEmulator';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';

/**
 * Hook to use the printer emulator in development mode
 * Supports both single emulator (backward compat) and multi-printer emulator
 */
export function usePrinterEmulator() {
  const [isEnabled, setIsEnabled] = useState(
    printerEmulator.enabled || multiPrinterEmulator.enabled
  );

  useEffect(() => {
    // Sync with both emulator states
    const checkEnabled = () => setIsEnabled(
      printerEmulator.enabled || multiPrinterEmulator.enabled
    );
    const interval = setInterval(checkEnabled, 100);
    return () => clearInterval(interval);
  }, []);

  /**
   * Send a command through the emulator (for specific printer IP)
   */
  const sendCommand = useCallback((command: string, ipAddress?: string, port?: number) => {
    // Try multi-printer emulator first if IP is provided
    if (ipAddress && multiPrinterEmulator.enabled) {
      const result = multiPrinterEmulator.processCommand(ipAddress, port || 23, command);
      if (result) return result;
    }
    
    // Fall back to single emulator
    if (!printerEmulator.enabled) {
      return { success: false, response: 'Emulator not enabled' };
    }
    return printerEmulator.processCommand(command);
  }, []);

  /**
   * Check if emulator should handle this request
   */
  const shouldUseEmulator = useCallback((ipAddress?: string, port?: number) => {
    // Check multi-printer emulator first
    if (multiPrinterEmulator.enabled && ipAddress) {
      return multiPrinterEmulator.isEmulatedIp(ipAddress, port);
    }
    // Fall back to single emulator check
    return printerEmulator.enabled;
  }, []);

  /**
   * Check if a specific IP is emulated
   */
  const isEmulatedIp = useCallback((ipAddress: string, port?: number) => {
    if (multiPrinterEmulator.enabled) {
      return multiPrinterEmulator.isEmulatedIp(ipAddress, port);
    }
    // For single emulator, only 192.168.1.55 is emulated
    return printerEmulator.enabled && ipAddress === '192.168.1.55';
  }, []);

  return {
    isEnabled,
    sendCommand,
    shouldUseEmulator,
    isEmulatedIp,
  };
}
