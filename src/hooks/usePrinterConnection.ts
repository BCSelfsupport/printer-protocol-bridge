import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Printer, PrinterStatus, PrinterMetrics, PrintMessage, PrintSettings, ConnectionState } from '@/types/printer';
import { usePrinterStorage } from '@/hooks/usePrinterStorage';
import { supabase } from '@/integrations/supabase/client';
import '@/types/electron.d.ts';
import { parseStatusResponse, parseTemperatureResponse, parseVersionResponse } from '@/lib/printerProtocol';
import { useServiceStatusPolling } from '@/hooks/useServiceStatusPolling';
import { useSerializedPolling, PollingCommand } from '@/hooks/useSerializedPolling';
import { toast } from 'sonner';
import { printerEmulator } from '@/lib/printerEmulator';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import { printerTransport, isRelayMode } from '@/lib/printerTransport';
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
        // Use Electron's native ICMP ping
        results = await window.electronAPI.printer.checkStatus(printerData);
      } else if (isRelayMode()) {
        // Use relay server on PC for ICMP ping
        results = await printerTransport.checkStatus(printerData);
      } else {
        // No Electron or relay available — cloud functions cannot reach local-network
        // printers (192.168.x.x), so skip polling entirely to avoid false-offline flapping.
        console.debug('[availability] No local transport available, skipping cloud poll');
        return;
      }

      if (results) {
        const currentConnectedId = connectedPrinterIdRef.current;

        // Collect printers that need ^SU queries (non-connected, available)
        const needSuQuery: { id: number; ipAddress: string; port: number }[] = [];

        results.forEach((status: { id: number; isAvailable: boolean; status: string }) => {
          const isConnectedPrinter = currentConnectedId === status.id;

          const OFFLINE_THRESHOLD = 5;
          if (status.isAvailable) {
            offlineCountsRef.current[status.id] = 0;
            if (isConnectedPrinter) {
              const existingPrinter = printersRef.current.find(p => p.id === status.id);
              updatePrinterStatus(status.id, {
                isAvailable: true,
                status: existingPrinter?.status ?? 'not_ready',
                hasActiveErrors: existingPrinter?.hasActiveErrors ?? false,
              });
            } else {
              const pd = printersRef.current.find(p => p.id === status.id);
              if (pd) {
                needSuQuery.push({ id: pd.id, ipAddress: pd.ipAddress, port: pd.port });
              } else {
                updatePrinterStatus(status.id, {
                  isAvailable: true,
                  status: 'not_ready',
                  hasActiveErrors: false,
                });
              }
            }
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

        // Sequentially query ^SU for non-connected available printers.
        // Uses setMeta so sendCommand creates ephemeral sockets (no persistent connect needed).
        const INTER_PRINTER_DELAY_MS = 800;

        for (let idx = 0; idx < needSuQuery.length; idx++) {
          const pd = needSuQuery[idx];

          if (idx > 0) {
            await new Promise(r => setTimeout(r, INTER_PRINTER_DELAY_MS));
          }

          try {
            console.log('[availability] ^SU query for printer', pd.id, pd.ipAddress);
            
            // Register meta so sendCommand can open an ephemeral socket on its own
            await printerTransport.setMeta(pd);
            
            const suResult = await printerTransport.sendCommand(pd.id, '^SU');
            console.log('[availability] ^SU result for', pd.id, ':', JSON.stringify({
              success: suResult.success,
              responseLen: suResult.response?.length,
              response: suResult.response?.substring(0, 400),
              error: suResult.error,
            }));

            if (suResult.success && suResult.response) {
              const parsed = parseStatusResponse(suResult.response);
              if (parsed) {
                const hvOn = parsed.printStatus === 'Ready';
                const inkLvl = (parsed.inkLevel?.toUpperCase() ?? 'UNKNOWN') as Printer['inkLevel'];
                const makeupLvl = (parsed.makeupLevel?.toUpperCase() ?? 'UNKNOWN') as Printer['makeupLevel'];
                const msgName = parsed.currentMessage && parsed.currentMessage !== 'NONE' ? parsed.currentMessage.toUpperCase() : undefined;
                console.log('[availability] ^SU parsed for', pd.id, ':', { inkLvl, makeupLvl, hvOn, msgName });
                if (inkLvl === 'UNKNOWN' || makeupLvl === 'UNKNOWN') {
                  console.warn('[availability] ⚠️ UNKNOWN level for printer', pd.id, '- RAW:\n', suResult.response);
                }
                updatePrinterStatus(pd.id, {
                  isAvailable: true,
                  status: hvOn ? 'ready' : 'not_ready',
                  hasActiveErrors: parsed.errorActive ?? false,
                  inkLevel: inkLvl,
                  makeupLevel: makeupLvl,
                  currentMessage: msgName,
                });
                continue;
              } else {
                console.warn('[availability] ^SU parse null for', pd.id, '- RAW:\n', suResult.response?.substring(0, 500));
              }
            } else {
              console.warn('[availability] ^SU failed for', pd.id, ':', suResult.error);
            }
          } catch (e) {
            console.error('[availability] ^SU exception for printer', pd.id, ':', e);
          }

          // ^SU failed — default to not_ready (never false READY), preserve known levels
          const existing = printersRef.current.find(p => p.id === pd.id);
          updatePrinterStatus(pd.id, {
            isAvailable: true,
            status: 'not_ready',
            hasActiveErrors: false,
            inkLevel: existing?.inkLevel,
            makeupLevel: existing?.makeupLevel,
            currentMessage: existing?.currentMessage,
          });
        }
      }
    } catch (err) {
      console.error('Failed to check printer status:', err);
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, [availabilityPollingEnabled, updatePrinterStatus]);

  // Poll printer status every 5 seconds
  useEffect(() => {
    if (!availabilityPollingEnabled) return;
    if (printersRef.current.length === 0) return;
    
    checkPrinterStatus();
    const interval = setInterval(checkPrinterStatus, 5000);
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

  // Live Service metrics: poll ^SU while connected AND service screen is open (Electron only)
  const connectedPrinterId = connectionState.connectedPrinter?.id ?? null;
  const [serviceScreenOpen, setServiceScreenOpen] = useState(false);
  const [controlScreenOpen, setControlScreenOpen] = useState(false);

  // Poll status when either Service OR Control (Dashboard) screen is open.
  // The actual transport is decided inside useServiceStatusPolling (Electron vs emulator).
  const shouldPollStatus = useMemo(() => {
    const result = Boolean(connectionState.isConnected && connectedPrinterId && (serviceScreenOpen || controlScreenOpen));
    console.log('[usePrinterConnection] shouldPollStatus:', result, {
      isElectron,
      isConnected: connectionState.isConnected,
      connectedPrinterId,
      serviceScreenOpen,
      controlScreenOpen,
    });
    return result;
  }, [connectionState.isConnected, connectedPrinterId, serviceScreenOpen, controlScreenOpen]);

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

    // Sync the printer's status in the list with the HV state + fluid levels
    const inkLevelCard = (parsed.inkLevel?.toUpperCase() ?? 'UNKNOWN') as Printer['inkLevel'];
    const makeupLevelCard = (parsed.makeupLevel?.toUpperCase() ?? 'UNKNOWN') as Printer['makeupLevel'];
    // Extract current message from ^SU if available (ignore "NONE" placeholder)
    const parsedMessage = parsed.currentMessage && parsed.currentMessage !== 'NONE' ? parsed.currentMessage.toUpperCase() : undefined;
    if (connectedPrinterId) {
      updatePrinterStatus(connectedPrinterId, {
        isAvailable: true,
        status: hvOn ? 'ready' : 'not_ready',
        hasActiveErrors: parsed.errorActive ?? false,
        inkLevel: inkLevelCard,
        makeupLevel: makeupLevelCard,
        currentMessage: parsedMessage,
      });
    }

    setConnectionState((prev) => {
      const previous = prev.metrics ?? mockMetrics;

      console.log('[handleServiceResponse] Updating state, previous isRunning:', prev.status?.isRunning, '-> new:', hvOn);

      // Map parsed levels to status-compatible types
      const inkLevel = (parsed.inkLevel?.toUpperCase() ?? 'UNKNOWN') as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN';
      const makeupLevel = (parsed.makeupLevel?.toUpperCase() ?? 'UNKNOWN') as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN';

      return {
        ...prev,
        // Update isRunning and consumable levels based on ^SU response
        // Also update currentMessage if parsed from ^SU (keeps it in sync with printer state)
        status: prev.status 
          ? { ...prev.status, isRunning: hvOn, jetRunning: jetActive, inkLevel, makeupLevel, ...(parsedMessage ? { currentMessage: parsedMessage } : {}) } 
          : { ...mockStatus, isRunning: hvOn, jetRunning: jetActive, inkLevel, makeupLevel, currentMessage: parsedMessage ?? prev.status?.currentMessage ?? mockStatus.currentMessage },
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
        },
      };
    });
  }, [connectedPrinterId, updatePrinterStatus]);

  // Stable callback for ^SD (date/time) polling
  const handleDateTimeResponse = useCallback((raw: string) => {
    const cleaned = raw.replace(/[^\x20-\x7E]/g, '').trim();
    if (!cleaned) return;
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      setConnectionState((prev) => ({
        ...prev,
        status: prev.status ? { ...prev.status, printerTime: parsed } : null,
      }));
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

  // Stable callback for ^CN counter polling – keeps counters live on Dashboard
  const handleCounterResponse = useCallback((raw: string) => {
    let parts: number[] = [];

    if (raw.includes('PC[')) {
      const pcMatch = raw.match(/PC\[(\d+)\]/);
      const prcMatch = raw.match(/PrC\[(\d+)\]/);
      const c1Match = raw.match(/C1\[(\d+)\]/);
      const c2Match = raw.match(/C2\[(\d+)\]/);
      const c3Match = raw.match(/C3\[(\d+)\]/);
      const c4Match = raw.match(/C4\[(\d+)\]/);
      parts = [
        pcMatch ? parseInt(pcMatch[1], 10) : 0,
        prcMatch ? parseInt(prcMatch[1], 10) : 0,
        c1Match ? parseInt(c1Match[1], 10) : 0,
        c2Match ? parseInt(c2Match[1], 10) : 0,
        c3Match ? parseInt(c3Match[1], 10) : 0,
        c4Match ? parseInt(c4Match[1], 10) : 0,
      ];
    } else if (raw.includes('Product Count:')) {
      const productMatch = raw.match(/Product Count:\s*(\d+)/);
      const printMatch = raw.match(/Print Count:\s*(\d+)/);
      const c1Match = raw.match(/Counter 1:\s*(\d+)/);
      const c2Match = raw.match(/Counter 2:\s*(\d+)/);
      const c3Match = raw.match(/Counter 3:\s*(\d+)/);
      const c4Match = raw.match(/Counter 4:\s*(\d+)/);
      parts = [
        productMatch ? parseInt(productMatch[1], 10) : 0,
        printMatch ? parseInt(printMatch[1], 10) : 0,
        c1Match ? parseInt(c1Match[1], 10) : 0,
        c2Match ? parseInt(c2Match[1], 10) : 0,
        c3Match ? parseInt(c3Match[1], 10) : 0,
        c4Match ? parseInt(c4Match[1], 10) : 0,
      ];
    } else if (raw.includes('Product:')) {
      const productMatch = raw.match(/Product:(\d+)/);
      const printMatch = raw.match(/Print:(\d+)/);
      const custom1Match = raw.match(/Custom1:(\d+)/);
      const custom2Match = raw.match(/Custom2:(\d+)/);
      const custom3Match = raw.match(/Custom3:(\d+)/);
      const custom4Match = raw.match(/Custom4:(\d+)/);
      parts = [
        productMatch ? parseInt(productMatch[1], 10) : 0,
        printMatch ? parseInt(printMatch[1], 10) : 0,
        custom1Match ? parseInt(custom1Match[1], 10) : 0,
        custom2Match ? parseInt(custom2Match[1], 10) : 0,
        custom3Match ? parseInt(custom3Match[1], 10) : 0,
        custom4Match ? parseInt(custom4Match[1], 10) : 0,
      ];
    } else {
      parts = raw.split(',').map((s: string) => { const n = parseInt(s.trim(), 10); return isNaN(n) ? 0 : n; });
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
      const printerMessages: PrintMessage[] = messageNames.map((name, idx) => ({ id: idx + 1, name }));
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

  // Build serialized command list: ^SU, ^LM, ^CN, ^TP, ^SD sent sequentially to prevent TCP collisions
  const pollingCommands = useMemo<PollingCommand[]>(() => [
    { command: '^SU', onResponse: handleServiceResponse },
    { command: '^LM', onResponse: handleMessageListResponse },
    { command: '^CN', onResponse: handleCounterResponse },
    { command: '^TP', onResponse: handleTemperatureResponse },
    { command: '^SD', onResponse: handleDateTimeResponse },
  ], [handleServiceResponse, handleMessageListResponse, handleCounterResponse, handleTemperatureResponse, handleDateTimeResponse]);

  // Track whether the TCP socket is confirmed open — gates polling to avoid
  // sending commands before the socket is ready (prevents 8s timeout storms).
  const [socketReady, setSocketReady] = useState(false);

  // Single serialized polling loop — sends all commands sequentially on one socket
  // Only enabled once the socket is confirmed open.
  useSerializedPolling({
    enabled: shouldPollStatus && socketReady,
    printerId: connectedPrinterId,
    printerIp: connectionState.connectedPrinter?.ipAddress,
    printerPort: connectionState.connectedPrinter?.port,
    intervalMs: 3000,
    commands: pollingCommands,
  });

  // Also poll ^SD independently when connected but not on Dashboard/Service
  // so the header clock always updates
  const shouldPollDateTimeOnly = useMemo(() => {
    return Boolean(connectionState.isConnected && connectedPrinterId && !shouldPollStatus && socketReady);
  }, [connectionState.isConnected, connectedPrinterId, shouldPollStatus, socketReady]);

  useServiceStatusPolling({
    enabled: shouldPollDateTimeOnly,
    printerId: connectedPrinterId,
    printerIp: connectionState.connectedPrinter?.ipAddress,
    printerPort: connectionState.connectedPrinter?.port,
    intervalMs: 5000,
    command: '^SD',
    onResponse: handleDateTimeResponse,
  });

  // This prevents the printer UI from refreshing/flashing immediately on "Connect".
  // Sets socketReady=true only after a successful TCP connect.
  useEffect(() => {
    if (!isElectron && !isRelayMode()) return;
    if (!window.electronAPI && !isRelayMode()) return;
    const printer = connectionState.connectedPrinter;
    if (!connectionState.isConnected || !printer) return;

    let cancelled = false;
    const shouldConnect = serviceScreenOpen || controlScreenOpen;
    console.log('[usePrinterConnection] Lazy connect effect, shouldConnect:', shouldConnect);

    if (!shouldConnect) {
      // Screen closed — tear down socket and clear ready flag.
      // Delay the disconnect slightly so any in-flight serialized polling commands
      // can finish before the socket is yanked (prevents 8s timeout errors).
      setSocketReady(false);
      const teardownDelay = setTimeout(() => {
        if (cancelled) return;
        console.log('[usePrinterConnection] Closing socket for printer:', printer.id);
        printerTransport.disconnect(printer.id).catch(e => {
          console.error('[usePrinterConnection] disconnect failed:', e);
        });
      }, 2000);
      return () => { cancelled = true; clearTimeout(teardownDelay); };
    }

    // Screen opened — open socket, then signal ready
    (async () => {
      try {
        console.log('[usePrinterConnection] Opening socket for printer:', printer.id);
        const result = await printerTransport.connect({
          id: printer.id,
          ipAddress: printer.ipAddress,
          port: printer.port,
        });
        console.log('[usePrinterConnection] Socket connect result:', result);
        if (!cancelled && result.success) {
          console.log('[usePrinterConnection] Socket ready, enabling polling');
          setSocketReady(true);
        } else if (!cancelled) {
          console.warn('[usePrinterConnection] Socket connect failed:', result.error);
          setSocketReady(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[usePrinterConnection] service socket toggle failed:', e);
          setSocketReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [serviceScreenOpen, controlScreenOpen, connectionState.isConnected, connectionState.connectedPrinter]);


  // Query printer status (^SU) and update state - used on connect and after commands
  const queryPrinterStatus = useCallback(async (printer: Printer) => {
    if (!isElectron && !isRelayMode()) return;
    
    try {
      // Ensure socket is connected
      await printerTransport.connect({
        id: printer.id,
        ipAddress: printer.ipAddress,
        port: printer.port,
      });
      
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
            hasActiveErrors: parsed.errorActive ?? false,
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
          const parsed_dt = new Date(raw);
          if (!isNaN(parsed_dt.getTime())) {
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
  const prevShouldPollRef = useRef(false);
  useEffect(() => {
    if (shouldPollStatus && !prevShouldPollRef.current && connectionState.connectedPrinter) {
      console.log('[usePrinterConnection] Polling screen opened, re-querying message list');
      // Small delay to let socket fully open
      const timer = setTimeout(() => {
        if (connectionState.connectedPrinter) {
          queryMessageList(connectionState.connectedPrinter);
        }
      }, 800);
      prevShouldPollRef.current = shouldPollStatus;
      return () => clearTimeout(timer);
    }
    prevShouldPollRef.current = shouldPollStatus;
  }, [shouldPollStatus, connectionState.connectedPrinter, queryMessageList]);

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
      return;
    }

    // NOTE: Lazy-connect.
    // Do not open a TCP/Telnet session here; many printers flash/refresh their UI on connect.
    // We only open the socket when the Service screen is active.
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

    setConnectionState({
      isConnected: true,
      connectedPrinter: { ...printer, isConnected: true },
      status: mockStatus,
      metrics: mockMetrics,
      settings: defaultSettings,
      messages: mockMessages,
    });

    // Query initial status, counters, message list, and current message from printer.
    // Open a temporary socket, run all queries sequentially, then close it.
    if (isElectron || isRelayMode()) {
      setTimeout(async () => {
        try {
          // Open socket for the initial burst of queries
          toast.info('🔌 Opening TCP socket...');
          const connectResult = await printerTransport.connect({
            id: printer.id,
            ipAddress: printer.ipAddress,
            port: printer.port,
          });
          toast.info(`🔌 Socket: ${JSON.stringify(connectResult).substring(0, 100)}`);

          // Give printer extra settling time after Telnet handshake before sending commands.
          // Model 88 needs ~1s after socket is ready before it accepts protocol commands.
          await new Promise(r => setTimeout(r, 1000));

          // 1. Query ^SU for HV state, ink/makeup levels, and ready status
          try {
            toast.info('📡 Sending ^SU...');
            const suResult = await printerTransport.sendCommand(printer.id, '^SU');
            console.log('[connect] ^SU response:', suResult);
            toast(suResult.success 
              ? `✅ ^SU response (${suResult.response?.length ?? 0} chars): ${suResult.response?.substring(0, 150) ?? '(empty)'}` 
              : `❌ ^SU failed: ${suResult.error}`, 
              { duration: 15000 });
            if (suResult.success && suResult.response) {
              const parsed = parseStatusResponse(suResult.response);
              if (parsed) {
                const hvOn = parsed.printStatus === 'Ready';
                const jetActive = parsed.subsystems?.vltOn || hvOn;
                const inkLevel = (parsed.inkLevel?.toUpperCase() ?? 'UNKNOWN') as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN';
                const makeupLevel = (parsed.makeupLevel?.toUpperCase() ?? 'UNKNOWN') as 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN';
                const parsedMessage = parsed.currentMessage && parsed.currentMessage !== 'NONE' ? parsed.currentMessage.toUpperCase() : undefined;

                // Update the printer card in the network list
                updatePrinterStatus(printer.id, {
                  isAvailable: true,
                  status: hvOn ? 'ready' : 'not_ready',
                  hasActiveErrors: parsed.errorActive ?? false,
                  inkLevel: inkLevel as Printer['inkLevel'],
                  makeupLevel: makeupLevel as Printer['makeupLevel'],
                  currentMessage: parsedMessage,
                });

                setConnectionState((prev) => ({
                  ...prev,
                  status: prev.status
                    ? { ...prev.status, isRunning: hvOn, jetRunning: jetActive, inkLevel, makeupLevel, ...(parsedMessage ? { currentMessage: parsedMessage } : {}) }
                    : { ...mockStatus, isRunning: hvOn, jetRunning: jetActive, inkLevel, makeupLevel, currentMessage: parsedMessage ?? null },
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
          } catch (e) {
            console.error('[connect] Failed to query ^SU:', e);
            toast.error(`❌ ^SU exception: ${e instanceof Error ? e.message : String(e)}`, { duration: 15000 });
          }

          // 2. Query message list via ^LM
          try {
            await queryMessageList(printer);
          } catch (e) {
            console.error('[connect] Failed to query ^LM:', e);
          }

          // 3. Query current message via ^SM
          // Only needed if ^SU and ^LM didn't already set it
          try {
            const currentFromState = await new Promise<string | null>(resolve => {
              setConnectionState(prev => {
                resolve(prev.status?.currentMessage ?? null);
                return prev; // no change
              });
            });

            if (!currentFromState) {
              const smResult = await printerTransport.sendCommand(printer.id, '^SM');
              console.log('[connect] ^SM raw response:', JSON.stringify(smResult));
              if (smResult?.success && smResult.response) {
                // Strip control chars, command echoes, prompt markers, and status lines
                const lines = smResult.response.split(/[\r\n]+/)
                  .map((l: string) => l.replace(/[^\x20-\x7E]/g, '').trim())
                  .filter((l: string) => l && l !== '>' && !l.startsWith('^') && !l.includes('COMMAND') && !l.includes('Message:'));
                
                const msgName = lines.length > 0 ? lines[lines.length - 1].toUpperCase() : null;
                if (msgName) {
                  console.log('[connect] Current message from ^SM:', msgName);
                  setConnectionState(prev => ({
                    ...prev,
                    status: prev.status ? { ...prev.status, currentMessage: msgName } : null,
                  }));
                  updatePrinter(printer.id, { currentMessage: msgName });
                }
              }
            } else {
              console.log('[connect] Current message already set from ^SU/^LM:', currentFromState);
            }
          } catch (e) {
            console.error('[connect] Failed to query ^SM:', e);
          }

          // 4. Query counters via ^CN
          try {
            const cnResult = await printerTransport.sendCommand(printer.id, '^CN');
            if (cnResult?.success && cnResult.response) {
              const response = cnResult.response;
              let parts: number[] = [];
              if (response.includes('Product:')) {
                const pm = response.match(/Product:(\d+)/);
                const prm = response.match(/Print:(\d+)/);
                const c1 = response.match(/Custom1:(\d+)/);
                const c2 = response.match(/Custom2:(\d+)/);
                const c3 = response.match(/Custom3:(\d+)/);
                const c4 = response.match(/Custom4:(\d+)/);
                parts = [
                  pm ? parseInt(pm[1], 10) : 0, prm ? parseInt(prm[1], 10) : 0,
                  c1 ? parseInt(c1[1], 10) : 0, c2 ? parseInt(c2[1], 10) : 0,
                  c3 ? parseInt(c3[1], 10) : 0, c4 ? parseInt(c4[1], 10) : 0,
                ];
              } else {
                parts = response.split(',').map((s: string) => { const n = parseInt(s.trim(), 10); return isNaN(n) ? 0 : n; });
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
              }
            }
          } catch (e) {
            console.error('[connect] Failed to query ^CN:', e);
          }

          // 5. Query firmware version via ^VV
          try {
            const vvResult = await printerTransport.sendCommand(printer.id, '^VV');
            console.log('[connect] ^VV response:', vvResult);
            if (vvResult?.success && vvResult.response) {
              const version = parseVersionResponse(vvResult.response);
              if (version) {
                console.log('[connect] Firmware version:', version);
                setConnectionState(prev => ({
                  ...prev,
                  status: prev.status ? { ...prev.status, printerVersion: version } : null,
                }));
              }
            }
          } catch (e) {
            console.error('[connect] Failed to query ^VV:', e);
          }

          // 6. Query printer date/time via ^SD
          try {
            const sdResult = await printerTransport.sendCommand(printer.id, '^SD');
            if (sdResult?.success && sdResult.response) {
              const raw = sdResult.response.replace(/[^\x20-\x7E]/g, '').trim();
              const parsed_dt = new Date(raw);
              if (!isNaN(parsed_dt.getTime())) {
                setConnectionState(prev => ({
                  ...prev,
                  status: prev.status ? { ...prev.status, printerTime: parsed_dt } : null,
                }));
              }
            }
          } catch (e) {
            console.error('[connect] Failed to query ^SD:', e);
          }

          // NOTE: Do NOT close the socket here. The lazy-connect effect (below)
          // manages the socket lifecycle based on controlScreenOpen / serviceScreenOpen.
          // Previously this used stale closure values (always false) and would kill the
          // socket that lazy-connect had already opened, breaking all polling.
          console.log('[connect] Initial queries done, socket left open for polling');
          toast.success('✅ Initial query burst complete');
        } catch (e) {
          console.error('[connect] Initial query burst failed:', e);
          toast.error(`❌ Connect burst failed: ${e instanceof Error ? e.message : String(e)}`, { duration: 15000 });
        }
      }, 500);
    }
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
      ...prev,
      settings: { ...prev.settings, ...newSettings },
    }));
  }, []);

  const selectMessage = useCallback(async (message: PrintMessage): Promise<boolean> => {
    console.log('[selectMessage] Called, message:', message.name, 'isConnected:', connectionState.isConnected);
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
        
        if (result?.success) {
          setConnectionState(prev => ({
            ...prev,
            status: prev.status ? { ...prev.status, currentMessage: message.name } : null,
          }));
          updatePrinter(printer.id, { currentMessage: message.name });
          return true;
        }
        return false;
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

  // Build field subcommand for ^NM (per v2.6 spec section 5.33.2)
  const buildFieldSubcommand = (field: {
    id: number;
    type: string;
    data: string;
    x: number;
    y: number;
    fontSize: string;
    bold?: number;
    gap?: number;
  }, fieldNum: number): string => {
    const fontCode = fontToProtocolCode(field.fontSize);
    
    switch (field.type) {
      case 'text':
      case 'userdefine':
        // ^AT n; x; y; s; data
        return `^AT${fieldNum};${field.x};${field.y};${fontCode};${field.data}`;
      case 'date':
        // ^AD n; x; y; s; d (default to date type 12 = MM/DD/YY with delimiters)
        return `^AD${fieldNum};${field.x};${field.y};${fontCode};12`;
      case 'time':
        // ^AH n; x; y; s; t (default to time type 7 = HH:MM:SS with delimiters)
        return `^AH${fieldNum};${field.x};${field.y};${fontCode};7`;
      case 'counter':
        // ^AC n; x; y; s; c (default to print counter = 0)
        return `^AC${fieldNum};${field.x};${field.y};${fontCode};0`;
      case 'barcode':
        // ^AB n; x; y; f; t; m; r; data (default Code128, auto checksum, human readable)
        return `^AB${fieldNum};${field.x};${field.y};${fontCode};6;0;1;${field.data}`;
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
  // For existing messages: ^DM name first, then ^NM to recreate
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
    }>,
    templateValue?: string,
    isNew?: boolean,
  ): Promise<boolean> => {
    console.log('[saveMessageContent] Called with:', messageName, fields, 'template:', templateValue, 'isNew:', isNew);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[saveMessageContent] Not connected');
      return false;
    }

    if (fields.length === 0) {
      console.log('[saveMessageContent] No fields to save');
      return false;
    }

    const printer = connectionState.connectedPrinter;
    const templateCode = templateToProtocolCode(templateValue);
    
    // Convert absolute 32-dot canvas Y coordinates to template-relative Y coordinates.
    // The canvas places the template area at the bottom of a 32-dot grid, so a 7-dot
    // template starts at y=25 (32-7). The printer expects y=0 for the top of the template.
    const templateHeight = (() => {
      if (!templateValue) return 32;
      // Single-line templates: '7', '9', '16', etc.
      const parsed = parseInt(templateValue);
      if (!isNaN(parsed)) return parsed;
      // Multi-line templates: 'multi-2x7' → height from known map
      const multiHeightMap: Record<string, number> = {
        'multi-5x5': 29, 'multi-4x7': 31, 'multi-4x5': 23,
        'multi-3x9': 29, 'multi-3x7': 23,
        'multi-2x12': 25, 'multi-2x9': 19, 'multi-2x7': 16, 'multi-2x5': 11,
      };
      return multiHeightMap[templateValue] ?? 32;
    })();
    const blockedRows = 32 - templateHeight;
    
    // Build field subcommands with corrected coordinates
    const fieldSubcommands = fields.map((field, index) => 
      buildFieldSubcommand({
        ...field,
        y: field.y - blockedRows, // Convert to template-relative Y
      }, index + 1)
    ).join('');

    // Build the full ^NM command: ^NM t;s;o;p;name^AT1;...^AT2;...
    // Speed=0 (Fast), Orientation=0 (Normal), Mode=0 (Normal) as defaults
    const nmCommand = `^NM ${templateCode};0;0;0;${messageName}${fieldSubcommands}`;
    
    console.log('[saveMessageContent] ^NM command:', nmCommand);

    // For existing messages, delete first then recreate
    const commands: string[] = [];
    if (!isNew) {
      commands.push(`^DM ${messageName}`);
    }
    commands.push(nmCommand);

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
      try {
        for (const cmd of commands) {
          console.log('[saveMessageContent] Sending:', cmd);
          const result = await printerTransport.sendCommand(printer.id, cmd);
          console.log('[saveMessageContent] Result:', JSON.stringify(result));
          // Don't fail on ^DM error (message might not exist yet)
          if (!result?.success && !cmd.startsWith('^DM')) {
            console.error('[saveMessageContent] Command failed:', cmd);
            return false;
          }
        }
        addMessage(messageName);
        return true;
      } catch (e) {
        console.error('[saveMessageContent] Failed:', e);
        return false;
      }
    } else {
      // Web preview mock
      console.log('[saveMessageContent] Web preview mock - commands:', commands);
      return true;
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter, addMessage]);

  // Update an existing message
  const updateMessage = useCallback((id: number, name: string) => {
    setConnectionState((prev) => ({
      ...prev,
      messages: prev.messages.map(m => m.id === id ? { ...m, name } : m),
    }));
  }, []);

  // Delete a message — also sends ^DM to the printer/emulator
  const deleteMessage = useCallback(async (id: number) => {
    // Find message name before removing from state
    const msg = connectionState.messages.find(m => m.id === id);
    const msgName = msg?.name;

    // Remove from local state
    setConnectionState((prev) => ({
      ...prev,
      messages: prev.messages.filter(m => m.id !== id),
    }));

    // Send ^DM to printer/emulator
    if (msgName && connectionState.isConnected && connectionState.connectedPrinter) {
      const command = `^DM ${msgName}`;
      console.log('[deleteMessage] Sending:', command);

      if (shouldUseEmulator()) {
        const emulator = getEmulatorForPrinter(
          connectionState.connectedPrinter.ipAddress,
          connectionState.connectedPrinter.port,
        );
        emulator.processCommand(command);
      } else if (isElectron || isRelayMode()) {
        try {
          const result = await printerTransport.sendCommand(
            connectionState.connectedPrinter.id,
            command,
          );
          console.log('[deleteMessage] ^DM result:', result);
        } catch (e) {
          console.error('[deleteMessage] Failed to send ^DM:', e);
        }
      }
    }
  }, [connectionState.messages, connectionState.isConnected, connectionState.connectedPrinter]);

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
      }
      return true;
    } else if (isElectron || isRelayMode()) {
      try {
        console.log('[saveGlobalAdjust] Sending commands to printer');
        for (const cmd of commands) {
          console.log('[saveGlobalAdjust] Sending:', cmd);
          const result = await printerTransport.sendCommand(printer.id, cmd);
          console.log('[saveGlobalAdjust] Result:', JSON.stringify(result));
          
          if (!result?.success) {
            console.error('[saveGlobalAdjust] Command failed:', cmd, result?.error);
            // Continue with other commands even if one fails
          }
        }
        return true;
      } catch (e) {
        console.error('[saveGlobalAdjust] Failed to save settings:', e);
        return false;
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
    printMode?: 'Normal' | 'Auto' | 'Repeat' | 'Reverse';
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
      let pTime: Date | null = null;
      if (sdResult.success && sdResult.response) {
        const p = new Date(sdResult.response.replace(/[^\x20-\x7E]/g, '').trim());
        if (!isNaN(p.getTime())) pTime = p;
      }
      if (result.success && result.response) {
        const parsed = parseStatusResponse(result.response);
        if (parsed) {
          return {
            powerHours: parsed.powerHours ?? '0:00',
            streamHours: parsed.streamHours ?? '0:00',
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
            printheadTemp: parsed.printheadTemp ?? 0,
            electronicsTemp: parsed.electronicsTemp ?? 0,
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
            const p = new Date(cleaned);
            if (!isNaN(p.getTime())) pTime = p;
          }
        } catch (e2) {
          console.error('[queryPrinterMetrics] Failed to query ^SD:', e2);
        }

        if (result.success && result.response) {
          const parsed = parseStatusResponse(result.response);
          if (parsed) {
            return {
              powerHours: parsed.powerHours ?? '0:00',
              streamHours: parsed.streamHours ?? '0:00',
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
              printheadTemp: parsed.printheadTemp ?? 0,
              electronicsTemp: parsed.electronicsTemp ?? 0,
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

  return {
    printers,
    connectionState,
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
  };
}
