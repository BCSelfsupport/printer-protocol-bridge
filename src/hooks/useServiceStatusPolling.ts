import { useEffect, useRef, useState } from "react";
import { printerEmulator } from "@/lib/printerEmulator";
import { multiPrinterEmulator } from "@/lib/multiPrinterEmulator";
import { printerTransport, isRelayMode } from "@/lib/printerTransport";
import { beginPollingActivity, isPollingPaused, onPollingPauseChange } from "@/lib/pollingPause";
import { isSaveBusy } from "@/lib/saveBusy";
import { runPrinterWriteExclusive } from "@/lib/printerWriteQueue";

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
  const [isPaused, setIsPaused] = useState(isPollingPaused);

  useEffect(() => {
    return onPollingPauseChange(setIsPaused);
  }, []);

  useEffect(() => {
    if (!enabled) {
      console.log('[useServiceStatusPolling] Disabled, not polling');
      return;
    }
    if (!printerId) {
      console.log('[useServiceStatusPolling] No printerId, not polling');
      return;
    }
    if (isPaused) {
      console.log('[useServiceStatusPolling] Polling paused, not polling');
      return;
    }

    console.log('[useServiceStatusPolling] Starting polling for printer', printerId, printerIp, 'with command', command);
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (inFlightRef.current) return;
      // Fast-path bail: don't even wait for the lock if a save is in flight.
      if (isSaveBusy()) return;
      inFlightRef.current = true;

      const isEmulatorEnabled = multiPrinterEmulator.enabled || printerEmulator.enabled;
      const hasElectronAPI = !!window.electronAPI;
      const relayMode = isRelayMode();

      if (!isEmulatorEnabled && !hasElectronAPI && !relayMode) {
        inFlightRef.current = false;
        return;
      }

      const runTick = async () => {
        // Re-check after acquiring the lock — a save may have queued ahead.
        if (cancelled || isSaveBusy()) return;
        const endPollingActivity = beginPollingActivity();
        try {
          let result: { success: boolean; response?: string; error?: string };

          if (isEmulatorEnabled) {
            let emulator: { processCommand: (cmd: string) => { success: boolean; response: string } };
            if (multiPrinterEmulator.enabled && printerIp) {
              const instance = multiPrinterEmulator.getInstanceByIp(printerIp, printerPort);
              emulator = instance || printerEmulator;
            } else {
              emulator = printerEmulator;
            }
            const emulatorResult = emulator.processCommand(command);
            result = { success: emulatorResult.success, response: emulatorResult.response };
          } else {
            result = await printerTransport.sendCommand(printerId, command, { caller: 'serviceStatusPolling' });
          }

          if (cancelled) return;
          if (result.success && typeof result.response === "string") {
            onResponseRef.current(result.response);
          } else if (!result.success) {
            onErrorRef.current?.(new Error(result.error || "Command failed"));
          }
        } catch (e) {
          if (!cancelled) onErrorRef.current?.(e);
        } finally {
          endPollingActivity();
        }
      };

      try {
        // Emulator ticks don't touch a real socket, so skip the exclusive lock.
        if (isEmulatorEnabled) {
          await runTick();
        } else {
          // Wrap in the per-printer exclusive lock so this poll cannot race
          // with a save/select transaction on the same printer.
          await runPrinterWriteExclusive(printerId, runTick);
        }
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
  }, [enabled, printerId, printerIp, printerPort, intervalMs, command, isPaused]);
}
