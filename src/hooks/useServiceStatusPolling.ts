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
          onResponseRef.current(result.response);
        } else if (!result.success) {
          onErrorRef.current?.(new Error(result.error || "Command failed"));
        }
      } catch (e) {
        if (!cancelled) onErrorRef.current?.(e);
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
  }, [enabled, printerId, intervalMs, command]);
}
