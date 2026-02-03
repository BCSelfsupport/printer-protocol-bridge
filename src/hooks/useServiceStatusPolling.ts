import { useEffect, useRef } from "react";

/**
 * Polls a connected printer with a command (default: ^SU) at a fixed interval.
 * Designed to run only in Electron where `window.electronAPI` exists.
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
    if (!window.electronAPI) {
      console.log('[useServiceStatusPolling] No electronAPI, not polling');
      return;
    }

    console.log('[useServiceStatusPolling] Starting polling for printer', printerId, 'with command', command);
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        console.log('[useServiceStatusPolling] Sending command:', command);
        const result = await window.electronAPI!.printer.sendCommand(printerId, command);
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
