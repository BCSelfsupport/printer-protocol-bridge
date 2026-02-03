import { useState, useCallback, useEffect } from 'react';
import { Printer, PrinterStatus, PrinterMetrics, PrintMessage, PrintSettings, ConnectionState } from '@/types/printer';
import { supabase } from '@/integrations/supabase/client';

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

const initialPrinters: Printer[] = [
  { id: 1, name: 'Printer 1', ipAddress: '192.168.1.55', port: 23, isConnected: false, isAvailable: false, status: 'offline', hasActiveErrors: false },
  { id: 2, name: 'Printer 2', ipAddress: '192.168.1.53', port: 23, isConnected: false, isAvailable: false, status: 'offline', hasActiveErrors: false },
  { id: 3, name: 'Printer 3', ipAddress: '192.168.1.57', port: 23, isConnected: false, isAvailable: false, status: 'offline', hasActiveErrors: false },
  { id: 4, name: 'Printer 4', ipAddress: '192.168.1.54', port: 23, isConnected: false, isAvailable: false, status: 'offline', hasActiveErrors: false },
];

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
};

export function usePrinterConnection() {
  const [printers, setPrinters] = useState<Printer[]>(initialPrinters);
  const [isChecking, setIsChecking] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    connectedPrinter: null,
    status: null,
    metrics: null,
    settings: defaultSettings,
    messages: [],
  });

  // Check printer availability via edge function
  const checkPrinterStatus = useCallback(async () => {
    if (isChecking) return;
    
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-printer-status', {
        body: {
          printers: printers.map(p => ({
            id: p.id,
            ipAddress: p.ipAddress,
            port: p.port,
          })),
        },
      });

      if (error) {
        console.error('Error checking printer status:', error);
        return;
      }

      if (data?.printers) {
        setPrinters(prev => prev.map(printer => {
          const status = data.printers.find((s: { id: number }) => s.id === printer.id);
          if (status) {
            return {
              ...printer,
              isAvailable: status.isAvailable,
              status: status.status,
              hasActiveErrors: status.status === 'error',
            };
          }
          return printer;
        }));
      }
    } catch (err) {
      console.error('Failed to check printer status:', err);
    } finally {
      setIsChecking(false);
    }
  }, [printers, isChecking]);

  // Poll printer status every 5 seconds
  useEffect(() => {
    checkPrinterStatus();
    const interval = setInterval(checkPrinterStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const connect = useCallback(async (printer: Printer) => {
    // Simulate connection
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setPrinters(prev => prev.map(p => ({
      ...p,
      isConnected: p.id === printer.id,
    })));

    setConnectionState({
      isConnected: true,
      connectedPrinter: { ...printer, isConnected: true },
      status: mockStatus,
      metrics: mockMetrics,
      settings: defaultSettings,
      messages: mockMessages,
    });
  }, []);

  const disconnect = useCallback(async () => {
    setPrinters(prev => prev.map(p => ({ ...p, isConnected: false })));
    setConnectionState({
      isConnected: false,
      connectedPrinter: null,
      status: null,
      metrics: null,
      settings: defaultSettings,
      messages: [],
    });
  }, []);

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
  };
}
