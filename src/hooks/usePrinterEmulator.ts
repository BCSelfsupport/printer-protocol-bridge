import { useState, useCallback, useEffect } from 'react';
import { printerEmulator } from '@/lib/printerEmulator';

/**
 * Hook to use the printer emulator in development mode
 */
export function usePrinterEmulator() {
  const [isEnabled, setIsEnabled] = useState(printerEmulator.enabled);

  useEffect(() => {
    // Sync with emulator state
    const checkEnabled = () => setIsEnabled(printerEmulator.enabled);
    const interval = setInterval(checkEnabled, 100);
    return () => clearInterval(interval);
  }, []);

  /**
   * Send a command through the emulator
   */
  const sendCommand = useCallback((command: string) => {
    if (!printerEmulator.enabled) {
      return { success: false, response: 'Emulator not enabled' };
    }
    return printerEmulator.processCommand(command);
  }, []);

  /**
   * Check if emulator should handle this request
   */
  const shouldUseEmulator = useCallback(() => {
    return printerEmulator.enabled;
  }, []);

  return {
    isEnabled,
    sendCommand,
    shouldUseEmulator,
  };
}
