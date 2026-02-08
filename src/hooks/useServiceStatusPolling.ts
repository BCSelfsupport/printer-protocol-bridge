import { useEffect, useRef } from "react";
import { printerEmulator } from "@/lib/printerEmulator";
import { multiPrinterEmulator } from "@/lib/multiPrinterEmulator";

/**
 * Polls a connected printer with a command (default: ^SU) at a fixed interval.
 * Works with both Electron (real printers) and the emulator (web preview).
 */
export function useServiceStatusPolling(options: {
  enabled: boolean;
  printerId: number | null | undefined;
  printerIp?: string;
  printerPort?: number;
  intervalMs?: number;
  command?: string;
  onResponse: (response: string) => void;
  onError?: (error: unknown) => void;
}) {
  const {
    enabled,
    printerId,
    printerIp,
    printerPort = 23,
    intervalMs = 3000, // slower default to reduce printer display flicker
    command = "^SU",
    onResponse,
    onError,
  } = options;

  // Store callbacks in refs to avoid effect re-runs when they change identity
  const onResponseRef = useRef(onResponse);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onResponseRef.current = onResponse;
    onErrorRef.current = onError;
  });

  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      console.log('[useServiceStatusPolling] Disabled, not polling');
      return;
    }
    if (!printerId) {
      console.log('[useServiceStatusPolling] No printerId, not polling');
      return;
    }

    console.log('[useServiceStatusPolling] Starting polling for printer', printerId, printerIp, 'with command', command);
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const useMultiEmulator = multiPrinterEmulator.enabled;
        const useSingleEmulator = printerEmulator.enabled;
        const hasElectronAPI = !!window.electronAPI;

        if (!useMultiEmulator && !useSingleEmulator && !hasElectronAPI) {
          console.log('[useServiceStatusPolling] No electronAPI and emulator not enabled, skip tick');
          return;
        }

        console.log('[useServiceStatusPolling] Sending command:', command, 'useMultiEmulator:', useMultiEmulator, 'useSingleEmulator:', useSingleEmulator);

        let result: { success: boolean; response?: string; error?: string };

        if (useMultiEmulator && printerIp) {
          // Use the specific emulator instance for this printer
          const instance = multiPrinterEmulator.getInstanceByIp(printerIp, printerPort);
          if (instance) {
            const emulatorResult = instance.processCommand(command);
            result = { success: emulatorResult.success, response: emulatorResult.response };
          } else {
            // Fall back to single emulator if no instance found
            const emulatorResult = printerEmulator.processCommand(command);
            result = { success: emulatorResult.success, response: emulatorResult.response };
          }
        } else if (useSingleEmulator) {
          const emulatorResult = printerEmulator.processCommand(command);
          result = { success: emulatorResult.success, response: emulatorResult.response };
        } else {
          result = await window.electronAPI!.printer.sendCommand(printerId, command);
        }

        if (cancelled) return;
        if (result.success && typeof result.response === "string") {
          console.log('[useServiceStatusPolling] Got response, length:', result.response.length);
          onResponseRef.current(result.response);
        } else if (!result.success) {
          console.error('[useServiceStatusPolling] Command failed:', result.error);
          onErrorRef.current?.(new Error(result.error || "Command failed"));
        }
      } catch (e) {
        console.error('[useServiceStatusPolling] Error:', e);
        if (!cancelled) onErrorRef.current?.(e);
      } finally {
        inFlightRef.current = false;
      }
    };

    const initialDelay = setTimeout(() => {
      if (!cancelled) tick();
    }, 500);

    const id = window.setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
      window.clearInterval(id);
    };
  }, [enabled, printerId, printerIp, printerPort, intervalMs, command]);
}
