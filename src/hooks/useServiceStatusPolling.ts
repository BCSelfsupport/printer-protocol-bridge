import { useEffect, useRef } from "react";
import { printerEmulator } from "@/lib/printerEmulator";

/**
 * Polls a connected printer with a command (default: ^SU) at a fixed interval.
 * Works with both Electron (real printers) and the emulator (web preview).
 */
export function useServiceStatusPolling(options: {
  enabled: boolean;
  printerId: number | null | undefined;
  intervalMs?: number;
  command?: string;
  onResponse: (response: string) => void;
  onError?: (error: unknown) => void;
}) {
  const {
    enabled,
    printerId,
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
    
    // Determine if we should use emulator or Electron API
    const useEmulator = printerEmulator.enabled;
    const hasElectronAPI = !!window.electronAPI;
    
    if (!useEmulator && !hasElectronAPI) {
      console.log('[useServiceStatusPolling] No electronAPI and emulator not enabled, not polling');
      return;
    }

    console.log('[useServiceStatusPolling] Starting polling for printer', printerId, 'with command', command, 'useEmulator:', useEmulator);
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        console.log('[useServiceStatusPolling] Sending command:', command);
        
        let result: { success: boolean; response?: string; error?: string };
        
        if (useEmulator) {
          // Use emulator directly
          const emulatorResult = printerEmulator.processCommand(command);
          result = { success: emulatorResult.success, response: emulatorResult.response };
        } else {
          // Use Electron API
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

    // Delay first tick slightly to allow socket connection to establish
    const initialDelay = setTimeout(() => {
      if (!cancelled) {
        tick();
      }
    }, 500);
    
    const id = window.setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
      window.clearInterval(id);
    };
  }, [enabled, printerId, intervalMs, command]);
}
