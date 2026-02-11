import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Printer, PrinterStatus, PrinterMetrics, PrintMessage, PrintSettings, ConnectionState } from '@/types/printer';
import { usePrinterStorage } from '@/hooks/usePrinterStorage';
import { supabase } from '@/integrations/supabase/client';
import '@/types/electron.d.ts';
import { parseStatusResponse } from '@/lib/printerProtocol';
import { useServiceStatusPolling } from '@/hooks/useServiceStatusPolling';
import { printerEmulator } from '@/lib/printerEmulator';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
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

const mockMessages: PrintMessage[] = [
  { id: 1, name: 'BESTCODE' },
  { id: 2, name: 'BESTCODE-AUTO' },
  { id: 3, name: 'MOBA_00A' },
];

const mockStatus: PrinterStatus = {
  printOn: true,
  makeupGood: true,
  inkFull: true,
  isRunning: false,
  productCount: 0,
  printCount: 0,
  customCounters: [0, 0, 0, 0], // Custom counters 1-4
  currentMessage: null,
  errorMessage: null,
  printerVersion: 'v01.09.00.14',
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

export function usePrinterConnection() {
  const { printers, addPrinter, removePrinter, updatePrinterStatus, updatePrinter, setPrinters } = usePrinterStorage();
  const [isChecking, setIsChecking] = useState(false);
  // Now using ICMP ping instead of TCP, so safe to enable by default
  const [availabilityPollingEnabled, setAvailabilityPollingEnabled] = useState(true);
  // Hysteresis: track consecutive offline counts per printer to prevent flapping
  const offlineCountsRef = useRef<Record<number, number>>({});
  const disconnectRef = useRef<() => void>(() => {});
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    connectedPrinter: null,
    status: null,
    metrics: null,
    settings: defaultSettings,
    messages: [],
  });

  // Check printer availability - uses Electron TCP if available, otherwise cloud function
  const checkPrinterStatus = useCallback(async () => {
    if (!availabilityPollingEnabled) return;
    if (isChecking || printers.length === 0) return;

    // Emulator: keep emulated printers stable "online" and reflect consumable/error state.
    if (shouldUseEmulator()) {
      // Multi-printer emulator: update every emulated IP in the list
      if (multiPrinterEmulator.enabled) {
        const hasErrors = (inkLevel?: string, makeupLevel?: string) =>
          inkLevel === 'LOW' || inkLevel === 'EMPTY' || makeupLevel === 'LOW' || makeupLevel === 'EMPTY';

        printers.forEach((p) => {
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
          });
        });

        return;
      }

      // Single emulator (back-compat): keep Printer 1 online
      const sim = printerEmulator.getSimulatedPrinter();
      if (sim) {
        const state = printerEmulator.getState();
        const hasActiveErrors =
          state.inkLevel === 'LOW' ||
          state.inkLevel === 'EMPTY' ||
          state.makeupLevel === 'LOW' ||
          state.makeupLevel === 'EMPTY';

        updatePrinterStatus(sim.id, {
          isAvailable: true,
          status: sim.status,
          hasActiveErrors,
        });
      }
      return;
    }
    
    setIsChecking(true);
    try {
      // Include ALL printers in availability polling (including the connected one).
      // ICMP ping does not cause the printer UI to flash — only TCP connections do.
      const printerData = printers
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
      } else {
        // Fallback to cloud function (won't work for local network, but keeps the code path)
        const { data, error } = await supabase.functions.invoke('check-printer-status', {
          body: { printers: printerData },
        });

        if (error) {
          console.error('Error checking printer status:', error);
          return;
        }
        results = data?.printers;
      }

      if (results) {
        results.forEach((status: { id: number; isAvailable: boolean; status: string }) => {
          const isConnectedPrinter = connectionState.isConnected && connectionState.connectedPrinter?.id === status.id;

          // Hysteresis: require 3 consecutive offline results before marking offline
          // to prevent UI flapping from intermittent ping failures.
          const OFFLINE_THRESHOLD = 3;
          if (status.isAvailable) {
            // Online: reset counter immediately and mark available
            offlineCountsRef.current[status.id] = 0;
            if (isConnectedPrinter) {
              // Keep existing HV-derived status for connected printer
              updatePrinterStatus(status.id, {
                isAvailable: true,
                status: connectionState.connectedPrinter!.status,
                hasActiveErrors: false,
              });
            } else {
              updatePrinterStatus(status.id, {
                isAvailable: true,
                status: 'not_ready',
                hasActiveErrors: false,
              });
            }
          } else {
            // Offline: increment counter, only mark offline after threshold
            const count = (offlineCountsRef.current[status.id] || 0) + 1;
            offlineCountsRef.current[status.id] = count;
            if (count >= OFFLINE_THRESHOLD) {
              updatePrinterStatus(status.id, {
                isAvailable: false,
                status: 'offline',
                hasActiveErrors: false,
              });
              // Auto-disconnect if the connected printer goes offline
              if (isConnectedPrinter) {
                console.log('[availability] Connected printer went offline, auto-disconnecting');
                disconnectRef.current();
              }
            }
            // else: keep previous state (stays online until threshold reached)
          }
        });
      }
    } catch (err) {
      console.error('Failed to check printer status:', err);
    } finally {
      setIsChecking(false);
    }
  }, [availabilityPollingEnabled, printers, isChecking, updatePrinterStatus, connectionState.isConnected, connectionState.connectedPrinter]);

  // Poll printer status every 5 seconds
  useEffect(() => {
    if (!availabilityPollingEnabled) return;
    if (printers.length === 0) return;
    
    checkPrinterStatus();
    const interval = setInterval(checkPrinterStatus, 5000);
    return () => clearInterval(interval);
  }, [availabilityPollingEnabled, printers.length, checkPrinterStatus]);

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
    console.log('[handleServiceResponse] Parsed ready state (printStatus):', parsed.printStatus, '-> hvOn:', hvOn);

    // Sync the printer's status in the list with the HV state + fluid levels
    const inkLevelCard = (parsed.inkLevel?.toUpperCase() ?? 'UNKNOWN') as Printer['inkLevel'];
    const makeupLevelCard = (parsed.makeupLevel?.toUpperCase() ?? 'UNKNOWN') as Printer['makeupLevel'];
    if (connectedPrinterId) {
      updatePrinterStatus(connectedPrinterId, {
        isAvailable: true,
        status: hvOn ? 'ready' : 'not_ready',
        hasActiveErrors: parsed.errorActive ?? false,
        inkLevel: inkLevelCard,
        makeupLevel: makeupLevelCard,
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
        // IMPORTANT: Preserve currentMessage - it's only updated by selectMessage
        status: prev.status 
          ? { ...prev.status, isRunning: hvOn, inkLevel, makeupLevel } 
          : { ...mockStatus, isRunning: hvOn, inkLevel, makeupLevel, currentMessage: prev.status?.currentMessage ?? mockStatus.currentMessage },
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

  useServiceStatusPolling({
    enabled: shouldPollStatus,
    printerId: connectedPrinterId,
    printerIp: connectionState.connectedPrinter?.ipAddress,
    printerPort: connectionState.connectedPrinter?.port,
    intervalMs: 3000,
    command: '^SU',
    onResponse: handleServiceResponse,
  });

  // Lazy TCP connect: only open the Electron socket while a polling screen is open.
  // This prevents the printer UI from refreshing/flashing immediately on "Connect".
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;
    const printer = connectionState.connectedPrinter;
    if (!connectionState.isConnected || !printer) return;

    let cancelled = false;
    const shouldConnect = serviceScreenOpen || controlScreenOpen;
    console.log('[usePrinterConnection] Lazy connect effect, shouldConnect:', shouldConnect);

    (async () => {
      try {
        if (shouldConnect) {
          console.log('[usePrinterConnection] Opening socket for printer:', printer.id);
          const result = await window.electronAPI.printer.connect({
            id: printer.id,
            ipAddress: printer.ipAddress,
            port: printer.port,
          });
          console.log('[usePrinterConnection] Socket connect result:', result);
        } else {
          console.log('[usePrinterConnection] Closing socket for printer:', printer.id);
          // Close the socket when leaving polling screens to avoid any device-side UI refresh.
          await window.electronAPI.printer.disconnect(printer.id);
        }
      } catch (e) {
        if (!cancelled) console.error('[usePrinterConnection] service socket toggle failed:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [serviceScreenOpen, controlScreenOpen, connectionState.isConnected, connectionState.connectedPrinter]);

  // Query printer status (^SU) and update state - used on connect and after commands
  const queryPrinterStatus = useCallback(async (printer: Printer) => {
    if (!isElectron || !window.electronAPI) return;
    
    try {
      // Ensure socket is connected
      await window.electronAPI.printer.connect({
        id: printer.id,
        ipAddress: printer.ipAddress,
        port: printer.port,
      });
      
      const result = await window.electronAPI.printer.sendCommand(printer.id, '^SU');
      console.log('[queryPrinterStatus] ^SU response:', result);
      
      if (result.success && result.response) {
        const parsed = parseStatusResponse(result.response);
        if (parsed) {
          // Per v2.0 protocol, HVDeflection is the authoritative HV indicator
          const hvOn = parsed.hvDeflection ?? false;
          
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
              ? { ...prev.status, isRunning: hvOn, inkLevel, makeupLevel } 
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
    } catch (e) {
      console.error('[queryPrinterStatus] Failed to query status:', e);
    }
  }, [updatePrinterStatus]);

  // Query message list from printer via ^LM command
  const queryMessageList = useCallback(async (printer: Printer) => {
    if (!isElectron || !window.electronAPI) return;
    try {
      const result = await window.electronAPI.printer.sendCommand(printer.id, '^LM');
      console.log('[queryMessageList] ^LM response:', result);
      if (result.success && result.response) {
        const lines = result.response.split(/[\r\n]+/).filter(Boolean);
        const messageNames: string[] = [];
        for (const line of lines) {
          // Strip non-printable / control characters (garbage bytes from firmware)
          const trimmed = line.replace(/[^\x20-\x7E]/g, '').trim();
          // Skip EOL marker, prompts, command echoes, and status lines
          if (!trimmed || trimmed === '//EOL' || trimmed === '>' || trimmed.startsWith('^')
              || trimmed.includes('COMMAND SUCCESSFUL') || trimmed.includes('COMMAND FAILED')) continue;
          messageNames.push(trimmed.toUpperCase());
        }
        if (messageNames.length > 0) {
          const printerMessages: PrintMessage[] = messageNames.map((name, idx) => ({
            id: idx + 1,
            name,
          }));
          console.log('[queryMessageList] Parsed messages:', printerMessages);
          setConnectionState((prev) => ({
            ...prev,
            messages: printerMessages,
          }));
        }
      }
    } catch (e) {
      console.error('[queryMessageList] Failed to query ^LM:', e);
    }
  }, []);

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
        // Use the specific emulator instance for this printer
        multiInstance.processCommand('^SJ 1'); // Start jet
        
        const emulatorState = multiInstance.getState();
        const simPrinter = multiInstance.getSimulatedPrinter();
        
        // Update printer status
        updatePrinter(printer.id, {
          isConnected: true,
          isAvailable: true,
          status: simPrinter.status,
          hasActiveErrors: false,
        });

        setConnectionState({
          isConnected: true,
          connectedPrinter: { ...printer, isConnected: true },
          status: {
            ...mockStatus,
            isRunning: emulatorState.hvOn,
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
            printStatus: emulatorState.hvOn ? 'Ready' : 'Not ready',
            subsystems: {
              v300up: emulatorState.v300up,
              vltOn: emulatorState.vltOn,
              gutOn: emulatorState.gutOn,
              modOn: emulatorState.modOn,
            },
          },
          settings: defaultSettings,
          messages: mockMessages,
        });
        return;
      }

      // Fall back to single emulator (backward compat)
      printerEmulator.processCommand('^SJ 1');
      
      // Update printer status
      updatePrinter(printer.id, {
        isConnected: true,
        isAvailable: true,
        status: 'not_ready',
        hasActiveErrors: false,
      });

      const emulatorState = printerEmulator.getState();
      setConnectionState({
        isConnected: true,
        connectedPrinter: { ...printer, isConnected: true },
        status: {
          ...mockStatus,
          isRunning: emulatorState.hvOn,
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
        messages: mockMessages,
      });
      return;
    }

    // NOTE: Lazy-connect.
    // Do not open a TCP/Telnet session here; many printers flash/refresh their UI on connect.
    // We only open the socket when the Service screen is active.
    if (!isElectron) {
      // Web preview: keep simulated delay (cannot reach local network printers)
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else if (window.electronAPI?.printer?.setMeta) {
      // Register connection metadata without opening a socket.
      // This allows polling/commands to open on-demand sockets without requiring an upfront connect.
      try {
        await window.electronAPI.printer.setMeta({
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

    // Query initial status, counters, and message list from printer
    if (isElectron) {
      // Small delay to let state update, then query
      setTimeout(async () => {
        queryPrinterStatus(printer);
        // Fetch real counters and message list after short additional delay
        setTimeout(async () => {
          queryMessageList(printer);
          // Query counters via ^CN
          try {
            const cnResult = await window.electronAPI!.printer.sendCommand(printer.id, '^CN');
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
                parts = response.split(',').map((s: string) => parseInt(s.trim(), 10));
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
        }, 300);
      }, 500);
    }
  }, [updatePrinter, queryPrinterStatus, queryMessageList]);

  const disconnect = useCallback(async () => {
    if (isElectron && window.electronAPI && connectionState.connectedPrinter) {
      try {
        await window.electronAPI.printer.disconnect(connectionState.connectedPrinter.id);
      } catch (e) {
        console.error('Failed to disconnect printer:', e);
      }
    }

    if (connectionState.connectedPrinter) {
      updatePrinter(connectionState.connectedPrinter.id, {
        isConnected: false,
      });
    }

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
      // Use emulator
      console.log('[startPrint] Using emulator');
      const result = printerEmulator.processCommand('^PR 1');
      console.log('[startPrint] Emulator result:', result);
      
      // Update state from emulator
      const state = printerEmulator.getState();
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
    } else if (isElectron && window.electronAPI) {
      try {
        // sendCommand uses on-demand sockets, no need to call connect() first
        const tryCommands = ['^PR 1', '^PR1'] as const;
        let lastResult: any = null;

        for (const cmd of tryCommands) {
          console.log('[startPrint] Sending', cmd);
          const result = await window.electronAPI.printer.sendCommand(printer.id, cmd);
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
      // Use emulator
      console.log('[stopPrint] Using emulator');
      const result = printerEmulator.processCommand('^PR 0');
      console.log('[stopPrint] Emulator result:', result);
      
      // Update state from emulator
      const state = printerEmulator.getState();
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
    } else if (isElectron && window.electronAPI) {
      try {
        // sendCommand uses on-demand sockets, no need to call connect() first
        const tryCommands = ['^PR 0', '^PR0'] as const;
        let lastResult: any = null;

        for (const cmd of tryCommands) {
          console.log('[stopPrint] Sending', cmd);
          const result = await window.electronAPI.printer.sendCommand(printer.id, cmd);
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
      // Use emulator
      console.log('[jetStop] Using emulator');
      const result = printerEmulator.processCommand('^SJ 0');
      console.log('[jetStop] Emulator result:', result);
      
      // Update state from emulator
      const state = printerEmulator.getState();
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
    } else if (isElectron && window.electronAPI) {
      try {
        console.log('[jetStop] Sending ^SJ 0');
        const result = await window.electronAPI.printer.sendCommand(printer.id, '^SJ 0');
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
        status: prev.status ? { ...prev.status, isRunning: false } : null,
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
      // Use emulator
      console.log('[selectMessage] Using emulator');
      const result = printerEmulator.processCommand(`^SM ${message.name}`);
      console.log('[selectMessage] Emulator result:', result);
      
      if (result.success) {
        const state = printerEmulator.getState();
        setConnectionState(prev => ({
          ...prev,
          status: prev.status ? { ...prev.status, currentMessage: state.currentMessage } : null,
        }));
        return true;
      }
      return false;
    } else if (isElectron && window.electronAPI) {
      try {
        console.log('[selectMessage] Sending ^SM command:', message.name);
        const result = await window.electronAPI.printer.sendCommand(printer.id, `^SM ${message.name}`);
        console.log('[selectMessage] Result:', JSON.stringify(result));
        
        if (result?.success) {
          setConnectionState(prev => ({
            ...prev,
            status: prev.status ? { ...prev.status, currentMessage: message.name } : null,
          }));
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
      return true;
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter]);

  // Printer sign-in: send ^LG password command
  const signIn = useCallback(async (password: string): Promise<boolean> => {
    console.log('[signIn] Called, isConnected:', connectionState.isConnected, 'printer:', connectionState.connectedPrinter?.id);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[signIn] Not connected, aborting');
      return false;
    }
    
    const printer = connectionState.connectedPrinter;
    
    if (shouldUseEmulator()) {
      // Use emulator
      console.log('[signIn] Using emulator');
      const result = printerEmulator.processCommand(`^LG ${password}`);
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
      console.log('[signOut] Using emulator');
      const result = printerEmulator.processCommand('^LO');
      console.log('[signOut] Emulator result:', result);
      return result.success;
    } else if (isElectron && window.electronAPI) {
      try {
        console.log('[signOut] Sending ^LO command');
        const result = await window.electronAPI.printer.sendCommand(printer.id, '^LO');
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

  // Add a new message to the list (local only)
  const addMessage = useCallback((name: string) => {
    setConnectionState((prev) => {
      const newId = Math.max(0, ...prev.messages.map(m => m.id)) + 1;
      const newMessage: PrintMessage = { id: newId, name };
      return {
        ...prev,
        messages: [...prev.messages, newMessage],
      };
    });
  }, []);

  // Create a new message on the printer via ^NM command
  const createMessageOnPrinter = useCallback(async (name: string): Promise<boolean> => {
    console.log('[createMessageOnPrinter] Called with name:', name);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[createMessageOnPrinter] Not connected');
      return false;
    }
    
    const printer = connectionState.connectedPrinter;
    const command = `^NM ${name}`;
    
    if (shouldUseEmulator()) {
      console.log('[createMessageOnPrinter] Using emulator');
      const result = printerEmulator.processCommand(command);
      console.log('[createMessageOnPrinter] Emulator result:', result);
      
      if (result.success) {
        // Add to local state
        addMessage(name);
        return true;
      }
      return false;
    } else if (isElectron && window.electronAPI) {
      try {
        console.log('[createMessageOnPrinter] Sending ^NM command:', command);
        const result = await window.electronAPI.printer.sendCommand(printer.id, command);
        console.log('[createMessageOnPrinter] Result:', JSON.stringify(result));
        
        if (result?.success) {
          addMessage(name);
          return true;
        }
        return false;
      } catch (e) {
        console.error('[createMessageOnPrinter] Failed to send ^NM command:', e);
        return false;
      }
    } else {
      // Web preview mock
      console.log('[createMessageOnPrinter] Web preview mock');
      addMessage(name);
      return true;
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter, addMessage]);

  // Save message content (fields) to the printer
  // Uses ^CF (Change Field) command: ^CF <msg>,<field>,<type>,<x>,<y>,<font>,<data>
  const saveMessageContent = useCallback(async (
    messageName: string,
    fields: Array<{
      id: number;
      type: string;
      data: string;
      x: number;
      y: number;
      fontSize: string;
    }>
  ): Promise<boolean> => {
    console.log('[saveMessageContent] Called with:', messageName, fields);
    if (!connectionState.isConnected || !connectionState.connectedPrinter) {
      console.log('[saveMessageContent] Not connected');
      return false;
    }

    const printer = connectionState.connectedPrinter;

    // Build commands for each field
    // ^CF message,field_num,type,x,y,font,data
    const commands: string[] = [];
    fields.forEach((field, index) => {
      const fieldNum = index + 1;
      // Map field type to printer type code
      const typeCode = field.type === 'text' ? 'TXT' : 
                       field.type === 'time' ? 'TIM' :
                       field.type === 'date' ? 'DAT' :
                       field.type === 'counter' ? 'CNT' :
                       field.type === 'barcode' ? 'BAR' :
                       field.type === 'logo' ? 'LOG' :
                       'TXT';
      
      // Font name mapping (strip 'Standard' prefix for protocol)
      const fontCode = field.fontSize.replace('Standard', '').replace('High', '');
      
      commands.push(`^CF ${messageName},${fieldNum},${typeCode},${field.x},${field.y},${fontCode},${field.data}`);
    });

    console.log('[saveMessageContent] Commands to send:', commands);

    if (shouldUseEmulator()) {
      console.log('[saveMessageContent] Using emulator');
      // Process all commands
      for (const cmd of commands) {
        const result = printerEmulator.processCommand(cmd);
        console.log('[saveMessageContent] Emulator result for', cmd, ':', result);
      }
      return true;
    } else if (isElectron && window.electronAPI) {
      try {
        // Send all field commands
        for (const cmd of commands) {
          console.log('[saveMessageContent] Sending:', cmd);
          const result = await window.electronAPI.printer.sendCommand(printer.id, cmd);
          console.log('[saveMessageContent] Result:', JSON.stringify(result));
          if (!result?.success) {
            console.error('[saveMessageContent] Command failed:', cmd);
            return false;
          }
        }
        return true;
      } catch (e) {
        console.error('[saveMessageContent] Failed:', e);
        return false;
      }
    } else {
      // Web preview mock - just log
      console.log('[saveMessageContent] Web preview mock - commands:', commands);
      return true;
    }
  }, [connectionState.isConnected, connectionState.connectedPrinter]);

  // Update an existing message
  const updateMessage = useCallback((id: number, name: string) => {
    setConnectionState((prev) => ({
      ...prev,
      messages: prev.messages.map(m => m.id === id ? { ...m, name } : m),
    }));
  }, []);

  // Delete a message
  const deleteMessage = useCallback((id: number) => {
    setConnectionState((prev) => ({
      ...prev,
      messages: prev.messages.filter(m => m.id !== id),
    }));
  }, []);

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
      console.log('[resetCounter] Using emulator, command:', command);
      const result = printerEmulator.processCommand(command);
      console.log('[resetCounter] Emulator result:', result);
      
      // Update local state from emulator - include all counters
      const state = printerEmulator.getState();
      setConnectionState(prev => ({
        ...prev,
        status: prev.status ? {
          ...prev.status,
          productCount: state.productCount,
          printCount: state.printCount,
          customCounters: [...state.customCounters],
        } : null,
      }));
      return true;
    } else if (isElectron && window.electronAPI) {
      try {
        console.log('[resetCounter] Sending', command);
        const result = await window.electronAPI.printer.sendCommand(printer.id, command);
        console.log('[resetCounter] Result:', JSON.stringify(result));
        
        if (!result?.success) {
          console.error('[resetCounter] ^CC command failed:', result?.error);
          return false;
        }
        
        // Query counters via ^CN after a delay to reflect new values
        setTimeout(async () => {
          try {
            const cnResult = await window.electronAPI!.printer.sendCommand(printer.id, '^CN');
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
                parts = response.split(',').map((s: string) => parseInt(s.trim(), 10));
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
      console.log('[queryCounters] Using emulator');
      const result = printerEmulator.processCommand('^CN');
      console.log('[queryCounters] Emulator result:', result);
      
      if (result.success && result.response) {
        // Parse response: "Product,Print,Custom1,Custom2,Custom3,Custom4"
        const parts = result.response.split(',').map(s => parseInt(s.trim(), 10));
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
    } else if (isElectron && window.electronAPI) {
      try {
        console.log('[queryCounters] Sending ^CN');
        const result = await window.electronAPI.printer.sendCommand(printer.id, '^CN');
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
            parts = response.split(',').map((s: string) => parseInt(s.trim(), 10));
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
      console.log('[saveGlobalAdjust] Using emulator');
      for (const cmd of commands) {
        const result = printerEmulator.processCommand(cmd);
        console.log('[saveGlobalAdjust] Emulator result for', cmd, ':', result);
      }
      return true;
    } else if (isElectron && window.electronAPI) {
      try {
        console.log('[saveGlobalAdjust] Sending commands to printer');
        for (const cmd of commands) {
          console.log('[saveGlobalAdjust] Sending:', cmd);
          const result = await window.electronAPI.printer.sendCommand(printer.id, cmd);
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
      console.log('[saveMessageSettings] Using emulator');
      const result = printerEmulator.processCommand(command);
      console.log('[saveMessageSettings] Emulator result:', result);
      return result.success;
    } else if (isElectron && window.electronAPI) {
      try {
        console.log('[saveMessageSettings] Sending:', command);
        const result = await window.electronAPI.printer.sendCommand(printer.id, command);
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
    } else if (isElectron && window.electronAPI) {
      try {
        console.log('[queryPrintSettings] Querying settings from printer');
        const result = await window.electronAPI.printer.sendCommand(printer.id, '^QP');
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
      console.log('[sendCommand] Using emulator');
      return printerEmulator.processCommand(command);
    } else if (isElectron && window.electronAPI) {
      try {
        console.log('[sendCommand] Sending:', command);
        const result = await window.electronAPI.printer.sendCommand(printer.id, command);
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
      // Multi-printer emulator
      if (multiPrinterEmulator.enabled) {
        const instance = multiPrinterEmulator.getInstanceByIp(printer.ipAddress, printer.port);
        if (instance) {
          const result = instance.processCommand('^SU');
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
              };
            }
          }
        }
      }
      // Fallback to single emulator
      const result = printerEmulator.processCommand('^SU');
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
          };
        }
      }
      return mockMetrics;
    } else if (isElectron && window.electronAPI) {
      try {
        // Open temporary connection
        await window.electronAPI.printer.connect({
          id: printer.id,
          ipAddress: printer.ipAddress,
          port: printer.port,
        });

        const result = await window.electronAPI.printer.sendCommand(printer.id, '^SU');
        console.log('[queryPrinterMetrics] ^SU response:', result);

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
