import { useState, useCallback, useEffect, useMemo } from 'react';
import { Printer, PrinterStatus, PrinterMetrics, PrintMessage, PrintSettings, ConnectionState } from '@/types/printer';
import { usePrinterStorage } from '@/hooks/usePrinterStorage';
import { supabase } from '@/integrations/supabase/client';
import '@/types/electron.d.ts';
import { parseStatusResponse } from '@/lib/printerProtocol';
import { useServiceStatusPolling } from '@/hooks/useServiceStatusPolling';

const defaultSettings: PrintSettings = {
  width: 15,
  height: 8,
  delay: 100,
  rotation: 'Normal',
  bold: 0,
  speed: 'Fast',
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
  productCount: 8,
  printCount: 0,
  currentMessage: 'BC-GEN2',
  errorMessage: 'Message name can not be loaded',
  printerVersion: 'v01.09.00.14',
  printerTime: new Date(),
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
  subsystems: {
    v300up: false,
    vltOn: false,
    gutOn: false,
    modOn: false,
  },
};

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

export function usePrinterConnection() {
  const { printers, addPrinter, removePrinter, updatePrinterStatus, updatePrinter } = usePrinterStorage();
  const [isChecking, setIsChecking] = useState(false);
  // Now using ICMP ping instead of TCP, so safe to enable by default
  const [availabilityPollingEnabled, setAvailabilityPollingEnabled] = useState(true);
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
    
    setIsChecking(true);
    try {
      // IMPORTANT: never query the currently-connected printer in the background.
      // Many printers visibly refresh their UI on status queries.
      const connectedId = connectionState.connectedPrinter?.id ?? null;
      const printerData = printers
        .filter((p) => p.id !== connectedId)
        .map((p) => ({
          id: p.id,
          ipAddress: p.ipAddress,
          port: p.port,
        }));

      // If the only printer in the list is currently connected, there's nothing to poll.
      if (printerData.length === 0) return;

      let results;

      if (isElectron && window.electronAPI) {
        // Use Electron's native TCP sockets
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
          // If we're actively connected to this printer, don't let background polling mark it offline.
          if (connectionState.isConnected && connectionState.connectedPrinter?.id === status.id) {
            updatePrinterStatus(status.id, {
              isAvailable: true,
              status: 'ready',
              hasActiveErrors: false,
            });
            return;
          }

          updatePrinterStatus(status.id, {
            isAvailable: status.isAvailable,
            status: status.status as Printer['status'],
            hasActiveErrors: status.status === 'error',
          });
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

  // Poll status when either Service OR Control (Dashboard) screen is open
  const shouldPollStatus = useMemo(() => {
    const result = Boolean(isElectron && connectionState.isConnected && connectedPrinterId && (serviceScreenOpen || controlScreenOpen));
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

    // Per v2.0 protocol, HVDeflection is the authoritative HV indicator (1=ON, 0=OFF).
    // V300UP may remain at 1 even when HV is toggled off.
    const hvOn = parsed.hvDeflection ?? false;
    console.log('[handleServiceResponse] Parsed HV state (hvDeflection):', hvOn, 'raw hvDeflection:', parsed.hvDeflection);

    setConnectionState((prev) => {
      const previous = prev.metrics ?? mockMetrics;

      console.log('[handleServiceResponse] Updating state, previous isRunning:', prev.status?.isRunning, '-> new:', hvOn);

      return {
        ...prev,
        // Update isRunning based on V300UP (HV status) from printer
        status: prev.status ? { ...prev.status, isRunning: hvOn } : { ...mockStatus, isRunning: hvOn },
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
          subsystems: parsed.subsystems ?? previous.subsystems,
        },
      };
    });
  }, []);

  useServiceStatusPolling({
    enabled: shouldPollStatus,
    printerId: connectedPrinterId,
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
          
          setConnectionState((prev) => ({
            ...prev,
            status: prev.status ? { ...prev.status, isRunning: hvOn } : null,
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
              subsystems: parsed.subsystems ?? prev.metrics.subsystems,
            } : null,
          }));
        }
      }
    } catch (e) {
      console.error('[queryPrinterStatus] Failed to query status:', e);
    }
  }, []);

  const connect = useCallback(async (printer: Printer) => {
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
      status: 'ready',
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

    // Query initial status from printer (get real HV state)
    if (isElectron) {
      // Small delay to let state update, then query
      setTimeout(() => queryPrinterStatus(printer), 500);
    }
  }, [updatePrinter, queryPrinterStatus]);

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
    if (isElectron && window.electronAPI) {
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
  }, [connectionState.isConnected, connectionState.connectedPrinter, queryPrinterStatus]);

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
    if (isElectron && window.electronAPI) {
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
  }, [connectionState.isConnected, connectionState.connectedPrinter, queryPrinterStatus]);

  const updateSettings = useCallback((newSettings: Partial<PrintSettings>) => {
    setConnectionState(prev => ({
      ...prev,
      settings: { ...prev.settings, ...newSettings },
    }));
  }, []);

  const selectMessage = useCallback(async (message: PrintMessage) => {
    setConnectionState(prev => ({
      ...prev,
      status: prev.status ? { ...prev.status, currentMessage: message.name } : null,
    }));
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
    updateSettings,
    selectMessage,
    checkPrinterStatus,
    addPrinter,
    removePrinter,
    setServiceScreenOpen,
    setControlScreenOpen,
    setAvailabilityPollingEnabled,
    markAllNotReady,
  };
}
