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
  hvDeflection: true,
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
    if (isChecking || printers.length === 0) return;
    
    setIsChecking(true);
    try {
      const printerData = printers.map(p => ({
        id: p.id,
        ipAddress: p.ipAddress,
        port: p.port,
      }));

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
  }, [printers, isChecking, updatePrinterStatus, connectionState.isConnected, connectionState.connectedPrinter]);

  // Poll printer status every 5 seconds
  useEffect(() => {
    if (printers.length === 0) return;
    
    checkPrinterStatus();
    const interval = setInterval(checkPrinterStatus, 5000);
    return () => clearInterval(interval);
  }, [printers.length]);

  // Live Service metrics: poll ^SU while connected (Electron only)
  const connectedPrinterId = connectionState.connectedPrinter?.id ?? null;
  const shouldPollService = useMemo(
    () => Boolean(isElectron && connectionState.isConnected && connectedPrinterId),
    [connectionState.isConnected, connectedPrinterId]
  );

  // Stable callback for service polling – avoids effect churn
  const handleServiceResponse = useCallback((raw: string) => {
    const parsed = parseStatusResponse(raw);
    if (!parsed) return;

    setConnectionState((prev) => {
      const previous = prev.metrics;
      if (!previous) return prev;

      return {
        ...prev,
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
    enabled: shouldPollService,
    printerId: connectedPrinterId,
    intervalMs: 3000, // slower poll to reduce printer display flicker
    command: '^SU',
    onResponse: handleServiceResponse,
  });

  const connect = useCallback(async (printer: Printer) => {
    // Simulate connection
    await new Promise(resolve => setTimeout(resolve, 500));

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
  }, [updatePrinter]);

  const disconnect = useCallback(async () => {
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
    if (!connectionState.status) return;
    setConnectionState(prev => ({
      ...prev,
      status: prev.status ? { ...prev.status, isRunning: true } : null,
    }));
  }, [connectionState.status]);

  const stopPrint = useCallback(async () => {
    if (!connectionState.status) return;
    setConnectionState(prev => ({
      ...prev,
      status: prev.status ? { ...prev.status, isRunning: false } : null,
    }));
  }, [connectionState.status]);

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
    connect,
    disconnect,
    startPrint,
    stopPrint,
    updateSettings,
    selectMessage,
    checkPrinterStatus,
    addPrinter,
    removePrinter,
  };
}
