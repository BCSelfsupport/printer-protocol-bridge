import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Printer, PrinterStatus, PrinterMetrics, PrintMessage, PrintSettings, ConnectionState } from '@/types/printer';
import { usePrinterStorage } from '@/hooks/usePrinterStorage';
import { supabase } from '@/integrations/supabase/client';
import '@/types/electron.d.ts';
import { parseStatusResponse, parseTemperatureResponse, parseVersionResponse, parseErrorListResponse, ErrorListResult } from '@/lib/printerProtocol';
import { parseGmResponse, parseLfResponse, buildMessageDetails } from '@/lib/messageProtocol';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';
import { getProtocolFieldInfo } from '@/lib/autoCodeProtocol';
import { generateDataMatrixCommands, isDataMatrixField, extractDataMatrixData, generateDataMatrixBitmap } from '@/lib/dataMatrixGenerator';
import { parsePumpHours, parsePowerHours } from '@/lib/filterTracker';
import { useServiceStatusPolling } from '@/hooks/useServiceStatusPolling';
import { useSerializedPolling, PollingCommand } from '@/hooks/useSerializedPolling';
import { toast } from 'sonner';
import { printerEmulator } from '@/lib/printerEmulator';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import { printerTransport, isRelayMode } from '@/lib/printerTransport';
import { setPollingPaused, isPollingPaused } from '@/lib/pollingPause';
import type { PrinterFault } from '@/components/alerts/FaultAlertDialog';

/**
 * Parse printer ^SD date/time response into a local Date.
 * Handles ISO strings (may lack timezone → force local), and common formats like "MM/DD/YYYY HH:MM:SS".
 */
function parsePrinterDateTime(raw: string): Date | null {
  if (!raw) return null;
  
  // If it looks like an ISO string without timezone suffix, parse components as local time
  // e.g. "2026-03-09T14:19:04" — new Date() would treat this as local in most browsers,
  // but "2026-03-09" alone is treated as UTC. Force local for safety.
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (isoMatch) {
    const [, y, mo, d, h, mi, s] = isoMatch;
    // If it ends with 'Z' or has +/- offset, let native parser handle it
    if (/[Zz]$/.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw)) {
      return new Date(raw);
    }
    // No timezone info — treat as local
    return new Date(+y, +mo - 1, +d, +h, +mi, +s);
  }

  // Common printer format: "MM/DD/YYYY HH:MM:SS" or "M/D/YYYY H:MM:SS"
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (usMatch) {
    const [, mo, d, y, h, mi, s] = usMatch;
    return new Date(+y, +mo - 1, +d, +h, +mi, +s);
  }

  // Fallback: native parser
  const fallback = new Date(raw);
  return isNaN(fallback.getTime()) ? null : fallback;
}

const defaultSettings: PrintSettings = {
  width: 15,
  height: 8,
  delay: 100,
  rotation: 'Normal',
  bold: 0,
  speed: 'Fastest',
  gap: 0,
  pitch: 0,
  repeatAmount: 0,
};

const mockMessages: PrintMessage[] = [];

const mockStatus: PrinterStatus = {
  printOn: true,
  makeupGood: true,
  inkFull: true,
  isRunning: false,
  jetRunning: false,
  productCount: 0,
  printCount: 0,
  customCounters: [0, 0, 0, 0], // Custom counters 1-4
  currentMessage: null,
  errorMessage: null,
  printerVersion: null,
  printerModel: null,
  printerVariant: null,
  printerTime: new Date(),
  inkLevel: 'UNKNOWN',
  makeupLevel: 'UNKNOWN',
};

const mockMetrics: PrinterMetrics = {
  powerHours: '2163:07',
  streamHours: '97:08',
  modulation: 110,
  viscosity: 0.00,
  charge: 75,
  pressure: 0,
  rps: 0.00,
  phaseQual: 0,
  hvDeflection: false,
  inkLevel: 'FULL',
  makeupLevel: 'GOOD',
  printStatus: 'Not ready',
  allowErrors: true,
  errorActive: false,
  printheadTemp: 24.71,
  electronicsTemp: 30.78,
  subsystems: {
    v300up: false,
    vltOn: false,
    gutOn: false,
    modOn: false,
  },
};

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

// Helper to check if emulator should be used
const shouldUseEmulator = () => printerEmulator.enabled || multiPrinterEmulator.enabled;

// Track recently deleted message names so ^LM polling doesn't resurrect them
const recentlyDeletedMessages = new Set<string>();
const DELETION_GUARD_MS = 20000; // ignore deleted names for 20 seconds (polling cycle can take 10s+)
const DELETE_VERIFY_RETRIES = 3;

// Track recently added message names so ^LM polling doesn't remove them before printer persists
const recentlyAddedMessages = new Set<string>();
const ADDITION_GUARD_MS = 15000;
const DELETE_VERIFY_DELAY_MS = 250;
const RESERVED_PRINTER_MESSAGES = new Set(['BESTCODE', 'BESTCODE AUTO', 'BESTCODE_AUTO']);
// ^SV flushes the firmware's queued message writes/deletes to NOR filesystem.
// Without this, ^DM and ^NM changes are only queued in RAM until a manual save
// or shutdown occurs on the printer HMI.
const FLUSH_COMMAND = '^SV';

const isProtocolCommandFailure = (rawResponse?: string): boolean => {
  if (!rawResponse) return false;
  const upper = rawResponse.toUpperCase();
  return /\?\s*\d+\s*:/.test(upper)
    || /COMMAND\s+FAILED/.test(upper)
    || /\bERROR\b/.test(upper)
    || /\bERR\s*\[\s*[1-9]\d*\s*\]/.test(upper)  // ERR[0] means zero errors — not a failure
    || /\bFAILED\b/.test(upper)
    || /\bCANNOT\b/.test(upper);
};

const parseLmMessageNames = (raw: string): string[] => {
  const lines = raw.split(/[\r\n]+/).filter(Boolean);
  const messageNames: string[] = [];

  for (const line of lines) {
    const trimmed = line.replace(/[^\x20-\x7E]/g, '').trim();
    const upper = trimmed.toUpperCase();

    if (!trimmed || trimmed === '//EOL' || trimmed === '>' || trimmed.startsWith('^')
      || upper.includes('COMMAND SUCCESSFUL') || upper.includes('COMMAND FAILED')
      || upper.startsWith('MESSAGES (')
      || upper.includes('PRODUCT:') || upper.includes('PRINT:') || upper.includes('CUSTOM1:')
      || /\bMOD\s*\[/i.test(trimmed) || /\bINK\s*:/i.test(trimmed)
      || /\bV300UP/i.test(trimmed) || /\bVLT_ON/i.test(trimmed)
      || /\bGUT_ON/i.test(trimmed) || /\bMOD_ON/i.test(trimmed)
      || /\bCHG\s*\[/i.test(trimmed) || /\bPRS\s*\[/i.test(trimmed)
      || /\bRPS\s*\[/i.test(trimmed) || /\bHVD\s*\[/i.test(trimmed)
      || /\bVIS\s*\[/i.test(trimmed) || /\bPHQ\s*\[/i.test(trimmed)
      || /\bERR\s*\[/i.test(trimmed)
      || upper === 'SUCCESS' || upper === 'OK') {
      continue;
    }

    const cleanName = trimmed.replace(/\s*\(current\)\s*/gi, '').replace(/^\d+\.\s*/, '').trim().toUpperCase();
    if (cleanName) messageNames.push(cleanName);
  }

  return messageNames;
};

// Resolve the correct emulator instance for a given printer IP.
// Always prefers the multi-printer instance; only falls back to singleton if no match.
const getEmulatorForPrinter = (ipAddress?: string, port?: number) => {
  if (multiPrinterEmulator.enabled && ipAddress) {
    const instance = multiPrinterEmulator.getInstanceByIp(ipAddress, port);
    if (instance) return instance;
  }
  return printerEmulator;
};

export function usePrinterConnection() {
  const { printers, addPrinter, removePrinter, updatePrinterStatus, updatePrinter, setPrinters } = usePrinterStorage();
  const [isChecking, setIsChecking] = useState(false);
  // Now using ICMP ping instead of TCP, so safe to enable by default
  const [availabilityPollingEnabled, setAvailabilityPollingEnabled] = useState(true);
  // Hysteresis: track consecutive offline counts per printer to prevent flapping
  const offlineCountsRef = useRef<Record<number, number>>({});
  // Persistent ^LE empty overrides — prevents ^SU from downgrading EMPTY back to LOW
  const leEmptyOverridesRef = useRef<{ inkEmpty: boolean; makeupEmpty: boolean }>({ inkEmpty: false, makeupEmpty: false });
  // Active fault codes from ^LE for the FaultAlertDialog
  const [activeFaults, setActiveFaults] = useState<PrinterFault[]>([]);
  // Ref to avoid re-creating checkPrinterStatus when printers array changes
  const printersRef = useRef(printers);
  printersRef.current = printers;
  const disconnectRef = useRef<() => void>(() => {});
  // Ref for connected printer id – used inside checkPrinterStatus to avoid
  // recreating the callback (and resetting the interval) on every connection state change.
  const connectedPrinterIdRef = useRef<number | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    connectedPrinter: null,
    status: null,
    metrics: null,
    settings: defaultSettings,
    messages: [],
  });

  // Keep the ref in sync with the latest connected printer id
  useEffect(() => {
    connectedPrinterIdRef.current = connectionState.connectedPrinter?.id ?? null;
  }, [connectionState.connectedPrinter?.id]);

  // Check printer availability - uses Electron TCP if available, otherwise cloud function
  const isCheckingRef = useRef(false);
  const checkPrinterStatus = useCallback(async () => {
    if (!availabilityPollingEnabled) return;
    if (isCheckingRef.current || printersRef.current.length === 0) return;

    // Emulator: keep emulated printers stable "online" and reflect consumable/error state.
    if (shouldUseEmulator()) {
      // Multi-printer emulator: update every emulated IP in the list
      if (multiPrinterEmulator.enabled) {
        const hasErrors = (inkLevel?: string, makeupLevel?: string) =>
          inkLevel === 'EMPTY' || makeupLevel === 'EMPTY';

        printersRef.current.forEach((p) => {
          const instance = multiPrinterEmulator.getInstanceByIp(p.ipAddress, p.port);
          if (!instance) return;

          const state = instance.getState();
          const sim = instance.getSimulatedPrinter();

          updatePrinterStatus(p.id, {
            isAvailable: true,
            status: sim.status,
            hasActiveErrors: hasErrors(state?.inkLevel, state?.makeupLevel),
            inkLevel: state?.inkLevel as Printer['inkLevel'],
            makeupLevel: state?.makeupLevel as Printer['makeupLevel'],
            currentMessage: state?.currentMessage,
            printCount: state?.printCount,
          });
        });

        return;
      }

      // Single emulator (back-compat): keep Printer 1 online
      const sim = printerEmulator.getSimulatedPrinter();
      if (sim) {
        const state = printerEmulator.getState();
        const hasActiveErrors =
          state.inkLevel === 'EMPTY' ||
          state.makeupLevel === 'EMPTY';

        updatePrinterStatus(sim.id, {
          isAvailable: true,
          status: sim.status,
          hasActiveErrors,
        });
      }
      return;
    }
    
    isCheckingRef.current = true;
    setIsChecking(true);
    try {
      // Exclude the connected printer from availability polling to prevent status
      // oscillation when the cloud function can't reach local-network printers.
      // The connected printer's status is already maintained by ^SU polling.
      const connectedId = connectedPrinterIdRef.current;
      const printerData = printersRef.current
        .filter((p) => p.id !== connectedId)
        .map((p) => ({
          id: p.id,
          ipAddress: p.ipAddress,
          port: p.port,
        }));

        if (printerData.length === 0) return;

      let results;

      if (isElectron && window.electronAPI) {
        // Use Electron's native ICMP ping — NEVER open TCP to port 23 in background.
        // Model 88 and similar printers only support 1 Telnet session; any ephemeral
        // TCP connection to port 23 will steal the slot and cause ETIMEDOUT on the
        // main persistent connection.
        results = await window.electronAPI.printer.checkStatus(printerData);
      } else if (isRelayMode()) {
        results = await printerTransport.checkStatus(printerData);
      } else {
        console.debug('[availability] No local transport available, skipping cloud poll');
        return;
      }

      if (results) {
        const currentConnectedId = connectedPrinterIdRef.current;

        results.forEach((status: { id: number; isAvailable: boolean; status: string }) => {
          const isConnectedPrinter = currentConnectedId === status.id;

          const OFFLINE_THRESHOLD = 3;
          if (status.isAvailable) {
            offlineCountsRef.current[status.id] = 0;
            // For ping results, just mark available — real status comes from ^SU polling
            const existingPrinter = printersRef.current.find(p => p.id === status.id);
            updatePrinterStatus(status.id, {
              isAvailable: true,
              status: existingPrinter?.status ?? 'not_ready',
              hasActiveErrors: existingPrinter?.hasActiveErrors ?? false,
              inkLevel: existingPrinter?.inkLevel,
              makeupLevel: existingPrinter?.makeupLevel,
              currentMessage: existingPrinter?.currentMessage,
            });
          } else {
            const count = (offlineCountsRef.current[status.id] || 0) + 1;
            offlineCountsRef.current[status.id] = count;
            if (count >= OFFLINE_THRESHOLD) {
              updatePrinterStatus(status.id, {
                isAvailable: false,
                status: 'offline',
                hasActiveErrors: false,
              });
              if (isConnectedPrinter) {
                console.log('[availability] Connected printer went offline, auto-disconnecting');
                disconnectRef.current();
              }
            }
          }
        });
        // NOTE: No ephemeral ^SU queries here. Status details (ink, makeup, messages)
        // are populated only by the persistent-socket polling loop when connected.
        // This prevents ANY background TCP connection from competing with the main socket.
      }
    } catch (err) {
      console.error('Failed to check printer status:', err);
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, [availabilityPollingEnabled, updatePrinterStatus]);

  // Poll printer availability (ICMP ping only) every 8 seconds.
  // Slower than before because we're only checking reachability now —
  // no ^SU queries, so no risk of stealing the printer's Telnet session.
  useEffect(() => {
    if (!availabilityPollingEnabled) return;
    if (printersRef.current.length === 0) return;
    
    checkPrinterStatus();
    const interval = setInterval(checkPrinterStatus, 8000);
    return () => clearInterval(interval);
  }, [availabilityPollingEnabled, checkPrinterStatus]);

  const markAllNotReady = useCallback(() => {
    // Also pause polling so the status sticks
    setAvailabilityPollingEnabled(false);
    printers.forEach((p) => {
      updatePrinterStatus(p.id, {
        isAvailable: false,
        status: 'not_ready',
        hasActiveErrors: false,
      });
    });
  }, [printers, updatePrinterStatus]);

  // Polling is now always-on when connected — not gated by screen visibility.
  // setServiceScreenOpen / setControlScreenOpen kept as no-ops for API compatibility.
  const connectedPrinterId = connectionState.connectedPrinter?.id ?? null;
  const setServiceScreenOpen = (_: boolean) => {};
  const setControlScreenOpen = (_: boolean) => {};

  // Quick-status polling: ephemeral TCP connect → ^SU → disconnect for reachable,
  // non-connected printers. Runs every 15s to populate ink/makeup/message/count
  // on the printer cards without requiring a full connection.
  const quickStatusInProgressRef = useRef(false);
  const quickStatusPoll = useCallback(async () => {
    if (quickStatusInProgressRef.current) return;
    if (shouldUseEmulator()) return;
    if (isPollingPaused()) return;

    const connectedId = connectedPrinterIdRef.current;
    const targets = printersRef.current.filter(
      (p) => p.isAvailable && p.id !== connectedId
    );
    if (targets.length === 0) return;

    quickStatusInProgressRef.current = true;
    try {
      const results = await printerTransport.quickStatus(
        targets.map((p) => ({ id: p.id, ipAddress: p.ipAddress, port: p.port }))
      );
      if (!results) return;

      results.forEach((r: any) => {
        if (!r.ok) return;

        // Parse ^SU response
        const suRaw = r.suRaw || r.raw || '';
        const parsed = parseStatusResponse(suRaw);
        if (!parsed) return;

        const hvOn = parsed.printStatus === 'Ready';

        // Parse ^LE response for authoritative EMPTY detection
        const leRaw = r.leRaw || '';
        const leResult = parseErrorListResponse(leRaw);
        const inkEmpty = leResult?.inkEmpty ?? false;
        const makeupEmpty = leResult?.makeupEmpty ?? false;

        const inkLevel = (inkEmpty ? 'EMPTY' : (parsed.inkLevel?.toUpperCase() ?? 'UNKNOWN')) as Printer['inkLevel'];
        const makeupLevel = (makeupEmpty ? 'EMPTY' : (parsed.makeupLevel?.toUpperCase() ?? 'UNKNOWN')) as Printer['makeupLevel'];

        // Parse ^SM response for current message name
        // ^SM response format: "^SM\r\nMESSAGE_NAME\r\nSuccess\r\n>"
        const smRaw = r.smRaw || '';
        let currentMessage: string | undefined;
        const smLines = smRaw.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l && l !== '^SM' && !/^success$/i.test(l) && l !== '>');
        if (smLines.length > 0) {
          let msgName = smLines[0].replace(/[^\x20-\x7E]/g, '').trim();
          // Strip echo-on prefix: "Selected Message: NAME" or "Message: NAME"
          msgName = msgName.replace(/^(Selected\s+)?Message\s*:\s*/i, '').trim();
          if (msgName && msgName !== 'NONE') {
            currentMessage = msgName.toUpperCase();
          }
        }

        // Detect active errors from ^LE
        const hasErrors = (leResult?.errors?.length ?? 0) > 0;

        // Parse print count from ^SU PRINT: field
        const printCountMatch = suRaw.match(/PRINT\s*:\s*(\d+)/i);
        const printCount = printCountMatch ? parseInt(printCountMatch[1], 10) : undefined;

        updatePrinterStatus(r.id, {
          isAvailable: true,
          status: hvOn ? 'ready' : 'not_ready',
          hasActiveErrors: hasErrors,
          inkLevel,
          makeupLevel,
          ...(currentMessage !== undefined ? { currentMessage } : {}),
          ...(printCount !== undefined ? { printCount } : {}),
        });
      });
    } catch (err) {
      console.error('[quick-status] Poll failed:', err);
    } finally {
      quickStatusInProgressRef.current = false;
    }
  }, [updatePrinterStatus]);

  useEffect(() => {
    if (!availabilityPollingEnabled) return;
    if (shouldUseEmulator()) return;

    const initialTimer = setTimeout(quickStatusPoll, 5000);
    const interval = setInterval(quickStatusPoll, 15000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [availabilityPollingEnabled, quickStatusPoll]);


  // Stable callback for service polling – avoids effect churn
  const handleServiceResponse = useCallback((raw: string) => {
    console.log('[handleServiceResponse] Got raw response, length:', raw.length);
    console.log('[handleServiceResponse] Raw response:', raw.substring(0, 500));
    const parsed = parseStatusResponse(raw);
    if (!parsed) {
      console.log('[handleServiceResponse] Failed to parse response');
      return;
    }

    // Use the printer's own Print Status field (parsed as printStatus) as the authoritative
    // ready indicator. HVDeflection alone is unreliable — it can be 1 even when the jet is off.
    const hvOn = parsed.printStatus === 'Ready';
    // Jet running is determined by VLT_ON subsystem flag (jet active even if HV is off)
    const jetActive = parsed.subsystems?.vltOn || hvOn;
    console.log('[handleServiceResponse] Parsed ready state (printStatus):', parsed.printStatus, '-> hvOn:', hvOn, 'jetActive:', jetActive);

    // Apply ^LE empty overrides so printer card also shows EMPTY, not LOW
    const leOverrides = leEmptyOverridesRef.current;
    const parsedInk = parsed.inkLevel?.toUpperCase();
    const parsedMakeup = parsed.makeupLevel?.toUpperCase();
    // Preserve last-known levels if parsing returned UNKNOWN (firmware may not include INK/MAKEUP in ^SU)
    const inkLevelCard = (leOverrides.inkEmpty ? 'EMPTY' : (parsedInk && parsedInk !== 'UNKNOWN' ? parsedInk : undefined)) as Printer['inkLevel'] | undefined;
    const makeupLevelCard = (leOverrides.makeupEmpty ? 'EMPTY' : (parsedMakeup && parsedMakeup !== 'UNKNOWN' ? parsedMakeup : undefined)) as Printer['makeupLevel'] | undefined;
    // Do NOT extract currentMessage from ^SU — it's unreliable. ^SM is the authoritative source.
    // Extract print count from raw ^SU so the printer card stays up-to-date
    const printCountMatch = raw.match(/PRINT\s*:\s*(\d+)/i) || raw.match(/PrC\[(\d+)\]/);
    const suPrintCount = printCountMatch ? parseInt(printCountMatch[1], 10) : undefined;

    if (connectedPrinterId) {
      updatePrinterStatus(connectedPrinterId, {
        isAvailable: true,
        status: hvOn ? 'ready' : 'not_ready',
        // DO NOT set hasActiveErrors from ^SU errorActive here — ^LE is the sole
        // authoritative source for hasActiveErrors. Some firmware (e.g. Quantum X)
        // returns Err[1] in ^SU even after faults are cleared, causing false WARNING
        // badges. The errorActive flag is still stored in metrics for display purposes.
        ...(inkLevelCard ? { inkLevel: inkLevelCard } : {}),
        ...(makeupLevelCard ? { makeupLevel: makeupLevelCard } : {}),
        // Do NOT set printCount from ^SU — ^CN is the authoritative source to avoid flipping
      });
    }

    setConnectionState((prev) => {
      const previous = prev.metrics ?? mockMetrics;

      console.log('[handleServiceResponse] Updating state, previous isRunning:', prev.status?.isRunning, '-> new:', hvOn);

      // Map parsed levels to status-compatible types
      // Apply ^LE empty overrides so ^SU can never downgrade EMPTY back to LOW
      // Preserve last-known levels if parsing returned UNKNOWN (firmware may not include INK/MAKEUP in ^SU)
      const leOverrides = leEmptyOverridesRef.current;
      const parsedInk2 = parsed.inkLevel?.toUpperCase();
      const parsedMakeup2 = parsed.makeupLevel?.toUpperCase();
      const inkLevel = (leOverrides.inkEmpty ? 'EMPTY' : (parsedInk2 && parsedInk2 !== 'UNKNOWN' ? parsedInk2 : prev.status?.inkLevel ?? 'UNKNOWN')) as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN';
      const makeupLevel = (leOverrides.makeupEmpty ? 'EMPTY' : (parsedMakeup2 && parsedMakeup2 !== 'UNKNOWN' ? parsedMakeup2 : prev.status?.makeupLevel ?? 'UNKNOWN')) as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN';

      return {
        ...prev,
        // Update isRunning and consumable levels based on ^SU response
        // currentMessage is NOT set here — ^SM is the authoritative source
        status: prev.status 
          ? { ...prev.status, isRunning: hvOn, jetRunning: jetActive, inkLevel, makeupLevel } 
          : { ...mockStatus, isRunning: hvOn, jetRunning: jetActive, inkLevel, makeupLevel, productCount: 0, printCount: 0, customCounters: [0, 0, 0, 0] },
        metrics: {
          ...previous,
          modulation: parsed.modulation ?? previous.modulation,
          charge: parsed.charge ?? previous.charge,
          pressure: parsed.pressure ?? previous.pressure,
          rps: parsed.rps ?? previous.rps,
          phaseQual: parsed.phaseQual ?? previous.phaseQual,
          hvDeflection: parsed.hvDeflection ?? previous.hvDeflection,
          viscosity: parsed.viscosity ?? previous.viscosity,
          inkLevel: parsed.inkLevel ?? previous.inkLevel,
          makeupLevel: parsed.makeupLevel ?? previous.makeupLevel,
          printStatus: parsed.printStatus ?? previous.printStatus,
          allowErrors: parsed.allowErrors ?? previous.allowErrors,
          errorActive: parsed.errorActive ?? previous.errorActive,
          subsystems: parsed.subsystems ?? previous.subsystems,
          // Preserve powerHours/streamHours from ^TM handler — ^SU doesn't provide them
          powerHours: previous.powerHours,
          streamHours: previous.streamHours,
        },
      };
    });
  }, [connectedPrinterId, updatePrinterStatus]);

  // Stable callback for ^SD (date/time) polling
  const handleDateTimeResponse = useCallback((raw: string) => {
    const cleaned = raw.replace(/[^\x20-\x7E]/g, '').trim();
    if (!cleaned) return;
    const parsed = parsePrinterDateTime(cleaned);
    if (parsed && !isNaN(parsed.getTime())) {
      const offsetMs = parsed.getTime() - Date.now();
      console.log(`[^SD] raw="${cleaned}" parsed=${parsed.toISOString()} local=${new Date().toISOString()} offsetMs=${offsetMs}`);
      setConnectionState((prev) => ({
        ...prev,
        status: prev.status ? { ...prev.status, printerTime: parsed } : null,
      }));
    } else {
      console.warn(`[^SD] Failed to parse: "${cleaned}"`);
    }
  }, []);

  // Stable callback for ^TP (temperature) polling
  const handleTemperatureResponse = useCallback((raw: string) => {
    const parsed = parseTemperatureResponse(raw);
    if (!parsed) return;
    setConnectionState((prev) => ({
      ...prev,
      metrics: prev.metrics ? {
        ...prev.metrics,
        printheadTemp: parsed.printheadTemp,
        electronicsTemp: parsed.electronicsTemp,
      } : null,
    }));
  }, []);

  // Stable callback for ^VV (version) polling – extracts firmware version, model, and variant
  const handleVersionResponse = useCallback((raw: string) => {
    console.log('[handleVersionResponse] raw ^VV:', raw);
    const { version, model, variant } = parseVersionResponse(raw);
    console.log('[handleVersionResponse] parsed:', { version, model, variant });
    if (!version && !model) return;
    setConnectionState((prev) => ({
      ...prev,
      status: prev.status ? {
        ...prev.status,
        ...(version ? { printerVersion: version } : {}),
        ...(model ? { printerModel: model } : {}),
        ...(variant ? { printerVariant: variant } : {}),
      } : null,
    }));
  }, []);


  const handleCounterResponse = useCallback((raw: string) => {
    console.log('[handleCounterResponse] RAW ^CN response:', JSON.stringify(raw));
    
    // Strip command echo (^CN), "Success", prompt (>), and non-printable chars
    // Real printers echo the command back, e.g. "^CN\r\n13,13,13,13,13,13\r\nSuccess\r\n>"
    const cleaned = raw
      .split(/[\r\n]+/)
      .map(l => l.trim())
      .filter(l => l && !/^\^CN$/i.test(l) && !/^success$/i.test(l) && l !== '>')
      .join('\n');
    console.log('[handleCounterResponse] Cleaned:', JSON.stringify(cleaned));
    
    let parts: number[] = [];

    if (cleaned.includes('PC[')) {
      const pcMatch = cleaned.match(/PC\[(\d+)\]/);
      const prcMatch = cleaned.match(/PrC\[(\d+)\]/);
      const c1Match = cleaned.match(/C1\[(\d+)\]/);
      const c2Match = cleaned.match(/C2\[(\d+)\]/);
      const c3Match = cleaned.match(/C3\[(\d+)\]/);
      const c4Match = cleaned.match(/C4\[(\d+)\]/);
      parts = [
        pcMatch ? parseInt(pcMatch[1], 10) : 0,
        prcMatch ? parseInt(prcMatch[1], 10) : 0,
        c1Match ? parseInt(c1Match[1], 10) : 0,
        c2Match ? parseInt(c2Match[1], 10) : 0,
        c3Match ? parseInt(c3Match[1], 10) : 0,
        c4Match ? parseInt(c4Match[1], 10) : 0,
      ];
    } else if (cleaned.includes('Product Count:')) {
      const productMatch = cleaned.match(/Product Count:\s*(\d+)/);
      const printMatch = cleaned.match(/Print Count:\s*(\d+)/);
      const c1Match = cleaned.match(/Counter 1:\s*(\d+)/);
      const c2Match = cleaned.match(/Counter 2:\s*(\d+)/);
      const c3Match = cleaned.match(/Counter 3:\s*(\d+)/);
      const c4Match = cleaned.match(/Counter 4:\s*(\d+)/);
      parts = [
        productMatch ? parseInt(productMatch[1], 10) : 0,
        printMatch ? parseInt(printMatch[1], 10) : 0,
        c1Match ? parseInt(c1Match[1], 10) : 0,
        c2Match ? parseInt(c2Match[1], 10) : 0,
        c3Match ? parseInt(c3Match[1], 10) : 0,
        c4Match ? parseInt(c4Match[1], 10) : 0,
      ];
    } else if (cleaned.includes('Product:')) {
      const productMatch = cleaned.match(/Product:(\d+)/);
      const printMatch = cleaned.match(/Print:(\d+)/);
      const custom1Match = cleaned.match(/Custom1:(\d+)/);
      const custom2Match = cleaned.match(/Custom2:(\d+)/);
      const custom3Match = cleaned.match(/Custom3:(\d+)/);
      const custom4Match = cleaned.match(/Custom4:(\d+)/);
      parts = [
        productMatch ? parseInt(productMatch[1], 10) : 0,
        printMatch ? parseInt(printMatch[1], 10) : 0,
        custom1Match ? parseInt(custom1Match[1], 10) : 0,
        custom2Match ? parseInt(custom2Match[1], 10) : 0,
        custom3Match ? parseInt(custom3Match[1], 10) : 0,
        custom4Match ? parseInt(custom4Match[1], 10) : 0,
      ];
    } else {
      parts = cleaned.split(',').map((s: string) => { const n = parseInt(s.trim(), 10); return isNaN(n) ? 0 : n; });
    }

    if (parts.length >= 2) {
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? {
          ...prev.status,
          productCount: parts[0],
          printCount: parts[1],
          customCounters: parts.length >= 6 ? [parts[2], parts[3], parts[4], parts[5]] : prev.status.customCounters,
        } : null,
      }));

      const printerId = connectedPrinterIdRef.current;
      if (printerId != null) {
        updatePrinter(printerId, { printCount: parts[1] });
      }
    }
  }, []);

  // Stable callback for ^LM (List Messages) polling
  const handleMessageListResponse = useCallback((raw: string) => {
    const lines = raw.split(/[\r\n]+/).filter(Boolean);
    const messageNames: string[] = [];
    let detectedCurrentMessage: string | null = null;
    for (const line of lines) {
      const trimmed = line.replace(/[^\x20-\x7E]/g, '').trim();
      const upper = trimmed.toUpperCase();
      if (!trimmed || trimmed === '//EOL' || trimmed === '>' || trimmed.startsWith('^')
          || upper.includes('COMMAND SUCCESSFUL') || upper.includes('COMMAND FAILED')
          || upper.startsWith('MESSAGES (')
          || upper.includes('PRODUCT:') || upper.includes('PRINT:') || upper.includes('CUSTOM1:')
          || /\bMOD\s*\[/i.test(trimmed) || /\bINK\s*:/i.test(trimmed)
          || /\bV300UP/i.test(trimmed) || /\bVLT_ON/i.test(trimmed)
          || /\bGUT_ON/i.test(trimmed) || /\bMOD_ON/i.test(trimmed)
          || /\bCHG\s*\[/i.test(trimmed) || /\bPRS\s*\[/i.test(trimmed)
          || /\bRPS\s*\[/i.test(trimmed) || /\bHVD\s*\[/i.test(trimmed)
          || /\bVIS\s*\[/i.test(trimmed) || /\bPHQ\s*\[/i.test(trimmed)
          || /\bERR\s*\[/i.test(trimmed)
          || upper === 'SUCCESS' || upper === 'OK'
          ) continue;
      const isCurrent = /\(current\)/i.test(trimmed);
      let cleanName = trimmed.replace(/\s*\(current\)\s*/gi, '').replace(/^\d+\.\s*/, '').trim().toUpperCase();
      if (cleanName) {
        messageNames.push(cleanName);
        if (isCurrent) detectedCurrentMessage = cleanName;
      }
    }
    if (messageNames.length > 0) {
      // Filter out recently deleted messages to prevent race with ^DM
      if (recentlyDeletedMessages.size > 0) {
        console.log('[handleMessageListResponse] Active delete guards:', [...recentlyDeletedMessages], '| message names:', messageNames);
      }
      const filteredNames = messageNames.filter(n => !recentlyDeletedMessages.has(n));
      // Merge in recently added messages that the printer hasn't reported yet
      for (const addedName of recentlyAddedMessages) {
        if (!filteredNames.some(n => n.toUpperCase() === addedName.toUpperCase())) {
          filteredNames.push(addedName);
        }
      }
      const printerMessages: PrintMessage[] = filteredNames.map((name, idx) => ({ id: idx + 1, name }));
      console.log('[handleMessageListResponse] Parsed messages:', printerMessages.length, 'current:', detectedCurrentMessage);
      setConnectionState((prev) => ({
        ...prev,
        messages: printerMessages,
        status: detectedCurrentMessage && prev.status
          ? { ...prev.status, currentMessage: detectedCurrentMessage }
          : prev.status,
      }));
      if (detectedCurrentMessage && connectedPrinterIdRef.current) {
        updatePrinter(connectedPrinterIdRef.current, { currentMessage: detectedCurrentMessage });
      }
    }
  }, [updatePrinter]);

  // Stable callback for ^LE (List Errors) – overrides fluid levels when firmware
  // reports numeric "1" (LOW) but the error list confirms tanks are truly EMPTY.
  // Also infers minimum fluid levels from ^LE when ^SU doesn't include them:
  //   - No ink error in ^LE → at least GOOD (if currently UNKNOWN)
  //   - Ink LOW fault in ^LE → LOW
  //   - Ink EMPTY fault in ^LE → EMPTY
  const handleErrorListResponse = useCallback((raw: string) => {
    const parsed = parseErrorListResponse(raw);
    if (!parsed) return;

    // Update the persistent ref so handleServiceResponse can apply overrides
    leEmptyOverridesRef.current = { inkEmpty: parsed.inkEmpty, makeupEmpty: parsed.makeupEmpty };

    // Expose all parsed faults for the FaultAlertDialog
    setActiveFaults(parsed.errors);

    // Determine if there are ANY active errors (not just fluid-empty)
    const hasAnyErrors = parsed.errors.length > 0;

    // Derive fluid levels from error messages
    const hasInkLow = parsed.errors.some(e => /ink/i.test(e.message) && /low/i.test(e.message));
    const hasMakeupLow = parsed.errors.some(e => /makeup/i.test(e.message) && /low/i.test(e.message));

    // Always update state — both when faults appear AND when they clear
    setConnectionState((prev) => {
      const status = prev.status;
      const metrics = prev.metrics;
      if (!status && !metrics) return prev;

      // Determine ink level from ^LE:
      // EMPTY > LOW > (no error → infer GOOD if currently UNKNOWN)
      let inkFromLE: 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | undefined;
      if (parsed.inkEmpty) inkFromLE = 'EMPTY';
      else if (hasInkLow) inkFromLE = 'LOW';
      else if (status && status.inkLevel === 'UNKNOWN') inkFromLE = 'GOOD';

      let makeupFromLE: 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | undefined;
      if (parsed.makeupEmpty) makeupFromLE = 'EMPTY';
      else if (hasMakeupLow) makeupFromLE = 'LOW';
      else if (status && status.makeupLevel === 'UNKNOWN') makeupFromLE = 'GOOD';

      return {
        ...prev,
        status: status ? {
          ...status,
          ...(inkFromLE ? { inkLevel: inkFromLE } : {}),
          ...(makeupFromLE ? { makeupLevel: makeupFromLE } : {}),
        } : null,
        metrics: metrics ? {
          ...metrics,
          ...(inkFromLE ? { inkLevel: inkFromLE } : {}),
          ...(makeupFromLE ? { makeupLevel: makeupFromLE } : {}),
          errorActive: hasAnyErrors,
        } : null,
      };
    });

    // Always sync the printer card — update hasActiveErrors from ^LE (authoritative)
    // Also set fluid levels derived from ^LE when ^SU doesn't provide them
    if (connectedPrinterIdRef.current != null) {
      const updates: Partial<Printer> & { hasActiveErrors: boolean } = {
        hasActiveErrors: hasAnyErrors,
      };
      if (parsed.inkEmpty) updates.inkLevel = 'EMPTY';
      else if (hasInkLow) updates.inkLevel = 'LOW';
      if (parsed.makeupEmpty) updates.makeupLevel = 'EMPTY';
      else if (hasMakeupLow) updates.makeupLevel = 'LOW';
      updatePrinterStatus(connectedPrinterIdRef.current, updates as any);
    }
  }, [updatePrinterStatus]);

  // Grace period: after selecting a message via ^SM, ignore poll ^SM responses
  // for a window so the polling doesn't revert the selection before the
  // printer firmware fully switches. We also store the expected message name
  // so that after grace expires, we only accept a poll response if it matches
  // the expected name (confirming the switch) or we truly get a different name.
  const smSelectGraceUntilRef = useRef<number>(0);
  const smExpectedMessageRef = useRef<string | null>(null);

  // Stable callback for ^SM (Selected Message) — authoritative source for current message name
  const handleSelectedMessageResponse = useCallback((raw: string) => {
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l && l !== '^SM' && !/^success$/i.test(l) && l !== '>');
    if (lines.length === 0) return;
    let msgName = lines[0].replace(/[^\x20-\x7E]/g, '').trim();
    // Strip echo-on prefix: "Selected Message: NAME" or "Message: NAME"
    msgName = msgName.replace(/^(Selected\s+)?Message\s*:\s*/i, '').trim();
    if (!msgName || msgName === 'NONE') return;
    const upperMsg = msgName.toUpperCase();

    // During grace period: only accept if the printer confirms the expected message
    if (Date.now() < smSelectGraceUntilRef.current) {
      if (smExpectedMessageRef.current && upperMsg === smExpectedMessageRef.current) {
        // Printer confirmed the switch — end grace early
        console.log('[handleSelectedMessageResponse] Printer confirmed switch to', upperMsg, '— ending grace');
        smSelectGraceUntilRef.current = 0;
        smExpectedMessageRef.current = null;
      } else {
        console.log('[handleSelectedMessageResponse] Skipping — within grace period, got', upperMsg, 'expected', smExpectedMessageRef.current);
        return;
      }
    } else if (smExpectedMessageRef.current) {
      // Grace just expired — if the poll still returns the OLD message (not our expected),
      // the selection may not have taken effect. Clear expected and accept whatever the printer says.
      console.log('[handleSelectedMessageResponse] Grace expired, accepting', upperMsg);
      smExpectedMessageRef.current = null;
    }

    setConnectionState(prev => ({
      ...prev,
      status: prev.status ? { ...prev.status, currentMessage: upperMsg } : null,
    }));

    const printerId = connectedPrinterIdRef.current;
    if (printerId != null) {
      updatePrinter(printerId, { currentMessage: upperMsg });
    }
  }, [updatePrinter]);

  // Stable callback for ^TM (Runtime) polling — extracts Power Hours and Stream Hours
  const handleRuntimeResponse = useCallback((raw: string) => {
    // Strip non-printable chars, command echo, "Success", prompt
    const sanitized = raw.replace(/[^\x20-\x7E\r\n]/g, '');
    const cleaned = sanitized
      .split(/[\r\n]+/)
      .map(l => l.trim())
      .filter(l => l && !/\^TM/i.test(l) && !/^success$/i.test(l) && l !== '>')
      .join('\n');
    console.log('[handleRuntimeResponse] RAW ^TM:', JSON.stringify(raw.substring(0, 300)));
    console.log('[handleRuntimeResponse] Cleaned ^TM:', JSON.stringify(cleaned));

    // Try the structured parsers first on the full sanitized text (not just cleaned lines)
    let pumpH = parsePumpHours(sanitized);
    let powerH = parsePowerHours(sanitized);
    console.log('[handleRuntimeResponse] Direct parse — power:', powerH, 'stream:', pumpH);

    // Fallback: try to find any HH:MM patterns
    if (pumpH == null && powerH == null) {
      const hourPatterns = sanitized.match(/(\d+):(\d{2})/g);
      if (hourPatterns && hourPatterns.length >= 2) {
        const [pH, pM] = hourPatterns[0].split(':').map(Number);
        const [sH, sM] = hourPatterns[1].split(':').map(Number);
        powerH = pH + (pM / 60);
        pumpH = sH + (sM / 60);
        console.log('[handleRuntimeResponse] Fallback HH:MM parse — power:', powerH, 'stream:', pumpH);
      }
    }

    // Format as HH:MM strings for metrics
    const formatHours = (h: number | null): string | undefined => {
      if (h == null) return undefined;
      const hrs = Math.floor(h);
      const mins = Math.round((h - hrs) * 60);
      return `${hrs}:${mins.toString().padStart(2, '0')}`;
    };

    const streamStr = formatHours(pumpH);
    const powerStr = formatHours(powerH);
    console.log('[handleRuntimeResponse] Result — power:', powerStr, 'stream:', streamStr);

    if (streamStr || powerStr) {
      setConnectionState(prev => ({
        ...prev,
        metrics: prev.metrics ? {
          ...prev.metrics,
          ...(streamStr ? { streamHours: streamStr } : {}),
          ...(powerStr ? { powerHours: powerStr } : {}),
        } : {
          ...mockMetrics,
          ...(streamStr ? { streamHours: streamStr } : {}),
          ...(powerStr ? { powerHours: powerStr } : {}),
        },
      }));
    }
  }, []);


  // Build serialized command list: ^SU, ^LE, ^SM, ^LM, ^CN, ^TP, ^TM, ^SD, ^VV sent sequentially to prevent TCP collisions
  const pollingCommands = useMemo<PollingCommand[]>(() => [
    { command: '^SU', onResponse: handleServiceResponse },
    { command: '^LE', onResponse: handleErrorListResponse },
    { command: '^SM', onResponse: handleSelectedMessageResponse },
    { command: '^LM', onResponse: handleMessageListResponse },
    { command: '^CN', onResponse: handleCounterResponse },
    { command: '^TP', onResponse: handleTemperatureResponse },
    { command: '^TM', onResponse: handleRuntimeResponse },
    { command: '^SD', onResponse: handleDateTimeResponse },
    { command: '^VV', onResponse: handleVersionResponse },
  ], [handleServiceResponse, handleErrorListResponse, handleSelectedMessageResponse, handleMessageListResponse, handleCounterResponse, handleTemperatureResponse, handleRuntimeResponse, handleDateTimeResponse, handleVersionResponse]);

  // Track whether the TCP socket is confirmed open — gates polling to avoid
  // sending commands before the socket is ready (prevents 8s timeout storms).
  const [socketReady, setSocketReady] = useState(false);

  // Reset socketReady immediately when the connected printer changes.
  // This prevents stale polling from firing commands at the old printer's socket
  // before the new socket is established.
  const prevConnectedPrinterIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (connectedPrinterId !== prevConnectedPrinterIdRef.current) {
      if (prevConnectedPrinterIdRef.current !== null) {
        console.log('[usePrinterConnection] Printer switched from', prevConnectedPrinterIdRef.current, 'to', connectedPrinterId, '— resetting socketReady');
        setSocketReady(false);
      }
      prevConnectedPrinterIdRef.current = connectedPrinterId;
    }
  }, [connectedPrinterId]);

  // Stable refs for printer connection details
  const connectedPrinterIpRef = useRef(connectionState.connectedPrinter?.ipAddress);
  const connectedPrinterPortRef = useRef(connectionState.connectedPrinter?.port);
  useEffect(() => {
    connectedPrinterIpRef.current = connectionState.connectedPrinter?.ipAddress;
    connectedPrinterPortRef.current = connectionState.connectedPrinter?.port;
  }, [connectionState.connectedPrinter?.ipAddress, connectionState.connectedPrinter?.port]);

  // Track consecutive polling cycle failures to detect unreachable printers.
  // When a connected printer stops responding (e.g. IP changed, network down),
  // we mark it offline after enough consecutive failed cycles.
  const pollingFailCountRef = useRef(0);
  const POLLING_OFFLINE_THRESHOLD = 5; // 5 failed cycles × 3s = ~15s before offline

  const handlePollingCycleFailure = useCallback(() => {
    pollingFailCountRef.current++;
    console.warn('[usePrinterConnection] Polling cycle failed, count:', pollingFailCountRef.current);
    if (pollingFailCountRef.current >= POLLING_OFFLINE_THRESHOLD && connectedPrinterIdRef.current != null) {
      console.error('[usePrinterConnection] Connected printer unreachable after', POLLING_OFFLINE_THRESHOLD, 'cycles — marking offline');
      updatePrinterStatus(connectedPrinterIdRef.current, {
        isAvailable: false,
        status: 'offline',
        hasActiveErrors: false,
      });
      disconnectRef.current();
    }
  }, [updatePrinterStatus]);

  const handlePollingCycleSuccess = useCallback(() => {
    pollingFailCountRef.current = 0;
  }, []);

  // Single serialized polling loop — sends all commands sequentially on one socket.
  // Active whenever connected AND socketReady (regardless of which screen is open).
  // The pollingCommands include ^SU, ^LM, ^CN, ^TP, ^SD — all the data we need.
  useSerializedPolling({
    enabled: connectionState.isConnected && !!connectedPrinterId && socketReady,
    printerId: connectedPrinterId,
    printerIp: connectionState.connectedPrinter?.ipAddress,
    printerPort: connectionState.connectedPrinter?.port,
    intervalMs: 3000,
    initialDelayMs: 250,
    commands: pollingCommands,
    onCycleFailure: handlePollingCycleFailure,
    onCycleSuccess: handlePollingCycleSuccess,
  });

  // Track whether this connection has ever succeeded (used to decide delay on reconnect)
  const hasEverConnected = useRef(false);
  // Guard: only one connect attempt at a time
  const connectingRef = useRef(false);
  // Retry ticker — incremented after a failed connect to re-trigger the effect after delay
  const [retryTick, setRetryTick] = useState(0);

  // Listen for printer:connection-lost from Electron — clear socketReady immediately.
  // Registered once only via ref guard — IPC listeners accumulate without cleanup.
  const connectionLostListenerRegistered = useRef(false);
  useEffect(() => {
    if (!window.electronAPI?.onPrinterConnectionLost) return;
    if (connectionLostListenerRegistered.current) return;
    connectionLostListenerRegistered.current = true;
    window.electronAPI.onPrinterConnectionLost(({ printerId: lostId }: { printerId: number }) => {
      if (lostId === connectedPrinterIdRef.current) {
        console.log('[usePrinterConnection] printer:connection-lost — clearing socketReady');
        setSocketReady(false);
        // Bump retryTick after 15s so the reconnect effect fires once the printer has
        // had time to release its single Telnet session.
        setTimeout(() => setRetryTick(t => t + 1), 15000);
      }
    });
  }, []);

  // SINGLE unified socket lifecycle + reconnect effect.
  // - First attempt: fires immediately (no delay).
  // - Reconnect after drop: triggered by retryTick (set 15s after connection-lost event).
  // - Only ONE effect, ONE connect path — no racing between lifecycle and watchdog.
  useEffect(() => {
    if (!isElectron && !isRelayMode()) return;
    if (!connectionState.isConnected || !connectedPrinterId) return;
    if (socketReady) return; // Already healthy — nothing to do
    if (connectingRef.current) {
      console.log('[socket] Connect already in-flight, skipping');
      return;
    }

    connectingRef.current = true;

    // First-ever connect: try immediately (delay=0).
    // After a drop: retryTick is bumped 15s post-connection-lost, so by the time this
    // effect fires the printer will have released its session.
    const delay = hasEverConnected.current ? 0 : 0;
    console.log(`[socket] ${hasEverConnected.current ? 'Reconnect' : 'Initial connect'} in ${delay / 1000}s for printer ${connectedPrinterId} (retryTick=${retryTick})`);

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) { connectingRef.current = false; return; }
      const printerIp = connectedPrinterIpRef.current;
      const printerPort = connectedPrinterPortRef.current ?? 23;
      if (!printerIp) { connectingRef.current = false; return; }

      try {
        console.log(`[socket] Connecting to ${printerIp}:${printerPort}`);
        const result = await printerTransport.connect({ id: connectedPrinterId, ipAddress: printerIp, port: printerPort });
        console.log('[socket] Connect result:', result);
        if (!cancelled) {
          if (result.success) {
            hasEverConnected.current = true;
            setSocketReady(true);
            console.log('[socket] Ready — polling will start');
          } else {
            console.warn('[socket] Connect failed:', result.error, '— will retry in 15s');
            // Schedule a retry via retryTick — gives the printer time to release its session
            setTimeout(() => { if (!cancelled) setRetryTick(t => t + 1); }, 15000);
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[socket] Connect error:', e);
          setTimeout(() => setRetryTick(t => t + 1), 15000);
        }
      } finally {
        if (!cancelled) connectingRef.current = false;
      }
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      connectingRef.current = false;
    };
  }, [connectionState.isConnected, connectedPrinterId, socketReady, retryTick]);


  // Query printer status (^SU) and update state - used on connect and after commands
  const queryPrinterStatus = useCallback(async (printer: Printer) => {
    if (!isElectron && !isRelayMode()) return;
    
    try {
      // Use the existing persistent socket — do NOT call connect() here
      // as that would open a second connection and ETIMEDOUT the main one.
      const result = await printerTransport.sendCommand(printer.id, '^SU');
      console.log('[queryPrinterStatus] ^SU response:', result);
      
      if (result.success && result.response) {
        const parsed = parseStatusResponse(result.response);
        if (parsed) {
          // Use printStatus (which considers PRINT: flag, HvD[], and Print Status: line)
          // for consistency with the main polling handler
          const hvOn = parsed.printStatus === 'Ready';
          
          const inkLevelQ = (parsed.inkLevel?.toUpperCase() ?? 'UNKNOWN') as Printer['inkLevel'];
          const makeupLevelQ = (parsed.makeupLevel?.toUpperCase() ?? 'UNKNOWN') as Printer['makeupLevel'];
          // Update the printer list status so Networking Config Screen reflects real state
          updatePrinterStatus(printer.id, {
            isAvailable: true,
            status: hvOn ? 'ready' : 'not_ready',
            // Also set hasActiveErrors from ^SU errorActive — catches beacon warnings
            hasActiveErrors: parsed.errorActive,
            inkLevel: inkLevelQ,
            makeupLevel: makeupLevelQ,
          });
          
          // Map parsed levels to status-compatible types
          const inkLevel = (parsed.inkLevel?.toUpperCase() ?? 'UNKNOWN') as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN';
          const makeupLevel = (parsed.makeupLevel?.toUpperCase() ?? 'UNKNOWN') as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN';
          
          setConnectionState((prev) => ({
            ...prev,
            status: prev.status 
              ? { ...prev.status, isRunning: hvOn, jetRunning: parsed.subsystems?.vltOn || hvOn, inkLevel, makeupLevel } 
              : null,
            metrics: prev.metrics ? {
              ...prev.metrics,
              modulation: parsed.modulation ?? prev.metrics.modulation,
              charge: parsed.charge ?? prev.metrics.charge,
              pressure: parsed.pressure ?? prev.metrics.pressure,
              rps: parsed.rps ?? prev.metrics.rps,
              phaseQual: parsed.phaseQual ?? prev.metrics.phaseQual,
              hvDeflection: parsed.hvDeflection ?? prev.metrics.hvDeflection,
              viscosity: parsed.viscosity ?? prev.metrics.viscosity,
              inkLevel: parsed.inkLevel ?? prev.metrics.inkLevel,
              makeupLevel: parsed.makeupLevel ?? prev.metrics.makeupLevel,
              printStatus: parsed.printStatus ?? prev.metrics.printStatus,
              allowErrors: parsed.allowErrors ?? prev.metrics.allowErrors,
              errorActive: parsed.errorActive ?? prev.metrics.errorActive,
              subsystems: parsed.subsystems ?? prev.metrics.subsystems,
            } : null,
          }));
        }
      }

      // Also query printer date/time via ^SD
      try {
        const sdResult = await printerTransport.sendCommand(printer.id, '^SD');
        console.log('[queryPrinterStatus] ^SD response:', sdResult);
        if (sdResult.success && sdResult.response) {
          const raw = sdResult.response.replace(/[^\x20-\x7E]/g, '').trim();
          // Try to parse the date/time string from the printer
          const parsed_dt = parsePrinterDateTime(raw);
          if (parsed_dt && !isNaN(parsed_dt.getTime())) {
            setConnectionState((prev) => ({
              ...prev,
              status: prev.status ? { ...prev.status, printerTime: parsed_dt } : null,
            }));
          }
        }
      } catch (e2) {
        console.error('[queryPrinterStatus] Failed to query ^SD:', e2);
      }
    } catch (e) {
      console.error('[queryPrinterStatus] Failed to query status:', e);
    }
  }, [updatePrinterStatus]);

  // Query message list from printer via ^LM command
  // Also detects the currently selected message from the "(current)" marker in echo-on mode
  // or numbered list format "1. MSGNAME (current)"
  const queryMessageList = useCallback(async (printer: Printer) => {
    if (!isElectron && !isRelayMode()) return;
    try {
      const result = await printerTransport.sendCommand(printer.id, '^LM');
      console.log('[queryMessageList] ^LM response:', result);
      if (result.success && result.response) {
        const lines = result.response.split(/[\r\n]+/).filter(Boolean);
        const messageNames: string[] = [];
        let detectedCurrentMessage: string | null = null;
        for (const line of lines) {
          // Strip non-printable / control characters (garbage bytes from firmware)
          const trimmed = line.replace(/[^\x20-\x7E]/g, '').trim();
          // Skip EOL marker, prompts, command echoes, status lines, and echo responses
          const upper = trimmed.toUpperCase();
          if (!trimmed || trimmed === '//EOL' || trimmed === '>' || trimmed.startsWith('^')
              || upper.includes('COMMAND SUCCESSFUL') || upper.includes('COMMAND FAILED')
              || upper.startsWith('MESSAGES (')
              // Skip counter data lines that may leak from ^CN responses
              || upper.includes('PRODUCT:') || upper.includes('PRINT:') || upper.includes('CUSTOM1:')
              // Skip ^SU status data that leaks into TCP stream
              || /\bMOD\s*\[/i.test(trimmed)
              || /\bINK\s*:/i.test(trimmed)
              || /\bV300UP/i.test(trimmed)
              || /\bVLT_ON/i.test(trimmed)
              || /\bGUT_ON/i.test(trimmed)
              || /\bMOD_ON/i.test(trimmed)
              || /\bCHG\s*\[/i.test(trimmed)
              || /\bPRS\s*\[/i.test(trimmed)
              || /\bRPS\s*\[/i.test(trimmed)
              || /\bHVD\s*\[/i.test(trimmed)
              || /\bVIS\s*\[/i.test(trimmed)
              || /\bPHQ\s*\[/i.test(trimmed)
              || /\bERR\s*\[/i.test(trimmed)
              || upper === 'SUCCESS'
              || upper === 'OK'
              ) continue;
          
          // Check for "(current)" marker — indicates the currently selected message
          const isCurrent = /\(current\)/i.test(trimmed);
          // Strip the "(current)" marker and any leading numbering (e.g. "1. ")
          let cleanName = trimmed.replace(/\s*\(current\)\s*/gi, '').replace(/^\d+\.\s*/, '').trim().toUpperCase();
          
          if (cleanName) {
            messageNames.push(cleanName);
            if (isCurrent) {
              detectedCurrentMessage = cleanName;
            }
          }
        }
        if (messageNames.length > 0) {
          // Merge in recently added messages that the printer hasn't reported yet
          for (const addedName of recentlyAddedMessages) {
            if (!messageNames.some(n => n.toUpperCase() === addedName.toUpperCase())) {
              messageNames.push(addedName);
            }
          }
          const printerMessages: PrintMessage[] = messageNames.map((name, idx) => ({
            id: idx + 1,
            name,
          }));
          console.log('[queryMessageList] Parsed messages:', printerMessages, 'current:', detectedCurrentMessage);
          setConnectionState((prev) => ({
            ...prev,
            messages: printerMessages,
            // Update currentMessage if we detected one from ^LM
            status: detectedCurrentMessage && prev.status
              ? { ...prev.status, currentMessage: detectedCurrentMessage }
              : prev.status,
          }));
          // Also update the printer card in the network list
          if (detectedCurrentMessage) {
            updatePrinter(printer.id, { currentMessage: detectedCurrentMessage });
          }
        }
      }
    } catch (e) {
      console.error('[queryMessageList] Failed to query ^LM:', e);
    }
  }, [updatePrinter]);

  // Re-query message list when a polling screen opens (socket is now ready).
  // This ensures messages are fetched even if the initial connect-time query missed.
  // Re-query message list when socket becomes ready (after connect or reconnect)
  const prevSocketReadyRef = useRef(false);
  useEffect(() => {
    if (socketReady && !prevSocketReadyRef.current && connectionState.connectedPrinter) {
      console.log('[usePrinterConnection] Socket became ready, re-querying message list');
      const timer = setTimeout(() => {
        if (connectionState.connectedPrinter) {
          queryMessageList(connectionState.connectedPrinter);
        }
      }, 800);
      prevSocketReadyRef.current = socketReady;
      return () => clearTimeout(timer);
    }
    prevSocketReadyRef.current = socketReady;
  }, [socketReady, connectionState.connectedPrinter, queryMessageList]);

  const connect = useCallback(async (printer: Printer) => {
    // If using emulator, simulate connection
    if (shouldUseEmulator()) {
      console.log('[connect] Using emulator for printer:', printer.id, printer.ipAddress);
      
      // Disconnect previous printer if switching
      if (connectionState.connectedPrinter && connectionState.connectedPrinter.id !== printer.id) {
        updatePrinter(connectionState.connectedPrinter.id, {
          isConnected: false,
        });
      }

      // Check if multi-printer emulator has an instance for this IP
      const multiInstance = multiPrinterEmulator.enabled 
        ? multiPrinterEmulator.getInstanceByIp(printer.ipAddress, printer.port)
        : null;

      if (multiInstance) {
        // Read the current state of this specific emulator instance — do NOT force jet start
        const emulatorState = multiInstance.getState();
        const simPrinter = multiInstance.getSimulatedPrinter();
        
        // Update printer status
        updatePrinter(printer.id, {
          isConnected: true,
          isAvailable: true,
          status: simPrinter.status,
          hasActiveErrors: false,
        });

        // Build message list from emulator state
        const emulatorMessages: PrintMessage[] = emulatorState.messages.map((name, idx) => ({
          id: idx + 1,
          name,
        }));

        setConnectionState({
          isConnected: true,
          connectedPrinter: { ...printer, isConnected: true },
          status: {
            ...mockStatus,
            isRunning: emulatorState.hvOn,
            jetRunning: emulatorState.jetRunning,
            currentMessage: emulatorState.currentMessage,
            inkLevel: emulatorState.inkLevel as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN',
            makeupLevel: emulatorState.makeupLevel as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN',
            printCount: emulatorState.printCount,
            productCount: emulatorState.productCount,
          },
          metrics: {
            ...mockMetrics,
            modulation: emulatorState.modulation,
            charge: emulatorState.charge,
            pressure: emulatorState.pressure,
            rps: emulatorState.rps,
            phaseQual: emulatorState.phaseQual,
            viscosity: emulatorState.viscosity,
            hvDeflection: emulatorState.hvOn,
            inkLevel: emulatorState.inkLevel,
            makeupLevel: emulatorState.makeupLevel,
            printStatus: emulatorState.hvOn && emulatorState.jetRunning ? 'Ready' : 'Not ready',
            subsystems: {
              v300up: emulatorState.v300up,
              vltOn: emulatorState.vltOn,
              gutOn: emulatorState.gutOn,
              modOn: emulatorState.modOn,
            },
          },
          settings: defaultSettings,
          messages: emulatorMessages,
        });
        // Enable polling in emulator mode — no real TCP socket needed
        setSocketReady(true);
        return;
      }

      // Fall back to single emulator (backward compat) — read state, don't force jet
      const emulatorState = printerEmulator.getState();
      
      // Update printer status
      updatePrinter(printer.id, {
        isConnected: true,
        isAvailable: true,
        status: 'not_ready',
        hasActiveErrors: false,
      });

      const emulatorMessages: PrintMessage[] = emulatorState.messages.map((name, idx) => ({
        id: idx + 1,
        name,
      }));
      setConnectionState({
        isConnected: true,
        connectedPrinter: { ...printer, isConnected: true },
        status: {
          ...mockStatus,
          isRunning: emulatorState.hvOn,
          jetRunning: emulatorState.jetRunning,
          currentMessage: emulatorState.currentMessage,
          inkLevel: emulatorState.inkLevel as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN',
          makeupLevel: emulatorState.makeupLevel as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN',
        },
        metrics: {
          ...mockMetrics,
          modulation: emulatorState.modulation,
          charge: emulatorState.charge,
          pressure: emulatorState.pressure,
          rps: emulatorState.rps,
          phaseQual: emulatorState.phaseQual,
          viscosity: emulatorState.viscosity,
          hvDeflection: emulatorState.hvOn,
          inkLevel: emulatorState.inkLevel,
          makeupLevel: emulatorState.makeupLevel,
          printStatus: emulatorState.hvOn ? 'Ready' : 'Not ready',
          subsystems: {
            v300up: emulatorState.v300up,
            vltOn: emulatorState.vltOn,
            gutOn: emulatorState.gutOn,
            modOn: emulatorState.modOn,
          },
        },
        settings: defaultSettings,
        messages: emulatorMessages,
      });
      // Enable polling in emulator mode — no real TCP socket needed
      setSocketReady(true);
      return;
    }

    // Disconnect old printer socket before connecting to new one
    const oldPrinterId = connectionState.connectedPrinter?.id;
    if (oldPrinterId && oldPrinterId !== printer.id) {
      console.log('[connect] Disconnecting old printer socket:', oldPrinterId);
      setSocketReady(false);
      // Clear messages immediately (synchronously) so MessagesScreen doesn't show
      // the previous printer's message list while the new connection initialises.
      setConnectionState(prev => ({ ...prev, messages: [], status: null }));
      try {
        await printerTransport.disconnect(oldPrinterId);
      } catch (e) {
        console.error('[connect] Old printer disconnect failed:', e);
      }
      // Mark old printer as disconnected
      updatePrinter(oldPrinterId, { isConnected: false });
      // Small settling delay after closing old socket
      await new Promise(r => setTimeout(r, 500));
    }

    // NOTE: The persistent socket is managed by the socket lifecycle effect.
    // We only store metadata here; the effect opens the TCP socket once connected.
    if (!isElectron && !isRelayMode()) {
      // Web preview: keep simulated delay (cannot reach local network printers without relay)
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else if (isRelayMode()) {
      // Relay mode: connect via PC relay
      try {
        await printerTransport.connect({
          id: printer.id,
          ipAddress: printer.ipAddress,
          port: printer.port,
        });
      } catch (e) {
        console.error('[connect] Relay connect failed:', e);
      }
    } else if (window.electronAPI?.printer?.setMeta) {
      // Register connection metadata without opening a socket.
      try {
        await printerTransport.setMeta({
          id: printer.id,
          ipAddress: printer.ipAddress,
          port: printer.port,
        });
      } catch (e) {
        console.error('[connect] Failed to set printer meta:', e);
      }
    }

    // Reflect connection immediately in the printers list (so returning to the printers page doesn't look disconnected)
     updatePrinter(printer.id, {
       isConnected: true,
       isAvailable: true,
       // Default to NOT READY until we confirm HV state via ^SU
       status: 'not_ready',
       hasActiveErrors: false,
     });

    // Reset ^LE overrides for the new connection so stale EMPTY doesn't carry over
    leEmptyOverridesRef.current = { inkEmpty: false, makeupEmpty: false };
    setActiveFaults([]);

    setConnectionState({
      isConnected: true,
      connectedPrinter: { ...printer, isConnected: true },
      status: mockStatus,
      metrics: mockMetrics,
      settings: defaultSettings,
      messages: mockMessages,
    });

    // Initial values now come from serialized polling as soon as socketReady is true.
    // This avoids opening a second connection during connect, which can delay status sync.
  }, [updatePrinter, queryPrinterStatus, queryMessageList]);

  const disconnect = useCallback(async () => {
    if ((isElectron || isRelayMode()) && connectionState.connectedPrinter) {
      try {
        await printerTransport.disconnect(connectionState.connectedPrinter.id);
      } catch (e) {
        console.error('Failed to disconnect printer:', e);
      }
    }

    if (connectionState.connectedPrinter) {
      updatePrinter(connectionState.connectedPrinter.id, {
        isConnected: false,
      });
    }

    setSocketReady(false);
    // Reset ^LE empty overrides so stale EMPTY state doesn't carry over to next connection
    leEmptyOverridesRef.current = { inkEmpty: false, makeupEmpty: false };
    setActiveFaults([]);
    setConnectionState({
      isConnected: false,
      connectedPrinter: null,
      status: null,
      metrics: null,
      settings: defaultSettings,
      messages: [],
    });
  }, [connectionState.connectedPrinter, updatePrinter]);

  // Keep ref in sync so polling can auto-disconnect without circular deps
  disconnectRef.current = disconnect;

  const startPrint = useCallback(async () => {
    console.log('[startPrint] Called, isConnected:', connectionState.isConnected, 'printer:', connectionState.connectedPrinter?.id);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[startPrint] Not connected, aborting');
      return;
    }
    
    const printer = connectionState.connectedPrinter;
    
    // Send ^PR command to enable printing (HV on)
    // IMPORTANT: Do NOT optimistically flip UI to green.
    // We only show HV On after a confirmed ^SU response (V300UP:1).
    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      console.log('[startPrint] Using emulator for', printer.ipAddress);
      const result = emulator.processCommand('^PR 1');
      console.log('[startPrint] Emulator result:', result);
      
      // Update state from emulator
      const state = emulator.getState();
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? { ...prev.status, isRunning: state.hvOn } : null,
      }));
      
      if (connectionState.connectedPrinter) {
        updatePrinterStatus(connectionState.connectedPrinter.id, {
          isAvailable: true,
          status: state.hvOn ? 'ready' : 'not_ready',
          hasActiveErrors: false,
        });
      }
    } else if (isElectron || isRelayMode()) {
      try {
        const tryCommands = ['^PR 1', '^PR1'] as const;
        let lastResult: any = null;

        for (const cmd of tryCommands) {
          console.log('[startPrint] Sending', cmd);
          const result = await printerTransport.sendCommand(printer.id, cmd);
          lastResult = result;
          console.log('[startPrint] Result for', cmd, ':', JSON.stringify(result));

          // If the device reports success, stop trying formats.
          if (result?.success) break;
        }

        if (!lastResult?.success) {
          console.error('[startPrint] ^PR command failed:', lastResult?.error);
        }

        // Always query actual status after a brief delay to confirm.
        // This drives the HMI state (green/red) from real V300UP.
        setTimeout(() => queryPrinterStatus(printer), 800);
      } catch (e) {
        console.error('[startPrint] Failed to send ^PR 1:', e);
      }
    } else {
      // Mock for web preview
      console.log('[startPrint] Web preview mock - toggling state');
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? { ...prev.status, isRunning: true } : null,
      }));
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter, queryPrinterStatus, updatePrinterStatus]);

  const stopPrint = useCallback(async () => {
    console.log('[stopPrint] Called, isConnected:', connectionState.isConnected, 'printer:', connectionState.connectedPrinter?.id);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[stopPrint] Not connected, aborting');
      return;
    }
    
    const printer = connectionState.connectedPrinter;
    
    // Send ^PR command to disable printing (HV off)
    // IMPORTANT: Do NOT optimistically flip UI.
    // We only show HV Off after a confirmed ^SU response (V300UP:0).
    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      console.log('[stopPrint] Using emulator for', printer.ipAddress);
      const result = emulator.processCommand('^PR 0');
      console.log('[stopPrint] Emulator result:', result);
      
      // Update state from emulator
      const state = emulator.getState();
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? { ...prev.status, isRunning: state.hvOn } : null,
      }));
      
      if (connectionState.connectedPrinter) {
        updatePrinterStatus(connectionState.connectedPrinter.id, {
          isAvailable: true,
          status: state.hvOn ? 'ready' : 'not_ready',
          hasActiveErrors: false,
        });
      }
    } else if (isElectron || isRelayMode()) {
      try {
        const tryCommands = ['^PR 0', '^PR0'] as const;
        let lastResult: any = null;

        for (const cmd of tryCommands) {
          console.log('[stopPrint] Sending', cmd);
          const result = await printerTransport.sendCommand(printer.id, cmd);
          lastResult = result;
          console.log('[stopPrint] Result for', cmd, ':', JSON.stringify(result));
          if (result?.success) break;
        }

        if (!lastResult?.success) {
          console.error('[stopPrint] ^PR command failed:', lastResult?.error);
        }

        // Always query actual status after a brief delay to confirm.
        setTimeout(() => queryPrinterStatus(printer), 800);
      } catch (e) {
        console.error('[stopPrint] Failed to send ^PR 0:', e);
      }
    } else {
      // Mock for web preview
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? { ...prev.status, isRunning: false } : null,
      }));
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter, queryPrinterStatus, updatePrinterStatus]);

  // Jet Stop - send ^SJ 0 command to stop the ink jet
  const jetStop = useCallback(async () => {
    console.log('[jetStop] Called, isConnected:', connectionState.isConnected, 'printer:', connectionState.connectedPrinter?.id);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[jetStop] Not connected, aborting');
      return;
    }
    
    const printer = connectionState.connectedPrinter;
    
    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      console.log('[jetStop] Using emulator for', printer.ipAddress);
      const result = emulator.processCommand('^SJ 0');
      console.log('[jetStop] Emulator result:', result);
      
      // Update state from emulator
      const state = emulator.getState();
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? { ...prev.status, isRunning: state.hvOn, jetRunning: state.jetRunning } : null,
      }));
      
      if (connectionState.connectedPrinter) {
        updatePrinterStatus(connectionState.connectedPrinter.id, {
          isAvailable: true,
          status: state.hvOn ? 'ready' : 'not_ready',
          hasActiveErrors: false,
        });
      }
    } else if (isElectron || isRelayMode()) {
      try {
        console.log('[jetStop] Sending ^SJ 0');
        const result = await printerTransport.sendCommand(printer.id, '^SJ 0');
        console.log('[jetStop] Result:', JSON.stringify(result));

        if (!result?.success) {
          console.error('[jetStop] ^SJ 0 command failed:', result?.error);
        }

        // Query status after a delay to reflect new state
        setTimeout(() => queryPrinterStatus(printer), 1500);
      } catch (e) {
        console.error('[jetStop] Failed to send ^SJ 0:', e);
      }
    } else {
      // Mock for web preview - set HV off state
      console.log('[jetStop] Web preview mock - setting HV off');
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? { ...prev.status, isRunning: false, jetRunning: false } : null,
      }));
      
      // Also update printer status in list
      if (connectionState.connectedPrinter) {
        updatePrinterStatus(connectionState.connectedPrinter.id, {
          isAvailable: true,
          status: 'not_ready',
          hasActiveErrors: false,
        });
      }
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter, queryPrinterStatus, updatePrinterStatus]);

  // Jet Start - send ^SJ 1 command to start the ink jet
  const jetStart = useCallback(async () => {
    console.log('[jetStart] Called, isConnected:', connectionState.isConnected, 'printer:', connectionState.connectedPrinter?.id);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[jetStart] Not connected, aborting');
      return;
    }
    
    const printer = connectionState.connectedPrinter;
    
    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      console.log('[jetStart] Using emulator for', printer.ipAddress);
      const result = emulator.processCommand('^SJ 1');
      console.log('[jetStart] Emulator result:', result);
      
      const state = emulator.getState();
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? { ...prev.status, jetRunning: state.jetRunning } : null,
      }));
      
      if (connectionState.connectedPrinter) {
        updatePrinterStatus(connectionState.connectedPrinter.id, {
          isAvailable: true,
          status: 'not_ready',
          hasActiveErrors: false,
        });
      }
    } else if (isElectron || isRelayMode()) {
      try {
        console.log('[jetStart] Sending ^SJ 1');
        const result = await printerTransport.sendCommand(printer.id, '^SJ 1');
        console.log('[jetStart] Result:', JSON.stringify(result));
        if (!result?.success) {
          console.error('[jetStart] ^SJ 1 command failed:', result?.error);
        }
      } catch (e) {
        console.error('[jetStart] Failed to send ^SJ 1:', e);
      }
    } else {
      console.log('[jetStart] Web preview mock - starting jet');
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? { ...prev.status, jetRunning: true } : null,
      }));
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter, queryPrinterStatus, updatePrinterStatus]);

  const updateSettings = useCallback((newSettings: Partial<PrintSettings>) => {
    setConnectionState(prev => ({
      ...(() => {
        const nextSettings = { ...prev.settings, ...newSettings };
        console.log('[AdjustDebug][connection.updateSettings]', {
          previousSettings: prev.settings,
          incomingSettings: newSettings,
          nextSettings,
        });
        return prev;
      })(),
      ...prev,
      settings: { ...prev.settings, ...newSettings },
    }));
  }, []);

  const selectMessage = useCallback(async (message: PrintMessage): Promise<boolean> => {
    console.log('[selectMessage] Called, message:', message.name, 'isConnected:', connectionState.isConnected);
    console.log('[AdjustDebug][selectMessage.start]', {
      messageName: message.name,
      connectedPrinterId: connectionState.connectedPrinter?.id ?? null,
      currentSettings: connectionState.settings,
    });
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[selectMessage] Not connected, updating local state only');
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? { ...prev.status, currentMessage: message.name } : null,
      }));
      return true;
    }
    
    const printer = connectionState.connectedPrinter;
    
    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      
      console.log('[selectMessage] Using emulator');
      const result = emulator.processCommand(`^SM ${message.name}`);
      console.log('[selectMessage] Emulator result:', result);
      
      if (result.success) {
        const state = emulator.getState();
        // Set grace period so polling doesn't revert the selection
        smSelectGraceUntilRef.current = Date.now() + 15000;
        smExpectedMessageRef.current = (state.currentMessage || '').toUpperCase();
        setConnectionState(prev => ({
          ...prev,
          status: prev.status ? { ...prev.status, currentMessage: state.currentMessage } : null,
        }));
        // Immediately update the printer card's currentMessage
        updatePrinter(printer.id, { currentMessage: state.currentMessage });
        return true;
      }
      return false;
    } else if (isElectron || isRelayMode()) {
      try {
        console.log('[selectMessage] Sending ^SM command:', message.name);
        const result = await printerTransport.sendCommand(printer.id, `^SM ${message.name}`);
        console.log('[selectMessage] Result:', JSON.stringify(result));

        const responseText = result?.response ?? '';
        if (!result?.success || isProtocolCommandFailure(responseText)) {
          console.error('[selectMessage] ^SM rejected by printer:', responseText || result?.error);
          return false;
        }

        // Set grace period so polling doesn't revert the selection
        smSelectGraceUntilRef.current = Date.now() + 15000;
        smExpectedMessageRef.current = message.name.toUpperCase();
        setConnectionState(prev => ({
          ...prev,
          status: prev.status ? { ...prev.status, currentMessage: message.name } : null,
        }));
        updatePrinter(printer.id, { currentMessage: message.name });
        return true;
      } catch (e) {
        console.error('[selectMessage] Failed to send ^SM command:', e);
        return false;
      }
    } else {
      // Web preview mock
      console.log('[selectMessage] Web preview mock');
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? { ...prev.status, currentMessage: message.name } : null,
      }));
      updatePrinter(printer.id, { currentMessage: message.name });
      return true;
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter, updatePrinter]);

  // Printer sign-in: send ^LG password command
  const signIn = useCallback(async (password: string): Promise<boolean> => {
    console.log('[signIn] Called, isConnected:', connectionState.isConnected, 'printer:', connectionState.connectedPrinter?.id);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[signIn] Not connected, aborting');
      return false;
    }
    
    const printer = connectionState.connectedPrinter;
    
    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      console.log('[signIn] Using emulator');
      const result = emulator.processCommand(`^LG ${password}`);
      console.log('[signIn] Emulator result:', result);
      return result.success && !result.response.includes('AuthFail');
    } else {
      // ^LG is not part of the BestCode Remote Protocol V2.6.
      // Sign-in is a local HMI feature only. Gate access locally with password.
      console.log('[signIn] Local password check (^LG not supported by protocol)');
      return password.toUpperCase() === 'TEXAS';
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter]);

  // Printer sign-out: send ^LO command
  const signOut = useCallback(async (): Promise<boolean> => {
    console.log('[signOut] Called, isConnected:', connectionState.isConnected, 'printer:', connectionState.connectedPrinter?.id);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[signOut] Not connected, aborting');
      return false;
    }
    
    const printer = connectionState.connectedPrinter;
    
    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      console.log('[signOut] Using emulator');
      const result = emulator.processCommand('^LO');
      console.log('[signOut] Emulator result:', result);
      return result.success;
    } else if (isElectron || isRelayMode()) {
      try {
        console.log('[signOut] Sending ^LO command');
        const result = await printerTransport.sendCommand(printer.id, '^LO');
        console.log('[signOut] Result:', JSON.stringify(result));
        return result?.success ?? false;
      } catch (e) {
        console.error('[signOut] Failed to send ^LO command:', e);
        return false;
      }
    } else {
      // Web preview mock
      console.log('[signOut] Web preview mock');
      return true;
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter]);

  // Add a new message to the list (local only) — deduplicates by name
  const addMessage = useCallback((name: string) => {
    // Guard against ^LM polling removing the message before printer persists
    recentlyAddedMessages.add(name);
    setTimeout(() => {
      recentlyAddedMessages.delete(name);
    }, ADDITION_GUARD_MS);

    setConnectionState((prev) => {
      // Skip if a message with this name already exists (case-insensitive)
      if (prev.messages.some(m => m.name.toUpperCase() === name.toUpperCase())) {
        return prev;
      }
      const newId = Math.max(0, ...prev.messages.map(m => m.id)) + 1;
      const newMessage: PrintMessage = { id: newId, name };
      return {
        ...prev,
        messages: [...prev.messages, newMessage],
      };
    });
  }, []);

  // Template value to protocol template code mapping (per v2.6 spec section 4.2.1)
  const templateToProtocolCode = (templateValue?: string): number => {
    const map: Record<string, number> = {
      '5': 0, '7': 1, '9': 2, '12': 3, '16': 4, '19': 5, '25': 6, '32': 7,
      '5s': 20, '7s': 21,
      'multi-2x7': 8, 'multi-2x7-2': 8, 'multi-2x7s': 23, 'multi-2x7s-2': 23,
      'multi-2x9': 9, 'multi-2x12': 10, 'multi-2x5': 17,
      'multi-3x7': 12, 'multi-3x9': 13,
      'multi-4x7': 14, 'multi-4x5': 15, 'multi-4x5h': 15, 'multi-4x5g': 15, 'multi-4x5f': 15,
      'multi-5x5': 15, 'multi-5x5-2': 15,
    };
    return map[templateValue || '16'] ?? 4; // Default to 1x16
  };

  // Font size name to protocol font code (per v2.6 spec section 4.2.5)
  const fontToProtocolCode = (fontSize: string): number => {
    const map: Record<string, number> = {
      'Standard5High': 0,
      'Standard7High': 2,
      'Narrow7High': 1,
      'Standard9High': 3,
      'Standard12High': 4,
      'Standard16High': 5,
      'Standard19High': 6,
      'Standard25High': 7,
      'Standard32High': 8,
    };
    return map[fontSize] ?? 5; // Default to 16-high
  };

  // Font size name to dot height (for Y coordinate inversion)
  const fontToDotHeight = (fontSize: string): number => {
    const map: Record<string, number> = {
      'Standard5High': 5,
      'Narrow7High': 7,
      'Standard7High': 7,
      'Standard9High': 9,
      'Standard12High': 12,
      'Standard16High': 16,
      'Standard19High': 19,
      'Standard25High': 25,
      'Standard32High': 32,
    };
    return map[fontSize] ?? 16;
  };

  // Build field subcommand for ^NM (per v2.6 spec section 5.33.2)
  // graphicMap: optional mapping of field ID → DataMatrix bitmap result (for ECC200 software barcodes)
  const buildFieldSubcommand = (field: {
    id: number;
    type: string;
    data: string;
    x: number;
    y: number;
    fontSize: string;
    bold?: number;
    gap?: number;
    height?: number;
    autoCodeFieldType?: string;
    autoCodeFormat?: string;
    autoCodeExpiryDays?: number;
  }, fieldNum: number, fieldTemplateHeight?: number, graphicMap?: Map<number, { graphicName: string; width: number; height: number }>): string => {
    const fontCode = fontToProtocolCode(field.fontSize);

    // DataMatrix ECC200 (software-generated): use ^AL logo reference instead of ^AB
    if (field.type === 'barcode' && isDataMatrixField(field.data) && graphicMap?.has(field.id)) {
      const dm = graphicMap.get(field.id)!;
      return `^AL${fieldNum};${field.x};${field.y};${dm.graphicName}`;
    }
    
    
    switch (field.type) {
      case 'text':
      case 'userdefine':
        // ^AT n; x; y; s; data
        return `^AT${fieldNum};${field.x};${field.y};${fontCode};${field.data}`;
      case 'date': {
        // Normalize stale builder metadata so legacy saved messages with expiry offsets
        // still use the correct prefix when re-saved.
        const normalizedAutoCodeFieldType = field.autoCodeFieldType?.startsWith('date_')
          ? ((field.autoCodeFieldType?.startsWith('date_expiry') || (field.autoCodeExpiryDays ?? 0) > 0)
              ? field.autoCodeFieldType.replace(/^date_normal_/, 'date_expiry_')
              : field.autoCodeFieldType.replace(/^date_expiry_/, 'date_normal_'))
          : field.autoCodeFieldType;

        // Use protocol mapping from autoCodeFieldType for the correct type code.
        // Per v2.6 protocol §5.33.2, ^AE IS a valid subcommand within ^NM.
        // Extension params use letter prefixes: D=days, R=rollover hours, etc.
        const info = normalizedAutoCodeFieldType
          ? getProtocolFieldInfo(normalizedAutoCodeFieldType, field.autoCodeFormat, field.autoCodeExpiryDays)
          : null;
        if (info) {
          // Use the actual command from protocol mapping (^AD, ^AE, or ^AP)
          const cmd = `^A${info.command.slice(1)}${fieldNum};${field.x};${field.y};${fontCode};${info.typeCode}${info.extParams || ''}`;
          console.log(`[buildFieldSubcommand] date field ${fieldNum}: autoCodeFieldType=${field.autoCodeFieldType} normalized=${normalizedAutoCodeFieldType} expiryDays=${field.autoCodeExpiryDays} → ${cmd}`);
          return cmd;
        }
        // Julian Date (YDDD) is a composite not in the protocol — send as text with live data
        if (normalizedAutoCodeFieldType?.includes('julian')) {
          return `^AT${fieldNum};${field.x};${field.y};${fontCode};${field.data}`;
        }
        // Fallback: ^AD with type 12 (MM/DD/YY with delimiters)
        return `^AD${fieldNum};${field.x};${field.y};${fontCode};12`;
      }
      case 'time': {
        // Use protocol mapping for correct ^AH/^AP + type code
        const info = field.autoCodeFieldType
          ? getProtocolFieldInfo(field.autoCodeFieldType, field.autoCodeFormat)
          : null;
        if (info) {
          return `^A${info.command.slice(1)}${fieldNum};${field.x};${field.y};${fontCode};${info.typeCode}`;
        }
        // Fallback: ^AH with type 7 (HH:MM:SS with delimiters)
        return `^AH${fieldNum};${field.x};${field.y};${fontCode};7`;
      }
      case 'counter':
        // ^AC n; x; y; s; c where c = hardware counter slot
        // 0 = print count, 1-4 = custom counters. Respect the field's selected
        // counter slot so Force Print increments the correct value on-printer.
        return `^AC${fieldNum};${field.x};${field.y};${fontCode};${Math.min(4, Math.max(0, parseInt(field.autoCodeFieldType?.match(/^counter_(\d+)$/i)?.[1] ?? '0', 10) || 0))}`;
      case 'barcode': {
        // ^AB syntax varies by barcode type (per v2.0 protocol section 5.27.2.1):
        //   1D (non-Code128): ^AB n;x;y;f;t;m;r;data
        //   Code 128:         ^AB n;x;y;f;t;m;r;c;data
        //   DataMatrix:       ^AB n;x;y;f;t;r;s;data
        //   QR Code:          ^AB n;x;y;f;t;s;data
        //
        // f = font size (0-8), t = barcode type, m = checksum (0=auto,1=manual),
        // r = human readable (0/1), c = Code128 start code (0=A,1=B,2=C),
        // s = size (QR: 0-2, DataMatrix: 0-15)

        // Parse UI prefix: [QR], [QRCODE|S=2], [CODE128|HR], etc.
        const prefixMatch = field.data.match(/^\[([^\]]+)\]\s*/);
        const rawData = prefixMatch ? field.data.slice(prefixMatch[0].length) : field.data;
        const prefixContent = prefixMatch ? prefixMatch[1] : 'CODE128';
        const parts = prefixContent.split('|').map((p) => p.trim()).filter(Boolean);
        const encodingName = (parts[0] || 'CODE128').toUpperCase();

        // Parse optional flags from prefix: |HR, |S=n, |C=n, |M=n
        const hrFlag = parts.some((p) => /^HR$/i.test(p));
        const sizeFlag = parts.find((p) => /^S=\d+$/i.test(p));
        const parsedSize = sizeFlag ? parseInt(sizeFlag.split('=')[1], 10) : NaN;
        const startCodeFlag = parts.find((p) => /^C=\d$/i.test(p));
        const startCode = startCodeFlag ? parseInt(startCodeFlag.split('=')[1], 10) : 1; // Default B
        const checksumFlag = parts.find((p) => /^M=\d$/i.test(p));
        const checksumMode = checksumFlag ? parseInt(checksumFlag.split('=')[1], 10) : 0; // Default auto

        // Map UI encoding name to v2.0 protocol barcode type code
        const barcodeTypeMap: Record<string, number> = {
          'I25': 0, 'INTERLEAVED 2 OF 5': 0,
          'UPCA': 1, 'UPC-A': 1,
          'UPCE': 2, 'UPC-E': 2,
          'EAN13': 3, 'EAN-13': 3, 'EAN 13': 3,
          'EAN8': 4, 'EAN-8': 4, 'EAN 8': 4,
          'CODE39': 5, 'CODE 39': 5,
          'CODE128': 6, 'CODE 128': 6,
          'DATAMATRIX': 7, 'DATA MATRIX': 7,
          'QR': 8, 'QRCODE': 8, 'QR CODE': 8,
        };
        const typeCode = barcodeTypeMap[encodingName] ?? 6;

        // f = font size code (controls bar height for 1D / module scaling for 2D)
        const f = fontToProtocolCode(field.fontSize);
        // For 2D barcodes (QR, DataMatrix), use f=0 since the s parameter
        // controls the matrix dimensions and f likely scales each module.
        // Using the text font code would over-scale the barcode.
        const is2D = typeCode === 7 || typeCode === 8;
        const barcodeF = is2D ? 0 : f;
        // r = human readable (0/1)
        const r = hrFlag ? 1 : 0;

        if (typeCode === 8) {
          // QR Code: ^AB n;x;y;f;t;s;data
          // Protocol s: 0=21x21, 1=25x25, 2=29x29
          // Editor S flag stores QR version: 1=21x21, 2=25x25, 3=29x29
          // Convert version -> protocol size while preserving legacy S=0..2 payloads.
          let qrSize: number;
          if (Number.isFinite(parsedSize)) {
            const barcodeHeight = field.height || fieldTemplateHeight || 32;
            const versionDots: Record<number, number> = { 1: 21, 2: 25, 3: 29 };
            const looksLikeVersion = parsedSize >= 1 && parsedSize <= 3 && barcodeHeight === versionDots[parsedSize];
            qrSize = looksLikeVersion
              ? parsedSize - 1
              : Math.min(Math.max(0, parsedSize), 2);
          } else {
            // Pick best fit: 29 dots → s=2, 25 dots → s=1, else s=0
            const barcodeHeight = field.height || fieldTemplateHeight || 32;
            qrSize = barcodeHeight >= 29 ? 2 : barcodeHeight >= 25 ? 1 : 0;
          }
          return `^AB${fieldNum};${field.x};${field.y};${barcodeF};${typeCode};${qrSize};${rawData}`;
        } else if (typeCode === 7) {
          // DataMatrix: ^AB n;x;y;f;t;r;s;data
          // s: 0-15 (specific matrix sizes)
          const dmSize = Number.isFinite(parsedSize) ? Math.min(Math.max(0, parsedSize), 15) : 0;
          return `^AB${fieldNum};${field.x};${field.y};${barcodeF};${typeCode};${r};${dmSize};${rawData}`;
        } else if (typeCode === 6) {
          // Code 128: ^AB n;x;y;f;t;m;r;c;data
          // c: start code (0=A, 1=B, 2=C)
          return `^AB${fieldNum};${field.x};${field.y};${f};${typeCode};${checksumMode};${r};${startCode};${rawData}`;
        } else {
          // All other 1D: ^AB n;x;y;f;t;m;r;data
          return `^AB${fieldNum};${field.x};${field.y};${f};${typeCode};${checksumMode};${r};${rawData}`;
        }
      }
      case 'logo':
        // ^AL n; x; y; logoname
        return `^AL${fieldNum};${field.x};${field.y};${field.data}`;
      default:
        return `^AT${fieldNum};${field.x};${field.y};${fontCode};${field.data}`;
    }
  };

  // Create a new message on the printer immediately with a minimal ^NM command.
  // This ensures the message exists on the printer hardware so it survives ^LM re-queries.
  const createMessageOnPrinter = useCallback(async (name: string): Promise<boolean> => {
    console.log('[createMessageOnPrinter] Creating message on printer:', name);
    addMessage(name);

    // Send a minimal ^NM to register the message on the printer
    // Template 0 (default), one empty text field so the command is valid
    const minimalNM = `^NM 0;0;0;0;${name}^AT1;0;0;7; `;

    if (shouldUseEmulator()) {
      const printer = connectionState.connectedPrinter;
      if (printer) {
        const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
        emulator.processCommand(minimalNM);
      }
      return true;
    } else if ((isElectron || isRelayMode()) && connectionState.connectedPrinter) {
      try {
        const result = await printerTransport.sendCommand(connectionState.connectedPrinter.id, minimalNM);
        console.log('[createMessageOnPrinter] ^NM result:', result);
        // Flush to NOR so the message persists
        await printerTransport.sendCommand(connectionState.connectedPrinter.id, FLUSH_COMMAND);
        return true;
      } catch (e) {
        console.error('[createMessageOnPrinter] Failed to send ^NM:', e);
        // Still keep it local even if printer command fails
        return true;
      }
    }
    return true;
  }, [addMessage, connectionState.connectedPrinter]);

  // Save message content to the printer using proper ^NM command with field subcommands
  // Per BestCode v2.6 protocol: ^NM t;s;o;p;name^AT1;x;y;s;data^AT2;x;y;s;data...
  // Always use delete-before-recreate; ^DM failures are expected for brand-new messages.
  const saveMessageContent = useCallback(async (
    messageName: string,
    fields: Array<{
      id: number;
      type: string;
      data: string;
      x: number;
      y: number;
      fontSize: string;
      bold?: number;
      gap?: number;
      height?: number;
      autoCodeFieldType?: string;
      autoCodeFormat?: string;
      autoCodeExpiryDays?: number;
    }>,
    templateValue?: string,
    isNew?: boolean,
    messageSettings?: {
      speed?: PrintSettings['speed'];
      rotation?: string;
      printMode?: 'Normal' | 'Auto' | 'Repeat' | 'Reverse' | 'Auto Encoder' | 'Auto Encoder Reverse';
    },
  ): Promise<boolean> => {
    console.log('[saveMessageContent] Called with:', messageName, fields, 'template:', templateValue, 'isNew:', isNew);
    (saveMessageContent as any).__lastError = '';
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[saveMessageContent] Not connected');
      return false;
    }

    if (fields.length === 0) {
      console.log('[saveMessageContent] No fields to save');
      return false;
    }

    if (fields.length >= 6) {
      console.log(`[saveMessageContent] Field count: ${fields.length}`);
    }

    const printer = connectionState.connectedPrinter;
    const normalizedMessageName = messageName.trim().toUpperCase();
    const currentSelectedMessage = connectionState.status?.currentMessage?.trim().toUpperCase();
    const needsSwitchAwayBeforeRewrite = currentSelectedMessage === normalizedMessageName;
    const fallbackMessage = normalizedMessageName === 'BESTCODE' ? 'BESTCODE AUTO' : 'BESTCODE';
    const templateCode = templateToProtocolCode(templateValue);
    
    // Convert absolute 32-dot canvas Y coordinates to printer Y coordinates.
    // The canvas uses Y=0 at the top (screen convention) with the template area
    // at the bottom of a 32-dot grid. The printer uses Y=0 at the BOTTOM of the
    // template area (print origin), so we must invert the Y axis.
    const templateHeight = (() => {
      if (!templateValue) return 32;
      const parsed = parseInt(templateValue);
      if (!isNaN(parsed)) return parsed;
      const multiHeightMap: Record<string, number> = {
        'multi-5x5': 29, 'multi-4x7': 31, 'multi-4x5': 23,
        'multi-3x9': 29, 'multi-3x7': 23,
        'multi-2x12': 25, 'multi-2x9': 19, 'multi-2x7': 16, 'multi-2x5': 11,
      };
      return multiHeightMap[templateValue] ?? 32;
    })();
    const blockedRows = 32 - templateHeight;
    
    // Filter out empty/invalid fields to prevent phantom fields on the printer
    const validFields = fields.filter(field => {
      // Text/userdefine fields need data; preserve whitespace-only separator fields
      // because they are intentional tokens from the code builder and affect field order.
      if (field.type === 'text' || field.type === 'userdefine') {
        return typeof field.data === 'string' && field.data.length > 0;
      }
      return true;
    });

    // Generate DataMatrix ECC200 bitmap upload commands for any DataMatrix barcode fields
    const { uploadCommands: dmUploadCmds, graphicMap: dmGraphicMap } = await generateDataMatrixCommands(validFields, templateHeight);

    // Build field subcommands with inverted Y coordinates
    // Canvas Y (top-origin) → template-relative → printer Y (bottom-origin)
    const fieldSubcommands = validFields.map((field, index) => {
      // For barcode fields, use actual field height; for text, use font dot height
      const fieldHeight = field.type === 'barcode' && field.height 
        ? field.height 
        : fontToDotHeight(field.fontSize);
      const templateRelativeY = field.y - blockedRows; // 0 = top of template
      const printerY = templateHeight - templateRelativeY - fieldHeight; // 0 = bottom of template
      return buildFieldSubcommand({
        ...field,
        y: Math.max(0, printerY),
      }, index + 1, templateHeight, dmGraphicMap);
    }).join('');

    console.log('[saveMessageContent] Valid fields for upload:', validFields.map((field, index) => ({
      uploadFieldNum: index + 1,
      type: field.type,
      data: field.data,
      autoCodeFieldType: field.autoCodeFieldType,
      autoCodeFormat: field.autoCodeFormat,
      x: field.x,
      y: field.y,
    })));

    const orientationMap: Record<string, number> = {
      'Normal': 0,
      'Flip': 1,
      'Mirror': 2,
      'Mirror Flip': 3,
      'Tower': 4,
      'Tower Flip': 5,
      'Tower Mirror': 6,
      'Tower Mirror Flip': 7,
    };
    const speedMap: Record<PrintSettings['speed'], number> = {
      'Fast': 0,
      'Faster': 1,
      'Fastest': 2,
      'Ultra Fast': 3,
    };
    const printModeMap: Record<string, number> = {
      'Normal': 0,
      'Auto': 1,
      'Repeat': 2,
      'Reverse': 3,
      'Auto Encoder': 5,
      'Auto Encoder Reverse': 6,
    };

    const nmSpeed = speedMap[messageSettings?.speed ?? 'Fast'] ?? 0;
    const nmOrientation = orientationMap[messageSettings?.rotation ?? 'Normal'] ?? 0;
    const nmPrintMode = printModeMap[messageSettings?.printMode ?? 'Normal'] ?? 0;

    const nmCommand = `^NM ${templateCode};${nmSpeed};${nmOrientation};${nmPrintMode};${messageName}${fieldSubcommands}`;
    
    console.log('[saveMessageContent] ^NM command:', nmCommand);
    

    if (dmUploadCmds.length > 0) {
      console.log(`[saveMessageContent] DataMatrix ECC200: ${dmUploadCmds.length} ^NG upload command(s)`);
    }

    // For existing messages, delete first then recreate
    // DataMatrix bitmap uploads must happen before the ^NM command
    const commands: string[] = [];
    if (needsSwitchAwayBeforeRewrite) {
      // Rewriting the currently selected message via ^DM/^NM can wedge the firmware.
      // Switch to a safe fallback first, then perform the destructive rewrite.
      console.log('[saveMessageContent] Active message rewrite detected; switching away first:', {
        messageName,
        fallbackMessage,
      });
      commands.push(`^SM ${fallbackMessage}`);
    }
    commands.push(`^DM ${messageName}`);
    // Insert ^NG (graphic upload) commands before ^NM
    commands.push(...dmUploadCmds);
    commands.push(nmCommand);
    commands.push(FLUSH_COMMAND);

    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      console.log('[saveMessageContent] Using emulator');
      for (const cmd of commands) {
        const result = emulator.processCommand(cmd);
        console.log('[saveMessageContent] Emulator result for', cmd, ':', result);
      }
      // Ensure message is in local state
      addMessage(messageName);
      return true;
    } else if (isElectron || isRelayMode()) {
      // Pause status polling to prevent ^SU commands from interleaving
      // with the ^DM → ^NM → ^SV save sequence on the shared TCP socket.
      setPollingPaused(true);
      try {
        for (let cmdIdx = 0; cmdIdx < commands.length; cmdIdx++) {
          const cmd = commands[cmdIdx];
          console.log('[saveMessageContent] Sending:', cmd);
          const result = await printerTransport.sendCommand(printer.id, cmd);
          console.log('[saveMessageContent] Result:', JSON.stringify(result));
          const responseText = result?.response ?? '';
          const errorText = result?.error ?? '';
          const rejectedByPrinter = isProtocolCommandFailure(responseText);

          // Don't fail on ^DM error (message might not exist yet)
          if ((!result?.success || rejectedByPrinter) && !cmd.startsWith('^DM')) {
            const reason = responseText || errorText || 'Unknown error';
            console.error('[saveMessageContent] Command rejected:', cmd, reason);
            (saveMessageContent as any).__lastError = reason;
            setPollingPaused(false);
            return false;
          }

          // Standard inter-command delay
          const delayAfterCommand = cmd.startsWith('^SM ') && needsSwitchAwayBeforeRewrite
            ? 800
            : 300;
          await new Promise(resolve => setTimeout(resolve, delayAfterCommand));
        }

        // Resume polling before optional verification
        setPollingPaused(false);

        // Post-save verification: wait for firmware to flush, then check ^LM.
        if (isNew) {
          await new Promise(resolve => setTimeout(resolve, 500));
          try {
            const verifyList = await printerTransport.sendCommand(printer.id, '^LM');
            const verifyResponse = verifyList?.response ?? '';
            if (verifyList?.success && verifyResponse) {
              const namesAfterSave = parseLmMessageNames(verifyResponse);
              const found = namesAfterSave.some(name => name.toUpperCase() === messageName.toUpperCase());
              console.log('[saveMessageContent] Post-save ^LM verify (informational):', { messageName, found, namesAfterSave });
            }
          } catch (verifyErr) {
            console.warn('[saveMessageContent] ^LM verify failed (non-fatal):', verifyErr);
          }
        }

        addMessage(messageName);
        return true;
      } catch (e) {
        console.error('[saveMessageContent] Failed:', e);
        (saveMessageContent as any).__lastError = e instanceof Error ? e.message : 'Unknown error';
        setPollingPaused(false);
        return false;
      }
    } else {
      // Web preview mock
      console.log('[saveMessageContent] Web preview mock - commands:', commands);
      return true;
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter, connectionState.status?.currentMessage, addMessage]);

  // Build the raw protocol commands for a message (without sending).
  // Used by master/slave sync to send messages to non-connected printers.
  // Now async to support DataMatrix ECC200 bitmap generation.
  const buildMessageCommands = useCallback(async (
    messageName: string,
    fields: Array<{
      id: number;
      type: string;
      data: string;
      x: number;
      y: number;
      fontSize: string;
      bold?: number;
      gap?: number;
      height?: number;
      autoCodeFieldType?: string;
      autoCodeFormat?: string;
      autoCodeExpiryDays?: number;
    }>,
    templateValue?: string,
    isNew?: boolean,
    messageSettings?: {
      speed?: PrintSettings['speed'];
      rotation?: string;
      printMode?: 'Normal' | 'Auto' | 'Repeat' | 'Reverse' | 'Auto Encoder' | 'Auto Encoder Reverse';
    },
  ): Promise<string[] | null> => {
    if (fields.length === 0) return null;

    const templateCode = templateToProtocolCode(templateValue);
    const templateHeight = (() => {
      if (!templateValue) return 32;
      const parsed = parseInt(templateValue);
      if (!isNaN(parsed)) return parsed;
      const multiHeightMap: Record<string, number> = {
        'multi-5x5': 29, 'multi-4x7': 31, 'multi-4x5': 23,
        'multi-3x9': 29, 'multi-3x7': 23,
        'multi-2x12': 25, 'multi-2x9': 19, 'multi-2x7': 16, 'multi-2x5': 11,
      };
      return multiHeightMap[templateValue] ?? 32;
    })();
    const blockedRows = 32 - templateHeight;

    const validFields = fields.filter(field => {
      if (field.type === 'text' || field.type === 'userdefine') {
        return field.data && field.data.trim().length > 0;
      }
      return true;
    });

    // Generate DataMatrix ECC200 bitmap upload commands
    const { uploadCommands: dmUploadCmds, graphicMap: dmGraphicMap } = await generateDataMatrixCommands(validFields, templateHeight);

    const fieldSubcommands = validFields.map((field, index) => {
      const fieldHeight = field.type === 'barcode' && field.height 
        ? field.height 
        : fontToDotHeight(field.fontSize);
      const templateRelativeY = field.y - blockedRows;
      const printerY = templateHeight - templateRelativeY - fieldHeight;
      return buildFieldSubcommand({
        ...field,
        y: Math.max(0, printerY),
      }, index + 1, templateHeight, dmGraphicMap);
    }).join('');

    const orientationMap: Record<string, number> = {
      'Normal': 0,
      'Flip': 1,
      'Mirror': 2,
      'Mirror Flip': 3,
      'Tower': 4,
      'Tower Flip': 5,
      'Tower Mirror': 6,
      'Tower Mirror Flip': 7,
    };
    const speedMap: Record<PrintSettings['speed'], number> = {
      'Fast': 0,
      'Faster': 1,
      'Fastest': 2,
      'Ultra Fast': 3,
    };
    const printModeMap: Record<string, number> = {
      'Normal': 0,
      'Auto': 1,
      'Repeat': 2,
      'Reverse': 3,
      'Auto Encoder': 5,
      'Auto Encoder Reverse': 6,
    };

    const nmSpeed = speedMap[messageSettings?.speed ?? 'Fast'] ?? 0;
    const nmOrientation = orientationMap[messageSettings?.rotation ?? 'Normal'] ?? 0;
    const nmPrintMode = printModeMap[messageSettings?.printMode ?? 'Normal'] ?? 0;

    const nmCommand = `^NM ${templateCode};${nmSpeed};${nmOrientation};${nmPrintMode};${messageName}${fieldSubcommands}`;
    const commands: string[] = [`^DM ${messageName}`];
    // Insert ^NG commands before ^NM
    commands.push(...dmUploadCmds);
    commands.push(nmCommand);
    commands.push(FLUSH_COMMAND);
    return commands;
  }, []);

  // Update an existing message
  const updateMessage = useCallback((id: number, name: string) => {
    setConnectionState((prev) => ({
      ...prev,
      messages: prev.messages.map(m => m.id === id ? { ...m, name } : m),
    }));
  }, []);

  // Delete a message — protocol ^DM <message>
  // Per protocol, delete fails for: non-existent, reserved, or currently-printing message.
  const deleteMessage = useCallback(async (id: number) => {
    const msg = connectionState.messages.find(m => m.id === id);
    const msgName = msg?.name?.trim();
    if (!msgName) return false;

    const normalizedName = msgName.toUpperCase();

    // Protocol guard: reserved messages cannot be deleted
    if (RESERVED_PRINTER_MESSAGES.has(normalizedName)) {
      toast.error(`Cannot delete "${msgName}" — this is a reserved printer message.`);
      return false;
    }

    // Protocol guard: current printing message cannot be deleted
    const currentMessage = connectionState.status?.currentMessage?.trim().toUpperCase();
    if (currentMessage && currentMessage === normalizedName) {
      toast.error(`Can't delete "${msgName}" — it is currently selected for printing.`);
      return false;
    }

    let deleteConfirmed = true;

    if (connectionState.isConnected && connectionState.connectedPrinter) {
      // Guard against ^LM polling race while delete is being processed
      console.log('[deleteMessage] Adding guard for:', normalizedName, '| all guards:', [...recentlyDeletedMessages, normalizedName]);
      recentlyDeletedMessages.add(normalizedName);
      setTimeout(() => {
        recentlyDeletedMessages.delete(normalizedName);
        console.log('[deleteMessage] Guard expired for:', normalizedName);
      }, DELETION_GUARD_MS);

      const deleteCommand = `^DM ${msgName}`;
      console.log('[deleteMessage] Sending:', deleteCommand);

      if (shouldUseEmulator()) {
        const emulator = getEmulatorForPrinter(
          connectionState.connectedPrinter.ipAddress,
          connectionState.connectedPrinter.port,
        );
        const result = emulator.processCommand(deleteCommand);
        deleteConfirmed = !!result?.success;
        if (!deleteConfirmed) {
          toast.error(`Failed to delete "${msgName}"`);
        }
      } else if (isElectron || isRelayMode()) {
        try {
          const result = await printerTransport.sendCommand(
            connectionState.connectedPrinter.id,
            deleteCommand,
          );

          const responseText = result?.response ?? '';
          console.log('[deleteMessage] ^DM result:', result);

          if (!result?.success || isProtocolCommandFailure(responseText)) {
            deleteConfirmed = false;
            toast.error(`Cannot delete "${msgName}": ${result?.error || responseText || 'Printer rejected command'}`);
          }

          // Flush the queued deletion to NOR filesystem
          if (deleteConfirmed) {
            console.log('[deleteMessage] Flushing with ^SV');
            await printerTransport.sendCommand(connectionState.connectedPrinter.id, FLUSH_COMMAND);
          }

          // Verify with fresh ^LM (retry with small delay) so UI updates only after confirmed deletion
          if (deleteConfirmed) {
            let stillExists = true;

            for (let attempt = 1; attempt <= DELETE_VERIFY_RETRIES; attempt += 1) {
              const verifyList = await printerTransport.sendCommand(
                connectionState.connectedPrinter.id,
                '^LM',
              );

              if (verifyList?.success && typeof verifyList.response === 'string') {
                const namesAfterDelete = parseLmMessageNames(verifyList.response);
                stillExists = namesAfterDelete.includes(normalizedName);
                if (!stillExists) break;
              }

              if (attempt < DELETE_VERIFY_RETRIES) {
                await new Promise((resolve) => setTimeout(resolve, DELETE_VERIFY_DELAY_MS));
              }
            }

            if (stillExists) {
              deleteConfirmed = false;
              toast.error(`Delete failed — "${msgName}" is still on the printer.`);
            }
          }
        } catch (e) {
          console.error('[deleteMessage] Failed to send ^DM:', e);
          deleteConfirmed = false;
          toast.error(`Failed to delete "${msgName}"`);
        }
      }

      if (!deleteConfirmed) {
        recentlyDeletedMessages.delete(normalizedName);
        return false;
      }
    }

    // Remove from UI only after delete is confirmed
    setConnectionState((prev) => ({
      ...prev,
      messages: prev.messages.filter(m => m.id !== id),
    }));

    return true;
  }, [connectionState.messages, connectionState.isConnected, connectionState.connectedPrinter, connectionState.status?.currentMessage]);

  // Reset or set a counter value using ^CC command
  // Counter IDs: 0 = Print Counter, 1-4 = Custom Counters, 6 = Product Counter
  const resetCounter = useCallback(async (counterId: number, value: number = 0) => {
    console.log('[resetCounter] Called, counterId:', counterId, 'value:', value, 'isConnected:', connectionState.isConnected);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[resetCounter] Not connected, aborting');
      return false;
    }
    
    const printer = connectionState.connectedPrinter;
    const command = `^CC ${counterId};${value}`;
    
    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      
      console.log('[resetCounter] Using emulator, command:', command);
      const result = emulator.processCommand(command);
      console.log('[resetCounter] Emulator result:', result);
      console.log('[resetCounter] Emulator result:', result);
      
      // Update local state from emulator - include all counters
      const state = emulator.getState();
      console.log('[resetCounter] Emulator state after reset - printCount:', state.printCount, 'productCount:', state.productCount);
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? {
          ...prev.status,
          productCount: state.productCount,
          printCount: state.printCount,
          customCounters: [...state.customCounters],
        } : null,
      }));
      
      // Also immediately update the printer card's stored count
      if (printer) {
        updatePrinter(printer.id, {
          printCount: state.printCount,
        });
      }
      return true;
    } else if (isElectron || isRelayMode()) {
      try {
        console.log('[resetCounter] Sending', command);
        const result = await printerTransport.sendCommand(printer.id, command);
        console.log('[resetCounter] Result:', JSON.stringify(result));
        
        if (!result?.success) {
          console.error('[resetCounter] ^CC command failed:', result?.error);
          return false;
        }
        
        // Query counters via ^CN after a delay to reflect new values
        setTimeout(async () => {
          try {
            const cnResult = await printerTransport.sendCommand(printer.id, '^CN');
            console.log('[resetCounter] ^CN result:', JSON.stringify(cnResult));
            if (cnResult?.success && cnResult.response) {
              const response = cnResult.response;
              let parts: number[] = [];
              if (response.includes('Product:')) {
                const productMatch = response.match(/Product:(\d+)/);
                const printMatch = response.match(/Print:(\d+)/);
                const custom1Match = response.match(/Custom1:(\d+)/);
                const custom2Match = response.match(/Custom2:(\d+)/);
                const custom3Match = response.match(/Custom3:(\d+)/);
                const custom4Match = response.match(/Custom4:(\d+)/);
                parts = [
                  productMatch ? parseInt(productMatch[1], 10) : 0,
                  printMatch ? parseInt(printMatch[1], 10) : 0,
                  custom1Match ? parseInt(custom1Match[1], 10) : 0,
                  custom2Match ? parseInt(custom2Match[1], 10) : 0,
                  custom3Match ? parseInt(custom3Match[1], 10) : 0,
                  custom4Match ? parseInt(custom4Match[1], 10) : 0,
                ];
              } else {
                parts = response.split(',').map((s: string) => { const n = parseInt(s.trim(), 10); return isNaN(n) ? 0 : n; });
              }
              if (parts.length >= 6) {
                setConnectionState(prev => ({
                  ...prev,
                  status: prev.status ? {
                    ...prev.status,
                    productCount: parts[0],
                    printCount: parts[1],
                    customCounters: [parts[2], parts[3], parts[4], parts[5]],
                  } : null,
                }));
              }
            }
          } catch (e) {
            console.error('[resetCounter] Failed to query ^CN after reset:', e);
          }
        }, 500);
        return true;
      } catch (e) {
        console.error('[resetCounter] Failed to send ^CC:', e);
        return false;
      }
    } else {
      // Web preview mock - just log
      console.log('[resetCounter] Web preview mock - would send:', command);
      return true;
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter]);

  // Reset all counters
  const resetAllCounters = useCallback(async () => {
    console.log('[resetAllCounters] Resetting all counters');
    // Counter IDs: 0 = Print, 1-4 = Custom, 6 = Product
    const counterIds = [0, 1, 2, 3, 4, 6];
    
    for (const id of counterIds) {
      await resetCounter(id, 0);
    }
  }, [resetCounter]);

  // Query all counter values using ^CN command
  const queryCounters = useCallback(async () => {
    console.log('[queryCounters] Called, isConnected:', connectionState.isConnected);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[queryCounters] Not connected, aborting');
      return;
    }
    
    const printer = connectionState.connectedPrinter;
    
    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      
      console.log('[queryCounters] Using emulator');
      const result = emulator.processCommand('^CN');
      console.log('[queryCounters] Emulator result:', result);
      
      if (result.success && result.response) {
        // Parse emulator response - could be terse format: PC[308] PrC[7] C1[10] C2[21] C3[34] C4[45]
        // or verbose: Product Count: 308\r\nPrint Count: 7\r\n...
        const response = result.response;
        let parts: number[] = [];
        
        if (response.includes('PC[')) {
          // Terse format from emulator: PC[x] PrC[x] C1[x] C2[x] C3[x] C4[x]
          const pcMatch = response.match(/PC\[(\d+)\]/);
          const prcMatch = response.match(/PrC\[(\d+)\]/);
          const c1Match = response.match(/C1\[(\d+)\]/);
          const c2Match = response.match(/C2\[(\d+)\]/);
          const c3Match = response.match(/C3\[(\d+)\]/);
          const c4Match = response.match(/C4\[(\d+)\]/);
          parts = [
            pcMatch ? parseInt(pcMatch[1], 10) : 0,
            prcMatch ? parseInt(prcMatch[1], 10) : 0,
            c1Match ? parseInt(c1Match[1], 10) : 0,
            c2Match ? parseInt(c2Match[1], 10) : 0,
            c3Match ? parseInt(c3Match[1], 10) : 0,
            c4Match ? parseInt(c4Match[1], 10) : 0,
          ];
        } else if (response.includes('Product Count:')) {
          // Verbose format
          const productMatch = response.match(/Product Count:\s*(\d+)/);
          const printMatch = response.match(/Print Count:\s*(\d+)/);
          const c1Match = response.match(/Counter 1:\s*(\d+)/);
          const c2Match = response.match(/Counter 2:\s*(\d+)/);
          const c3Match = response.match(/Counter 3:\s*(\d+)/);
          const c4Match = response.match(/Counter 4:\s*(\d+)/);
          parts = [
            productMatch ? parseInt(productMatch[1], 10) : 0,
            printMatch ? parseInt(printMatch[1], 10) : 0,
            c1Match ? parseInt(c1Match[1], 10) : 0,
            c2Match ? parseInt(c2Match[1], 10) : 0,
            c3Match ? parseInt(c3Match[1], 10) : 0,
            c4Match ? parseInt(c4Match[1], 10) : 0,
          ];
        } else {
          // Comma-separated fallback
          parts = response.split(',').map((s: string) => { const n = parseInt(s.trim(), 10); return isNaN(n) ? 0 : n; });
        }
        
        if (parts.length >= 6) {
          setConnectionState(prev => ({
            ...prev,
            status: prev.status ? {
              ...prev.status,
              productCount: parts[0],
              printCount: parts[1],
              customCounters: [parts[2], parts[3], parts[4], parts[5]],
            } : null,
          }));
        }
      }
    } else if (isElectron || isRelayMode()) {
      try {
        console.log('[queryCounters] Sending ^CN');
        const result = await printerTransport.sendCommand(printer.id, '^CN');
        console.log('[queryCounters] Result:', JSON.stringify(result));
        
        if (result?.success && result.response) {
          // Parse response: could be terse "308,7,10,21,34,45" or verbose
          const response = result.response;
          let parts: number[] = [];
          
          if (response.includes('Product:')) {
            // Verbose format: "Product:308, Print:7, Custom1:10, ..."
            const productMatch = response.match(/Product:(\d+)/);
            const printMatch = response.match(/Print:(\d+)/);
            const custom1Match = response.match(/Custom1:(\d+)/);
            const custom2Match = response.match(/Custom2:(\d+)/);
            const custom3Match = response.match(/Custom3:(\d+)/);
            const custom4Match = response.match(/Custom4:(\d+)/);
            
            parts = [
              productMatch ? parseInt(productMatch[1], 10) : 0,
              printMatch ? parseInt(printMatch[1], 10) : 0,
              custom1Match ? parseInt(custom1Match[1], 10) : 0,
              custom2Match ? parseInt(custom2Match[1], 10) : 0,
              custom3Match ? parseInt(custom3Match[1], 10) : 0,
              custom4Match ? parseInt(custom4Match[1], 10) : 0,
            ];
          } else {
            // Terse format: "308,7,10,21,34,45"
            parts = response.split(',').map((s: string) => { const n = parseInt(s.trim(), 10); return isNaN(n) ? 0 : n; });
          }
          
          if (parts.length >= 6) {
            setConnectionState(prev => ({
              ...prev,
              status: prev.status ? {
                ...prev.status,
                productCount: parts[0],
                printCount: parts[1],
                customCounters: [parts[2], parts[3], parts[4], parts[5]],
              } : null,
            }));
          }
        }
      } catch (e) {
        console.error('[queryCounters] Failed to query counters:', e);
      }
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter]);

  // Save GLOBAL print settings to the CURRENTLY SELECTED printing message
  // Per BestCode v2.0 protocol, these affect the active message dynamically:
  // ^PW n - Print Width (0-16000)
  // ^PH n - Print Height (0-10)
  // ^DA n - Delay Adjust (0-4,000,000,000)
  // ^SB n - Set Bold (0-9)
  // ^GP n - Gap (0-9)
  // ^PA n - Pitch Adjust (0-4,000,000,000) - only for Repeat/Auto mode
  // ^RA n - Repeat Adjust (0-30000) - only for Repeat mode
  const saveGlobalAdjust = useCallback(async (settings: PrintSettings): Promise<boolean> => {
    console.log('[saveGlobalAdjust] Called with:', settings);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[saveGlobalAdjust] Not connected');
      return false;
    }

    const printer = connectionState.connectedPrinter;

    // Global adjust commands - affect the currently printing message
    const commands = [
      `^PW ${settings.width}`,
      `^PH ${settings.height}`,
      `^DA ${settings.delay}`,
      `^SB ${settings.bold}`,
      `^GP ${settings.gap}`,
      `^PA ${settings.pitch}`,
      `^RA ${settings.repeatAmount}`,
    ];

    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      console.log('[saveGlobalAdjust] Using emulator');
      for (const cmd of commands) {
        const result = emulator.processCommand(cmd);
        console.log('[saveGlobalAdjust] Emulator result for', cmd, ':', result);
        if (!result?.success || isProtocolCommandFailure(result?.response)) {
          console.error('[saveGlobalAdjust] Emulator command rejected:', cmd, result?.response);
          return false;
        }
      }
      return true;
    } else if (isElectron || isRelayMode()) {
      setPollingPaused(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 300));
        for (const cmd of commands) {
          console.log('[saveGlobalAdjust] Sending:', cmd);
          const result = await printerTransport.sendCommand(printer.id, cmd);
          console.log('[saveGlobalAdjust] Result:', JSON.stringify(result));

          const responseText = result?.response ?? result?.error ?? '';
          if (!result?.success || isProtocolCommandFailure(responseText)) {
            console.error('[saveGlobalAdjust] Command failed:', cmd, responseText);
            return false;
          }

          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        return true;
      } catch (e) {
        console.error('[saveGlobalAdjust] Failed to save settings:', e);
        return false;
      } finally {
        setPollingPaused(false);
      }
    } else {
      // Web preview mock
      console.log('[saveGlobalAdjust] Web preview mock');
      return true;
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter]);

  // Save PER-MESSAGE settings using ^CM (Change Message) command
  // Per BestCode v2.0 protocol, ^CM updates the STORED message definition:
  // ^CM t; s; o; p
  // t = Template size (0-16) - handled by template selection
  // s = Print Speed (0=Fast, 1=Faster, 2=Fastest, 3=Ultra Fast)
  // o = Orientation (0-7: Normal, Flip, Mirror, Mirror Flip, Tower, Tower Flip, Tower Mirror, Tower Mirror Flip)
  // p = Print Mode (0=Normal, 1=Auto, 2=Repeat, 3=Reverse)
  const saveMessageSettings = useCallback(async (settings: {
    speed: PrintSettings['speed'];
    rotation: string; // Extended to include tower orientations
    printMode?: 'Normal' | 'Auto' | 'Repeat' | 'Reverse' | 'Auto Encoder' | 'Auto Encoder Reverse';
  }): Promise<boolean> => {
    console.log('[saveMessageSettings] Called with:', settings);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[saveMessageSettings] Not connected');
      return false;
    }

    const printer = connectionState.connectedPrinter;

    // Map rotation and speed to numeric values per protocol
    // Extended orientation map to include tower modes (0-7)
    const orientationMap: Record<string, number> = {
      'Normal': 0,
      'Flip': 1,
      'Mirror': 2,
      'Mirror Flip': 3,
      'Tower': 4,
      'Tower Flip': 5,
      'Tower Mirror': 6,
      'Tower Mirror Flip': 7,
    };
    const speedMap: Record<PrintSettings['speed'], number> = {
      'Fast': 0,
      'Faster': 1,
      'Fastest': 2,
      'Ultra Fast': 3,
    };
    const printModeMap: Record<string, number> = {
      'Normal': 0,
      'Auto': 1,
      'Repeat': 2,
      'Reverse': 3,
      'Auto Encoder': 5,
      'Auto Encoder Reverse': 6,
    };

    // ^CM with named parameters: s=speed, o=orientation, p=printMode
    const orientationValue = orientationMap[settings.rotation] ?? 0;
    const printModeValue = printModeMap[settings.printMode ?? 'Normal'];
    const command = `^CM s${speedMap[settings.speed]};o${orientationValue};p${printModeValue}`;

    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      console.log('[saveMessageSettings] Using emulator');
      const result = emulator.processCommand(command);
      console.log('[saveMessageSettings] Emulator result:', result);
      return result.success;
    } else if (isElectron || isRelayMode()) {
      try {
        console.log('[saveMessageSettings] Sending:', command);
        const result = await printerTransport.sendCommand(printer.id, command);
        console.log('[saveMessageSettings] Result:', JSON.stringify(result));
        return result?.success ?? false;
      } catch (e) {
        console.error('[saveMessageSettings] Failed to save message settings:', e);
        return false;
      }
    } else {
      // Web preview mock
      console.log('[saveMessageSettings] Web preview mock');
      return true;
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter]);

  // Query print settings from the printer
  // Uses ^QP command to get current print settings
  const queryPrintSettings = useCallback(async (): Promise<void> => {
    console.log('[queryPrintSettings] Called');
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[queryPrintSettings] Not connected');
      return;
    }

    const printer = connectionState.connectedPrinter;

    if (shouldUseEmulator()) {
      console.log('[queryPrintSettings] Using emulator - using current settings');
      // Emulator doesn't have stored settings, use current state
      return;
    } else if (isElectron || isRelayMode()) {
      try {
        console.log('[queryPrintSettings] Querying settings from printer');
        const result = await printerTransport.sendCommand(printer.id, '^QP');
        console.log('[queryPrintSettings] Result:', JSON.stringify(result));

        if (result?.success && result.response) {
          // Parse response - format varies by firmware
          // Expected format: "Width:15,Height:8,Delay:100,Rotation:0,Bold:0,Speed:2,Gap:0,Pitch:0"
          const response = result.response;
          
          const extract = (key: string): number | null => {
            const match = response.match(new RegExp(`${key}[:\\s]*(\\d+)`, 'i'));
            return match ? parseInt(match[1], 10) : null;
          };

          const rotationReverseMap: Record<number, PrintSettings['rotation']> = {
            0: 'Normal',
            1: 'Mirror',
            2: 'Flip',
            3: 'Mirror Flip',
          };
          const speedReverseMap: Record<number, PrintSettings['speed']> = {
            0: 'Fast',
            1: 'Faster',
            2: 'Fastest',
            3: 'Ultra Fast',
          };

          const width = extract('Width');
          const height = extract('Height');
          const delay = extract('Delay');
          const rotationNum = extract('Rotation');
          const bold = extract('Bold');
          const speedNum = extract('Speed');
          const gap = extract('Gap');
          const pitch = extract('Pitch');

          console.log('[AdjustDebug][queryPrintSettings.parsed]', {
            printerId: printer.id,
            width,
            height,
            delay,
            rotationNum,
            bold,
            speedNum,
            gap,
            pitch,
            rawResponse: response,
          });

          setConnectionState(prev => ({
            ...prev,
            settings: {
              ...prev.settings,
              ...(width !== null && { width }),
              ...(height !== null && { height }),
              ...(delay !== null && { delay }),
              ...(rotationNum !== null && { rotation: rotationReverseMap[rotationNum] ?? 'Normal' }),
              ...(bold !== null && { bold }),
              ...(speedNum !== null && { speed: speedReverseMap[speedNum] ?? 'Fast' }),
              ...(gap !== null && { gap }),
              ...(pitch !== null && { pitch }),
            },
          }));
        }
      } catch (e) {
        console.error('[queryPrintSettings] Failed to query settings:', e);
      }
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter]);

  // Reorder printers (for drag-and-drop)
  const reorderPrinters = useCallback((newOrder: Printer[]) => {
    setPrinters(newOrder);
  }, [setPrinters]);

  // Send a raw command to the printer and get response
  // Used for help commands and other queries
  const sendCommand = useCallback(async (command: string): Promise<{ success: boolean; response: string }> => {
    console.log('[sendCommand] Called with:', command);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[sendCommand] Not connected');
      return { success: false, response: 'Not connected to printer' };
    }

    const printer = connectionState.connectedPrinter;

    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      console.log('[sendCommand] Using emulator');
      return emulator.processCommand(command);
    } else if (isElectron || isRelayMode()) {
      try {
        console.log('[sendCommand] Sending:', command);
        const result = await printerTransport.sendCommand(printer.id, command);
        console.log('[sendCommand] Result:', JSON.stringify(result));
        return {
          success: result?.success ?? false,
          response: result?.response ?? '',
        };
      } catch (e) {
        console.error('[sendCommand] Failed:', e);
        return { success: false, response: 'Command failed' };
      }
    } else {
      // Web preview mock
      console.log('[sendCommand] Web preview mock');
      return { success: true, response: 'Web preview - no printer connected' };
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter]);

  // Query printer metrics for any printer (for service popup)
  // This opens a temporary connection if needed
  const queryPrinterMetrics = useCallback(async (printer: Printer): Promise<PrinterMetrics | null> => {
    console.log('[queryPrinterMetrics] Called for printer:', printer.id, printer.ipAddress);

    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      const result = emulator.processCommand('^SU');
      const sdResult = emulator.processCommand('^SD');
      const tpResult = emulator.processCommand('^TP');
      const tmResult = emulator.processCommand('^TM');
      let pTime: Date | null = null;
      if (sdResult.success && sdResult.response) {
        const p = parsePrinterDateTime(sdResult.response.replace(/[^\x20-\x7E]/g, '').trim());
        if (p && !isNaN(p.getTime())) pTime = p;
      }
      let printheadTemp = 0;
      let electronicsTemp = 0;
      if (tpResult.success && tpResult.response) {
        const tempParsed = parseTemperatureResponse(tpResult.response);
        if (tempParsed) {
          printheadTemp = tempParsed.printheadTemp;
          electronicsTemp = tempParsed.electronicsTemp;
        }
      }
      // Parse ^TM for power/stream hours
      let tmPowerStr = '0:00';
      let tmStreamStr = '0:00';
      if (tmResult.success && tmResult.response) {
        const tmSanitized = tmResult.response.replace(/[^\x20-\x7E\r\n]/g, '');
        const tmPowerH = parsePowerHours(tmSanitized);
        const tmPumpH = parsePumpHours(tmSanitized);
        const fmtH = (h: number | null): string => {
          if (h == null) return '0:00';
          const hrs = Math.floor(h);
          const mins = Math.round((h - hrs) * 60);
          return `${hrs}:${mins.toString().padStart(2, '0')}`;
        };
        tmPowerStr = fmtH(tmPowerH);
        tmStreamStr = fmtH(tmPumpH);
      }

      if (result.success && result.response) {
        const parsed = parseStatusResponse(result.response);
        if (parsed) {
          return {
            powerHours: tmPowerStr,
            streamHours: tmStreamStr,
            modulation: parsed.modulation ?? 0,
            viscosity: parsed.viscosity ?? 0,
            charge: parsed.charge ?? 0,
            pressure: parsed.pressure ?? 0,
            rps: parsed.rps ?? 0,
            phaseQual: parsed.phaseQual ?? 0,
            hvDeflection: parsed.hvDeflection ?? false,
            inkLevel: (parsed.inkLevel?.toUpperCase() ?? 'UNKNOWN') as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN',
            makeupLevel: (parsed.makeupLevel?.toUpperCase() ?? 'UNKNOWN') as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN',
            printStatus: parsed.hvDeflection ? 'Ready' : 'Not Ready',
            allowErrors: parsed.allowErrors ?? true,
            errorActive: parsed.errorActive ?? false,
            printheadTemp,
            electronicsTemp,
            subsystems: {
              v300up: parsed.subsystems?.v300up ?? false,
              vltOn: parsed.subsystems?.vltOn ?? false,
              gutOn: parsed.subsystems?.gutOn ?? false,
              modOn: parsed.subsystems?.modOn ?? false,
            },
            printerTime: pTime,
          };
        }
      }
      return mockMetrics;
    } else if (isElectron || isRelayMode()) {
      try {
        // Open temporary connection
        await printerTransport.connect({
          id: printer.id,
          ipAddress: printer.ipAddress,
          port: printer.port,
        });

        const result = await printerTransport.sendCommand(printer.id, '^SU');
        console.log('[queryPrinterMetrics] ^SU response:', result);

        // Also fetch printer time
        let pTime: Date | null = null;
        try {
          const sdResult = await printerTransport.sendCommand(printer.id, '^SD');
          if (sdResult.success && sdResult.response) {
            const cleaned = sdResult.response.replace(/[^\x20-\x7E]/g, '').trim();
            const p = parsePrinterDateTime(cleaned);
            if (p && !isNaN(p.getTime())) pTime = p;
          }
        } catch (e2) {
          console.error('[queryPrinterMetrics] Failed to query ^SD:', e2);
        }

        // Also fetch temperatures
        let printheadTemp = 0;
        let electronicsTemp = 0;
        try {
          const tpResult = await printerTransport.sendCommand(printer.id, '^TP');
          if (tpResult.success && tpResult.response) {
            const tempParsed = parseTemperatureResponse(tpResult.response);
            if (tempParsed) {
              printheadTemp = tempParsed.printheadTemp;
              electronicsTemp = tempParsed.electronicsTemp;
            }
          }
        } catch (e3) {
          console.error('[queryPrinterMetrics] Failed to query ^TP:', e3);
        }
        // Also fetch runtime hours
        let tmPowerStr = '0:00';
        let tmStreamStr = '0:00';
        try {
          const tmResult = await printerTransport.sendCommand(printer.id, '^TM');
          if (tmResult.success && tmResult.response) {
            const tmSanitized = tmResult.response.replace(/[^\x20-\x7E\r\n]/g, '');
            const tmPowerH = parsePowerHours(tmSanitized);
            const tmPumpH = parsePumpHours(tmSanitized);
            const fmtH = (h: number | null): string => {
              if (h == null) return '0:00';
              const hrs = Math.floor(h);
              const mins = Math.round((h - hrs) * 60);
              return `${hrs}:${mins.toString().padStart(2, '0')}`;
            };
            tmPowerStr = fmtH(tmPowerH);
            tmStreamStr = fmtH(tmPumpH);
          }
        } catch (e4) {
          console.error('[queryPrinterMetrics] Failed to query ^TM:', e4);
        }

        if (result.success && result.response) {
          const parsed = parseStatusResponse(result.response);
          if (parsed) {
            return {
              powerHours: tmPowerStr,
              streamHours: tmStreamStr,
              modulation: parsed.modulation ?? 0,
              viscosity: parsed.viscosity ?? 0,
              charge: parsed.charge ?? 0,
              pressure: parsed.pressure ?? 0,
              rps: parsed.rps ?? 0,
              phaseQual: parsed.phaseQual ?? 0,
              hvDeflection: parsed.hvDeflection ?? false,
              inkLevel: (parsed.inkLevel?.toUpperCase() ?? 'UNKNOWN') as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN',
              makeupLevel: (parsed.makeupLevel?.toUpperCase() ?? 'UNKNOWN') as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN',
              printStatus: parsed.hvDeflection ? 'Ready' : 'Not Ready',
              allowErrors: parsed.allowErrors ?? true,
              errorActive: parsed.errorActive ?? false,
              printheadTemp,
              electronicsTemp,
              subsystems: {
                v300up: parsed.subsystems?.v300up ?? false,
                vltOn: parsed.subsystems?.vltOn ?? false,
                gutOn: parsed.subsystems?.gutOn ?? false,
                modOn: parsed.subsystems?.modOn ?? false,
              },
              printerTime: pTime,
            };
          }
        }
        return null;
      } catch (e) {
        console.error('[queryPrinterMetrics] Failed:', e);
        return null;
      }
    } else {
      // Web preview mock
      return mockMetrics;
    }
  }, []);

  // Explicit polling recovery: re-open socket if screens are active but socket died.
  // Called externally (e.g. when dev panel closes) to immediately recover without
  // waiting for the 5-second watchdog interval.
  const refreshPolling = useCallback(() => {
    if (!isElectron && !isRelayMode()) return;
    if (!connectionState.isConnected || !connectedPrinterIdRef.current) return;
    const printerIp = connectedPrinterIpRef.current;
    const printerPort = connectedPrinterPortRef.current ?? 23;
    if (!printerIp) return;
    if (socketReady) return; // Already ready, nothing to do
    console.log('[usePrinterConnection] refreshPolling: attempting socket reconnect');
    printerTransport.connect({ id: connectedPrinterIdRef.current, ipAddress: printerIp, port: printerPort })
      .then(result => {
        if (result.success) {
          console.log('[usePrinterConnection] refreshPolling: reconnect successful');
          setSocketReady(true);
        }
      })
      .catch(e => console.error('[usePrinterConnection] refreshPolling error:', e));
  }, [connectionState.isConnected]);

  // Fetch message content from printer using ^GM and ^LF commands.
  // Returns MessageDetails if successful, null if not connected or commands fail.
  const fetchMessageContent = useCallback(async (messageName: string): Promise<MessageDetails | null> => {
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[fetchMessageContent] Not connected');
      return null;
    }

    const printer = connectionState.connectedPrinter;

    if (shouldUseEmulator()) {
      const emulator = getEmulatorForPrinter(printer.ipAddress, printer.port);
      
      // Select message first so ^GM and ^LF operate on it
      emulator.processCommand(`^SM ${messageName}`);
      
      const gmResult = emulator.processCommand('^GM');
      const lfResult = emulator.processCommand(`^LF ${messageName}`);
      
      const gmParsed = gmResult.success && gmResult.response ? parseGmResponse(gmResult.response) : null;
      const lfParsed = lfResult.success && lfResult.response ? parseLfResponse(lfResult.response, messageName) : [];
      
      if (lfParsed.length === 0) {
        console.log('[fetchMessageContent] No fields parsed for', messageName);
        return null;
      }

      return buildMessageDetails(messageName, lfParsed, gmParsed);
    } else if (isElectron || isRelayMode()) {
      try {
        // Send ^GM for the message (some firmware requires selecting first)
        // Try ^GM <name> first, fall back to ^SM + ^GM
        let gmRaw: string | null = null;
        let lfRaw: string | null = null;

        // Query ^GM (get message params)
        const gmResult = await printerTransport.sendCommand(printer.id, `^GM ${messageName}`);
        if (gmResult?.success && gmResult.response && !isProtocolCommandFailure(gmResult.response)) {
          gmRaw = gmResult.response;
        } else {
          // Fallback: select message, then query without name
          await printerTransport.sendCommand(printer.id, `^SM ${messageName}`);
          await new Promise(r => setTimeout(r, 300));
          const gmRetry = await printerTransport.sendCommand(printer.id, '^GM');
          if (gmRetry?.success && gmRetry.response) gmRaw = gmRetry.response;
        }

        // Query ^LF (list fields)
        const lfResult = await printerTransport.sendCommand(printer.id, `^LF ${messageName}`);
        if (lfResult?.success && lfResult.response && !isProtocolCommandFailure(lfResult.response)) {
          lfRaw = lfResult.response;
        } else {
          // Fallback without name param (assumes message already selected above)
          const lfRetry = await printerTransport.sendCommand(printer.id, '^LF');
          if (lfRetry?.success && lfRetry.response) lfRaw = lfRetry.response;
        }

        console.log('[fetchMessageContent] ^GM raw:', gmRaw);
        console.log('[fetchMessageContent] ^LF raw:', lfRaw);

        if (!lfRaw) {
          console.log('[fetchMessageContent] No ^LF response for', messageName);
          return null;
        }

        const gmParsed = gmRaw ? parseGmResponse(gmRaw) : null;
        const lfParsed = parseLfResponse(lfRaw, messageName);

        if (lfParsed.length === 0) {
          console.log('[fetchMessageContent] No fields parsed for', messageName);
          return null;
        }

        return buildMessageDetails(messageName, lfParsed, gmParsed);
      } catch (e) {
        console.error('[fetchMessageContent] Failed for', messageName, ':', e);
        return null;
      }
    }

    return null;
  }, [connectionState.isConnected, connectionState.connectedPrinter]);

  return {
    printers,
    connectionState,
    activeFaults,
    isChecking,
    availabilityPollingEnabled,
    connect,
    disconnect,
    startPrint,
    stopPrint,
    jetStop,
    jetStart,
    updateSettings,
    selectMessage,
    signIn,
    signOut,
    checkPrinterStatus,
    addPrinter,
    removePrinter,
    updatePrinter,
    reorderPrinters,
    setServiceScreenOpen,
    setControlScreenOpen,
    setAvailabilityPollingEnabled,
    markAllNotReady,
    addMessage,
    createMessageOnPrinter,
    saveMessageContent,
    updateMessage,
    deleteMessage,
    resetCounter,
    resetAllCounters,
    queryCounters,
    saveGlobalAdjust,
    saveMessageSettings,
    queryPrintSettings,
    sendCommand,
    queryPrinterMetrics,
    refreshPolling,
    fetchMessageContent,
    buildMessageCommands,
  };
}
