import { useState, useEffect, useCallback } from 'react';
import { Printer } from '@/types/printer';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';

const STORAGE_KEY = 'codesync-printers';

// Get default printers from emulator when enabled, or single default when disabled
const getDefaultPrinters = (): Printer[] => {
  // Check if we have emulated printers available
  const emulatedPrinters = multiPrinterEmulator.getEmulatedPrinters();
  if (emulatedPrinters.length > 0) {
    return emulatedPrinters.map(ep => ({
      id: ep.id,
      name: ep.name,
      ipAddress: ep.ipAddress,
      port: ep.port,
      isConnected: false,
      isAvailable: true,
      status: ep.status,
      hasActiveErrors: false,
    }));
  }
  
  // Default single printer when emulator is off
  return [
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
};

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
    const hasErrors = (inkLevel?: string, makeupLevel?: string) => {
      return inkLevel === 'LOW' || inkLevel === 'EMPTY' || 
             makeupLevel === 'LOW' || makeupLevel === 'EMPTY';
    };

    // Update all emulated printers from their respective emulator states
    const updateFromEmulators = () => {
      if (!multiPrinterEmulator.enabled) return;
      
      const emulatedPrinters = multiPrinterEmulator.getEmulatedPrinters();
      
      setPrinters(prev => {
        // Create a map of existing printers by IP for quick lookup
        const existingByIp = new Map(prev.map(p => [`${p.ipAddress}:${p.port}`, p]));
        
        // Update existing printers and add new emulated ones
        const updatedPrinters = [...prev];
        
        emulatedPrinters.forEach(ep => {
          const key = `${ep.ipAddress}:${ep.port}`;
          const existing = existingByIp.get(key);
          const instance = multiPrinterEmulator.getInstanceByIp(ep.ipAddress, ep.port);
          const state = instance?.getState();
          
          if (existing) {
            // Update existing printer
            const idx = updatedPrinters.findIndex(p => p.id === existing.id);
            if (idx !== -1) {
              updatedPrinters[idx] = {
                ...existing,
                name: ep.name,
                isAvailable: true,
                status: ep.status,
                hasActiveErrors: state ? hasErrors(state.inkLevel, state.makeupLevel) : false,
                inkLevel: state?.inkLevel,
                makeupLevel: state?.makeupLevel,
                currentMessage: state?.currentMessage,
                printCount: state?.printCount,
              };
            }
          } else {
            // Add new emulated printer
            const newId = updatedPrinters.length > 0 
              ? Math.max(...updatedPrinters.map(p => p.id)) + 1 
              : 1;
            updatedPrinters.push({
              id: newId,
              name: ep.name,
              ipAddress: ep.ipAddress,
              port: ep.port,
              isConnected: false,
              isAvailable: true,
              status: ep.status,
              hasActiveErrors: state ? hasErrors(state.inkLevel, state.makeupLevel) : false,
              inkLevel: state?.inkLevel,
              makeupLevel: state?.makeupLevel,
              currentMessage: state?.currentMessage,
              printCount: state?.printCount,
            });
          }
        });
        
        return updatedPrinters;
      });
    };

    // When emulator is toggled on/off, update printer availability
    const unsubEnabled = multiPrinterEmulator.subscribeToEnabled((enabled) => {
      if (enabled) {
        updateFromEmulators();
      } else {
        // Mark all emulated printers as offline
        setPrinters(prev => prev.map(p => {
          const isEmulated = multiPrinterEmulator.isEmulatedIp(p.ipAddress, p.port);
          if (isEmulated && !p.isConnected) {
            return {
              ...p,
              isAvailable: false,
              status: 'offline' as const,
              hasActiveErrors: false,
              inkLevel: undefined,
              makeupLevel: undefined,
              currentMessage: undefined,
              printCount: undefined,
            };
          }
          return p;
        }));
      }
    });

    // Subscribe to state changes from all emulated printers
    const unsubscribers: (() => void)[] = [];
    const emulatedPrinters = multiPrinterEmulator.getEmulatedPrinters();
    emulatedPrinters.forEach(ep => {
      const unsub = multiPrinterEmulator.subscribe(ep.ipAddress, ep.port, () => {
        updateFromEmulators();
      });
      unsubscribers.push(unsub);
    });

    // Initial sync if emulator is already enabled
    updateFromEmulators();

    return () => {
      unsubEnabled();
      unsubscribers.forEach(unsub => unsub());
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
