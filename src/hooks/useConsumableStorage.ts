import { useState, useEffect, useCallback } from 'react';
import { Consumable, PrinterConsumableAssignment, ReorderConfig, defaultReorderConfig } from '@/types/consumable';

const CONSUMABLES_KEY = 'codesync-consumables';
const ASSIGNMENTS_KEY = 'codesync-consumable-assignments';
const REORDER_CONFIG_KEY = 'codesync-reorder-config';

export function useConsumableStorage() {
  const [consumables, setConsumables] = useState<Consumable[]>(() => {
    try {
      const stored = localStorage.getItem(CONSUMABLES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [assignments, setAssignments] = useState<PrinterConsumableAssignment[]>(() => {
    try {
      const stored = localStorage.getItem(ASSIGNMENTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [reorderConfig, setReorderConfig] = useState<ReorderConfig>(() => {
    try {
      const stored = localStorage.getItem(REORDER_CONFIG_KEY);
      return stored ? { ...defaultReorderConfig, ...JSON.parse(stored) } : defaultReorderConfig;
    } catch {
      return defaultReorderConfig;
    }
  });

  // Persist consumables
  useEffect(() => {
    try {
      localStorage.setItem(CONSUMABLES_KEY, JSON.stringify(consumables));
    } catch (e) {
      console.error('Failed to save consumables:', e);
    }
  }, [consumables]);

  // Persist assignments
  useEffect(() => {
    try {
      localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
    } catch (e) {
      console.error('Failed to save consumable assignments:', e);
    }
  }, [assignments]);

  // Persist reorder config
  useEffect(() => {
    try {
      localStorage.setItem(REORDER_CONFIG_KEY, JSON.stringify(reorderConfig));
    } catch (e) {
      console.error('Failed to save reorder config:', e);
    }
  }, [reorderConfig]);

  const updateReorderConfig = useCallback((updates: Partial<ReorderConfig>) => {
    setReorderConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const addConsumable = useCallback((consumable: Omit<Consumable, 'id'>) => {
    const newConsumable: Consumable = {
      ...consumable,
      id: crypto.randomUUID(),
    };
    setConsumables(prev => [...prev, newConsumable]);
    return newConsumable;
  }, []);

  const updateConsumable = useCallback((id: string, updates: Partial<Omit<Consumable, 'id'>>) => {
    setConsumables(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const removeConsumable = useCallback((id: string) => {
    setConsumables(prev => prev.filter(c => c.id !== id));
    // Also remove any assignments referencing this consumable
    setAssignments(prev => prev.map(a => ({
      ...a,
      inkConsumableId: a.inkConsumableId === id ? undefined : a.inkConsumableId,
      makeupConsumableId: a.makeupConsumableId === id ? undefined : a.makeupConsumableId,
    })).filter(a => a.inkConsumableId || a.makeupConsumableId));
  }, []);

  const adjustStock = useCallback((id: string, delta: number) => {
    setConsumables(prev => prev.map(c =>
      c.id === id ? { ...c, currentStock: Math.max(0, c.currentStock + delta) } : c
    ));
  }, []);

  const setStock = useCallback((id: string, amount: number) => {
    setConsumables(prev => prev.map(c =>
      c.id === id ? { ...c, currentStock: Math.max(0, amount) } : c
    ));
  }, []);

  const assignConsumable = useCallback((printerId: number, type: 'ink' | 'makeup', consumableId: string | undefined) => {
    setAssignments(prev => {
      const existing = prev.find(a => a.printerId === printerId);
      if (existing) {
        const updated = {
          ...existing,
          ...(type === 'ink' ? { inkConsumableId: consumableId } : { makeupConsumableId: consumableId }),
        };
        // Remove assignment if both are empty
        if (!updated.inkConsumableId && !updated.makeupConsumableId) {
          return prev.filter(a => a.printerId !== printerId);
        }
        return prev.map(a => a.printerId === printerId ? updated : a);
      }
      if (!consumableId) return prev;
      return [...prev, {
        printerId,
        ...(type === 'ink' ? { inkConsumableId: consumableId } : { makeupConsumableId: consumableId }),
      }];
    });
  }, []);

  const getAssignment = useCallback((printerId: number): PrinterConsumableAssignment | undefined => {
    return assignments.find(a => a.printerId === printerId);
  }, [assignments]);

  const getConsumable = useCallback((id: string): Consumable | undefined => {
    return consumables.find(c => c.id === id);
  }, [consumables]);

  const getConsumablesForPrinter = useCallback((printerId: number) => {
    const assignment = assignments.find(a => a.printerId === printerId);
    if (!assignment) return { ink: undefined, makeup: undefined };
    return {
      ink: assignment.inkConsumableId ? consumables.find(c => c.id === assignment.inkConsumableId) : undefined,
      makeup: assignment.makeupConsumableId ? consumables.find(c => c.id === assignment.makeupConsumableId) : undefined,
    };
  }, [assignments, consumables]);

  const getLowStockConsumables = useCallback((): Consumable[] => {
    return consumables.filter(c => c.currentStock <= c.minimumStock);
  }, [consumables]);

  return {
    consumables,
    assignments,
    reorderConfig,
    updateReorderConfig,
    addConsumable,
    updateConsumable,
    removeConsumable,
    adjustStock,
    setStock,
    assignConsumable,
    getAssignment,
    getConsumable,
    getConsumablesForPrinter,
    getLowStockConsumables,
  };
}
