import { useState, useEffect, useCallback } from 'react';
import { Printer } from '@/types/printer';
import { printerEmulator } from '@/lib/printerEmulator';

const STORAGE_KEY = 'codesync-printers';

const getDefaultPrinters = (): Printer[] => [
  {
    id: 1,
    name: 'Printer 1',
    ipAddress: '192.168.1.55',
    port: 23,
    isConnected: false,
    isAvailable: false,
    status: 'offline',
    hasActiveErrors: false,
  },
];

export function usePrinterStorage() {
  const [printers, setPrinters] = useState<Printer[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load printers from storage:', e);
    }
    return getDefaultPrinters();
  });

  // Subscribe to emulator state changes to update simulated printer status
  useEffect(() => {
    // Helper to determine if there are active errors based on fluid levels
    const hasErrors = (state: { inkLevel: string; makeupLevel: string }) => {
      return state.inkLevel === 'LOW' || state.inkLevel === 'EMPTY' || 
             state.makeupLevel === 'LOW' || state.makeupLevel === 'EMPTY';
    };

    // Update printer 1 from emulator state
    const updateFromEmulator = () => {
      if (!printerEmulator.enabled) return;
      
      const state = printerEmulator.getState();
      const simulated = printerEmulator.getSimulatedPrinter();
      
      setPrinters(prev => prev.map(p => {
        if (p.id === 1) {
          return {
            ...p,
            isAvailable: true,
            status: simulated?.status ?? (state.hvOn ? 'ready' : 'not_ready'),
            hasActiveErrors: hasErrors(state),
            inkLevel: state.inkLevel,
            makeupLevel: state.makeupLevel,
            currentMessage: state.currentMessage,
            printCount: state.printCount,
          };
        }
        return p;
      }));
    };

    // When emulator is toggled on/off, update printer 1 availability
    const unsubEnabled = printerEmulator.subscribeToEnabled((enabled) => {
      if (enabled) {
        updateFromEmulator();
      } else {
        setPrinters(prev => prev.map(p => {
          if (p.id === 1 && !p.isConnected) {
            return {
              ...p,
              isAvailable: false,
              status: 'offline',
              hasActiveErrors: false,
              inkLevel: undefined,
              makeupLevel: undefined,
              currentMessage: undefined,
            };
          }
          return p;
        }));
      }
    });

    // Subscribe to ALL emulator state changes
    const unsubState = printerEmulator.subscribe(() => {
      updateFromEmulator();
    });

    // Initial sync if emulator is already enabled
    updateFromEmulator();

    return () => {
      unsubEnabled();
      unsubState();
    };
  }, []);

  // Persist to localStorage whenever printers change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(printers));
    } catch (e) {
      console.error('Failed to save printers to storage:', e);
    }
  }, [printers]);

  const addPrinter = useCallback((printer: Omit<Printer, 'id' | 'isConnected' | 'isAvailable' | 'status' | 'hasActiveErrors'>) => {
    setPrinters(prev => {
      const newId = prev.length > 0 ? Math.max(...prev.map(p => p.id)) + 1 : 1;
      const newPrinter: Printer = {
        id: newId,
        name: printer.name,
        ipAddress: printer.ipAddress,
        port: printer.port,
        isConnected: false,
        isAvailable: false,
        status: 'offline',
        hasActiveErrors: false,
      };
      return [...prev, newPrinter];
    });
  }, []);

  const removePrinter = useCallback((printerId: number) => {
    setPrinters(prev => prev.filter(p => p.id !== printerId));
  }, []);

  const updatePrinter = useCallback((printerId: number, updates: Partial<Printer>) => {
    setPrinters(prev => prev.map(p => 
      p.id === printerId ? { ...p, ...updates } : p
    ));
  }, []);

  const updatePrinterStatus = useCallback((printerId: number, status: Pick<Printer, 'isAvailable' | 'status' | 'hasActiveErrors'>) => {
    setPrinters(prev => prev.map(p => 
      p.id === printerId ? { ...p, ...status } : p
    ));
  }, []);

  return {
    printers,
    setPrinters,
    addPrinter,
    removePrinter,
    updatePrinter,
    updatePrinterStatus,
  };
}
