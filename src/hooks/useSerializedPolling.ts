import { useEffect, useRef } from "react";
import { printerEmulator } from "@/lib/printerEmulator";
import { multiPrinterEmulator } from "@/lib/multiPrinterEmulator";
import { printerTransport, isRelayMode } from "@/lib/printerTransport";

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
  commands: PollingCommand[];
  onError?: (error: unknown) => void;
}) {
  const {
    enabled,
    printerId,
    printerIp,
    printerPort = 23,
    intervalMs = 3000,
    commands,
    onError,
  } = options;

  // Store callbacks in refs to avoid effect re-runs
  const commandsRef = useRef(commands);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    commandsRef.current = commands;
    onErrorRef.current = onError;
  });

  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !printerId) return;

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
      inFlightRef.current = true;

      try {
        const isEmulatorEnabled = multiPrinterEmulator.enabled || printerEmulator.enabled;
        const hasElectronAPI = !!window.electronAPI;
        const relayMode = isRelayMode();

        if (!isEmulatorEnabled && !hasElectronAPI && !relayMode) return;

        // Send each command sequentially to avoid TCP collisions
        for (const cmd of commandsRef.current) {
          if (cancelled) break;

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
              // 8-second timeout per command — if TCP hangs, skip this command
              // and continue with the rest instead of killing all polling forever
              result = await withTimeout(
                printerTransport.sendCommand(printerId, cmd.command),
                8000,
                cmd.command,
              );
            }

            if (cancelled) break;
            if (result.success && typeof result.response === "string") {
              cmd.onResponse(result.response);
            }
          } catch (e) {
            console.error('[useSerializedPolling] Error on', cmd.command, ':', e);
            // Continue to next command — don't let one failure kill the loop
          }

          // Longer gap between commands to let the printer fully process & respond
          if (!isEmulatorEnabled && !cancelled) {
            await new Promise(r => setTimeout(r, 300));
          }
        }
      } catch (e) {
        if (!cancelled) onErrorRef.current?.(e);
      } finally {
        inFlightRef.current = false;
      }
    };

    // Initial tick after delay to ensure the socket is fully open
    const initialDelay = setTimeout(() => {
      if (!cancelled) tick();
    }, 1500);

    const id = window.setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
      window.clearInterval(id);
    };
  }, [enabled, printerId, printerIp, printerPort, intervalMs]);
}
