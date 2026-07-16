import { useEffect, useRef, useState } from "react";
import { printerEmulator } from "@/lib/printerEmulator";
import { multiPrinterEmulator } from "@/lib/multiPrinterEmulator";
import { beginPollingActivity, isPollingPaused, onPollingPauseChange } from "@/lib/pollingPause";
import { isSaveBusy } from "@/lib/saveBusy";
import { printerTransport, isRelayMode } from "@/lib/printerTransport";
import { runPrinterWriteExclusive } from "@/lib/printerWriteQueue";

/**
 * Serialized polling hook: sends multiple commands sequentially over a single
 * interval, preventing TCP socket collisions that occur when separate hooks
 * fire concurrently on the same printer connection.
 */
export interface PollingCommand {
  command: string;
  onResponse: (response: string) => void;
}

export function useSerializedPolling(options: {
  enabled: boolean;
  printerId: number | null | undefined;
  printerIp?: string;
  printerPort?: number;
  intervalMs?: number;
  initialDelayMs?: number;
  commands: PollingCommand[];
  onError?: (error: unknown) => void;
  /** Called when an entire polling cycle completes with zero successful responses */
  onCycleFailure?: () => void;
  /** Called when a polling cycle gets at least one successful response */
  onCycleSuccess?: () => void;
}) {
  const {
    enabled,
    printerId,
    printerIp,
    printerPort = 23,
    intervalMs = 3000,
    initialDelayMs = 1500,
    commands,
    onError,
    onCycleFailure,
    onCycleSuccess,
  } = options;

  // Store callbacks in refs to avoid effect re-runs
  const commandsRef = useRef(commands);
  const onErrorRef = useRef(onError);
  const onCycleFailureRef = useRef(onCycleFailure);
  const onCycleSuccessRef = useRef(onCycleSuccess);
  useEffect(() => {
    commandsRef.current = commands;
    onErrorRef.current = onError;
    onCycleFailureRef.current = onCycleFailure;
    onCycleSuccessRef.current = onCycleSuccess;
  });

  const inFlightRef = useRef(false);
  const [isPaused, setIsPaused] = useState(isPollingPaused);

  // Subscribe to global pause state changes
  useEffect(() => {
    return onPollingPauseChange(setIsPaused);
  }, []);

  useEffect(() => {
    if (!enabled || !printerId || isPaused) return;

    console.log('[useSerializedPolling] Starting for printer', printerId, 'commands:', commands.map(c => c.command));
    let cancelled = false;

    // Wrap a promise with a timeout to prevent hung TCP responses from killing polling
    const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`[${label}] timed out after ${ms}ms`)), ms);
        promise.then(
          (v) => { clearTimeout(timer); resolve(v); },
          (e) => { clearTimeout(timer); reject(e); },
        );
      });
    };

    const tick = async () => {
      if (cancelled || inFlightRef.current) return;
      // Fast-path bail: don't even acquire the lock if a save is in flight.
      // Prevents polling from queuing behind long save transactions.
      if (isSaveBusy()) return;
      inFlightRef.current = true;

      const isEmulatorEnabled = multiPrinterEmulator.enabled || printerEmulator.enabled;
      const hasElectronAPI = !!window.electronAPI;
      const relayMode = isRelayMode();

      if (!isEmulatorEnabled && !hasElectronAPI && !relayMode) {
        inFlightRef.current = false;
        return;
      }

      // Acquire the per-printer exclusive lock so this whole poll cycle is
      // mutually exclusive with any save/select transaction on the same
      // printer. Closes the TOCTOU window that the isSaveBusy() point-check
      // alone couldn't cover.
      const runTick = async () => {
        // Re-check saveBusy after acquiring the lock in case a save queued
        // ahead of us and released before we ran.
        if (cancelled || isSaveBusy()) return;
        const endPollingActivity = beginPollingActivity();
        try {
          let successCount = 0;

          for (const cmd of commandsRef.current) {
            if (cancelled) break;
            // Abandon the rest of this cycle if a save has started —
            // save latency matters more than one poll tick.
            if (isSaveBusy()) break;

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
                const emulatorResult = emulator.processCommand(cmd.command);
                result = { success: emulatorResult.success, response: emulatorResult.response };
              } else {
                result = await withTimeout(
                  printerTransport.sendCommand(printerId, cmd.command, { caller: 'serializedPolling' }),
                  8000,
                  cmd.command,
                );
              }

              if (cancelled) break;
              if (result.success && typeof result.response === "string") {
                successCount++;
                cmd.onResponse(result.response);
              }
            } catch (e) {
              console.error('[useSerializedPolling] Error on', cmd.command, ':', e);
            }

            if (!isEmulatorEnabled && !cancelled) {
              await new Promise((r) => setTimeout(r, 300));
            }
          }

          if (!cancelled) {
            if (successCount > 0) onCycleSuccessRef.current?.();
            else onCycleFailureRef.current?.();
          }
        } catch (e) {
          if (!cancelled) onErrorRef.current?.(e);
        } finally {
          endPollingActivity();
        }
      };

      try {
        // Emulator ticks don't touch a real socket, so skip the lock.
        if (isEmulatorEnabled) {
          await runTick();
        } else {
          await runPrinterWriteExclusive(printerId, runTick);
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    // Initial tick after delay to ensure the socket is fully open
    const initialDelay = setTimeout(() => {
      if (!cancelled) tick();
    }, initialDelayMs);

    const id = window.setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
      window.clearInterval(id);
    };
  }, [enabled, printerId, printerIp, printerPort, intervalMs, initialDelayMs, isPaused]);
}
