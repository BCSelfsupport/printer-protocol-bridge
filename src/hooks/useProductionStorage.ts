import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProductionRun, ProductionSnapshot } from '@/types/production';

const DB_NAME = 'codesync-production';
const DB_VERSION = 1;
const RUNS_STORE = 'runs';
const SNAPSHOTS_STORE = 'snapshots';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RUNS_STORE)) {
        const runsStore = db.createObjectStore(RUNS_STORE, { keyPath: 'id' });
        runsStore.createIndex('printerId', 'printerId', { unique: false });
        runsStore.createIndex('startTime', 'startTime', { unique: false });
      }
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        const snapStore = db.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'id' });
        snapStore.createIndex('runId', 'runId', { unique: false });
        snapStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putInStore<T>(storeName: string, item: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function useProductionStorage() {
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [snapshots, setSnapshots] = useState<ProductionSnapshot[]>([]);
  const loadedRef = useRef(false);

  // Load from IndexedDB on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    Promise.all([
      getAllFromStore<ProductionRun>(RUNS_STORE),
      getAllFromStore<ProductionSnapshot>(SNAPSHOTS_STORE),
    ]).then(([r, s]) => {
      setRuns(r.sort((a, b) => b.startTime - a.startTime));
      setSnapshots(s.sort((a, b) => a.timestamp - b.timestamp));
    });
  }, []);

  const addRun = useCallback(async (run: Omit<ProductionRun, 'id'>) => {
    const newRun: ProductionRun = { ...run, id: crypto.randomUUID() };
    await putInStore(RUNS_STORE, newRun);
    setRuns(prev => [newRun, ...prev]);
    return newRun;
  }, []);

  const updateRun = useCallback(async (id: string, updates: Partial<ProductionRun>) => {
    setRuns(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...updates } : r);
      const run = updated.find(r => r.id === id);
      if (run) putInStore(RUNS_STORE, run);
      return updated;
    });
  }, []);

  const deleteRun = useCallback(async (id: string) => {
    await deleteFromStore(RUNS_STORE, id);
    setRuns(prev => prev.filter(r => r.id !== id));
    // Also delete associated snapshots
    const associated = snapshots.filter(s => s.runId === id);
    for (const s of associated) {
      await deleteFromStore(SNAPSHOTS_STORE, s.id);
    }
    setSnapshots(prev => prev.filter(s => s.runId !== id));
  }, [snapshots]);

  const addSnapshot = useCallback(async (snapshot: Omit<ProductionSnapshot, 'id'>) => {
    const newSnap: ProductionSnapshot = { ...snapshot, id: crypto.randomUUID() };
    await putInStore(SNAPSHOTS_STORE, newSnap);
    setSnapshots(prev => [...prev, newSnap]);
  }, []);

  const clearAll = useCallback(async () => {
    await clearStore(RUNS_STORE);
    await clearStore(SNAPSHOTS_STORE);
    setRuns([]);
    setSnapshots([]);
  }, []);

  const addDowntimeEvent = useCallback(async (runId: string, reason: string) => {
    setRuns(prev => {
      const updated = prev.map(r => {
        if (r.id !== runId) return r;
        const newEvent = {
          id: crypto.randomUUID(),
          startTime: Date.now(),
          endTime: null,
          reason,
        };
        const updatedRun = { ...r, downtimeEvents: [...r.downtimeEvents, newEvent] };
        putInStore(RUNS_STORE, updatedRun);
        return updatedRun;
      });
      return updated;
    });
  }, []);

  const endDowntimeEvent = useCallback(async (runId: string, eventId: string) => {
    setRuns(prev => {
      const updated = prev.map(r => {
        if (r.id !== runId) return r;
        const updatedRun = {
          ...r,
          downtimeEvents: r.downtimeEvents.map(e =>
            e.id === eventId ? { ...e, endTime: Date.now() } : e
          ),
        };
        putInStore(RUNS_STORE, updatedRun);
        return updatedRun;
      });
      return updated;
    });
  }, []);

  return {
    runs,
    snapshots,
    addRun,
    updateRun,
    deleteRun,
    addSnapshot,
    addDowntimeEvent,
    endDowntimeEvent,
    clearAll,
  };
}
