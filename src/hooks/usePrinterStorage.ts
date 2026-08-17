import { useState, useEffect, useCallback } from 'react';
import { Printer } from '@/types/printer';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';

const STORAGE_KEY = 'codesync-printers';
const EMULATED_PRINTER_IPS = Array.from({ length: 13 }, (_, i) => `192.168.1.${55 + i}`);
const EMULATED_PRINTER_CONFIGS = EMULATED_PRINTER_IPS.map((ipAddress) => ({ ipAddress, port: 23 }));

// The printer list is entirely user-owned: printers are added and addressed by
// the operator. Nothing is ever seeded — emulation only simulates the printers
// that already exist in this list.
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
        const parsed: Printer[] = JSON.parse(stored);
        if (multiPrinterEmulator.enabled) return parsed;
        // Not in emulator mode: reset all printers to offline on load.
        return parsed.map(p => ({
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

      setPrinters(prev => {
        // Only ever UPDATE printers the user has configured. Never add new
        // cards here — the fleet list is user-owned (seeding happens once,
        // on first run, in the initial-state migration above).
        return prev.map(p => {
          const instance = multiPrinterEmulator.getInstanceByIp(p.ipAddress, p.port);
          if (instance) {
            // Simulated offline: leave last-known fields UNTOUCHED so the
            // slave keeps its previously-acknowledged message (rendered as
            // LAST: in the UI) instead of mirroring the still-running
            // emulator's internal state.
            if (instance.simulateOffline) {
              return {
                ...p,
                isAvailable: false,
                status: 'offline' as const,
                hasActiveErrors: false,
              };
            }
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
          const isEmulated = EMULATED_PRINTER_IPS.includes(p.ipAddress);
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
    const knownEmulatedIps = EMULATED_PRINTER_CONFIGS;
    
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
    setPrinters(prev => {
      const target = prev.find(p => p.id === printerId);
      // If this is an emulated printer, remember the removal so the auto-sync
      // loop doesn't immediately re-add it.
      if (target && multiPrinterEmulator.isEmulatedIp(target.ipAddress, target.port)) {
        const removed = getRemovedEmulatedKeys();
        removed.add(`${target.ipAddress}:${target.port}`);
        saveRemovedEmulatedKeys(removed);
      }
      return prev.filter(p => p.id !== printerId);
    });
  }, []);

  const updatePrinter = useCallback((printerId: number, updates: Partial<Printer>) => {
    setPrinters(prev => prev.map(p => {
      if (p.id !== printerId) return p;
      const safeUpdates = { ...updates };
      // Never let an offline card's selected message be overwritten by an
      // optimistic path. A currentMessage change is only trusted when the same
      // patch explicitly proves the printer is available/live again.
      if (!p.isAvailable && safeUpdates.currentMessage !== undefined && safeUpdates.isAvailable !== true) {
        delete safeUpdates.currentMessage;
      }
      return { ...p, ...safeUpdates };
    }));
  }, []);

  const updatePrinterStatus = useCallback((printerId: number, status: Pick<Printer, 'isAvailable' | 'status'> & Partial<Pick<Printer, 'hasActiveErrors' | 'inkLevel' | 'makeupLevel' | 'currentMessage' | 'printCount' | 'jetRunning'>>) => {
    setPrinters(prev => prev.map(p => {
      if (p.id !== printerId) return p;
      const safeStatus = { ...status };
      if (!p.isAvailable && safeStatus.currentMessage !== undefined && safeStatus.isAvailable !== true) {
        delete safeStatus.currentMessage;
      }
      return { ...p, ...safeStatus };
    }));
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
