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
        let parsed: Printer[] = JSON.parse(stored);
        // If not in emulator mode, reset all printers to offline on load.
        // Actual availability will be determined by polling once a transport is available.
        const isEmulator = multiPrinterEmulator.enabled;
        if (!isEmulator) {
          parsed = parsed.map(p => ({
            ...p,
            isAvailable: false,
            status: 'offline' as const,
            hasActiveErrors: false,
            inkLevel: undefined,
            makeupLevel: undefined,
            currentMessage: undefined,
            printCount: undefined,
          }));
        }
        return parsed;
      }
    } catch (e) {
      console.error('Failed to load printers from storage:', e);
    }
    return getDefaultPrinters();
  });

  // Subscribe to emulator state changes to update simulated printer status
  useEffect(() => {
    // Helper to determine if there are active errors based on fluid levels
    // Only EMPTY triggers errors — LOW is a warning but printer remains operational
    const hasErrors = (inkLevel?: string, makeupLevel?: string) => {
      return inkLevel === 'EMPTY' || makeupLevel === 'EMPTY';
    };

    // Update all emulated printers from their respective emulator states
    const updateFromEmulators = () => {
      if (!multiPrinterEmulator.enabled) return;
      
      // Get all emulated printer configs
      const emulatedConfigs = [
        { ipAddress: '192.168.1.55', port: 23 },
        { ipAddress: '192.168.1.56', port: 23 },
        { ipAddress: '192.168.1.57', port: 23 },
        { ipAddress: '192.168.1.58', port: 23 },
        { ipAddress: '192.168.1.100', port: 23 },
        { ipAddress: '192.168.1.101', port: 23 },
      ];
      
      setPrinters(prev => {
        // Create a map of existing printers by IP:port for quick lookup
        const existingByKey = new Map(prev.map(p => [`${p.ipAddress}:${p.port}`, p]));
        
        // Start with updated existing printers
        const updatedPrinters = prev.map(p => {
          const instance = multiPrinterEmulator.getInstanceByIp(p.ipAddress, p.port);
          if (instance) {
            const state = instance.getState();
            const simPrinter = instance.getSimulatedPrinter();
            return {
              ...p,
              isAvailable: true,
              status: simPrinter.status,
              hasActiveErrors: hasErrors(state?.inkLevel, state?.makeupLevel),
              inkLevel: state?.inkLevel,
              makeupLevel: state?.makeupLevel,
              currentMessage: state?.currentMessage,
              printCount: state?.printCount,
            };
          }
          return p;
        });
        
        // Add any missing emulated printers
        emulatedConfigs.forEach(cfg => {
          const key = `${cfg.ipAddress}:${cfg.port}`;
          if (!existingByKey.has(key)) {
            const instance = multiPrinterEmulator.getInstanceByIp(cfg.ipAddress, cfg.port);
            if (instance) {
              const state = instance.getState();
              const simPrinter = instance.getSimulatedPrinter();
              const newId = updatedPrinters.length > 0 
                ? Math.max(...updatedPrinters.map(p => p.id)) + 1 
                : 1;
              updatedPrinters.push({
                id: newId,
                name: simPrinter.name,
                ipAddress: cfg.ipAddress,
                port: cfg.port,
                isConnected: false,
                isAvailable: true,
                status: simPrinter.status,
                hasActiveErrors: hasErrors(state?.inkLevel, state?.makeupLevel),
                inkLevel: state?.inkLevel,
                makeupLevel: state?.makeupLevel,
                currentMessage: state?.currentMessage,
                printCount: state?.printCount,
              });
            }
          }
        });
        
        return updatedPrinters;
      });
    };

    // When emulator is toggled on/off, update printer availability
    const unsubEnabled = multiPrinterEmulator.subscribeToEnabled((enabled) => {
      if (enabled) {
        // Immediately update all matching printers
        updateFromEmulators();
      } else {
        // Mark all emulated printers as offline
        setPrinters(prev => prev.map(p => {
        // Check against known emulated IPs
        const knownEmulatedIps = ['192.168.1.55', '192.168.1.56', '192.168.1.57', '192.168.1.58', '192.168.1.100', '192.168.1.101'];
          const isEmulated = knownEmulatedIps.includes(p.ipAddress);
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

    // Subscribe to state changes from all potential emulated printers
    // We subscribe even before enabled - the callbacks will check enabled state
    const unsubscribers: (() => void)[] = [];
    const knownEmulatedIps = [
      { ipAddress: '192.168.1.55', port: 23 },
      { ipAddress: '192.168.1.56', port: 23 },
      { ipAddress: '192.168.1.57', port: 23 },
      { ipAddress: '192.168.1.58', port: 23 },
      { ipAddress: '192.168.1.100', port: 23 },
      { ipAddress: '192.168.1.101', port: 23 },
    ];
    
    knownEmulatedIps.forEach(ep => {
      // Subscribe directly to the instance (instances exist even when disabled)
      const key = `${ep.ipAddress}:${ep.port}`;
      // We need to access the instance even when disabled - modify the manager call
      const unsub = multiPrinterEmulator.subscribe(ep.ipAddress, ep.port, () => {
        if (multiPrinterEmulator.enabled) {
          updateFromEmulators();
        }
      });
      unsubscribers.push(unsub);
    });

    // Initial sync if emulator is already enabled
    if (multiPrinterEmulator.enabled) {
      updateFromEmulators();
    }

    // Periodic polling to keep printer cards updated with emulator state
    // This ensures counts, messages, and status stay in sync
    const pollInterval = setInterval(() => {
      if (multiPrinterEmulator.enabled) {
        updateFromEmulators();
      }
    }, 2000); // Poll every 2 seconds

    return () => {
      unsubEnabled();
      unsubscribers.forEach(unsub => unsub());
      clearInterval(pollInterval);
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

  const updatePrinterStatus = useCallback((printerId: number, status: Pick<Printer, 'isAvailable' | 'status' | 'hasActiveErrors'> & Partial<Pick<Printer, 'inkLevel' | 'makeupLevel' | 'currentMessage' | 'printCount'>>) => {
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
