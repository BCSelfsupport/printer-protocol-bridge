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
    intervalMs = 1000,
    command = "^SU",
    onResponse,
    onError,
  } = options;

  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!printerId) return;
    if (!window.electronAPI) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const result = await window.electronAPI!.printer.sendCommand(printerId, command);
        if (cancelled) return;
        if (result.success && typeof result.response === "string") {
          onResponse(result.response);
        } else if (!result.success) {
          onError?.(new Error(result.error || "Command failed"));
        }
      } catch (e) {
        if (!cancelled) onError?.(e);
      } finally {
        inFlightRef.current = false;
      }
    };

    // fire immediately, then interval
    tick();
    const id = window.setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, printerId, intervalMs, command, onResponse, onError]);
}
