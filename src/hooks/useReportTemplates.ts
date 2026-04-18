import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedReportTemplate } from '@/types/reportTemplates';

const DB_NAME = 'codesync-report-templates';
const DB_VERSION = 1;
const STORE = 'templates';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll(): Promise<SavedReportTemplate[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(item: SavedReportTemplate): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function del(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function useReportTemplates() {
  const [templates, setTemplates] = useState<SavedReportTemplate[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    getAll().then(t => setTemplates(t.sort((a, b) => b.updatedAt - a.updatedAt))).catch(() => { /* ignore */ });
  }, []);

  const saveTemplate = useCallback(async (
    template: Omit<SavedReportTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SavedReportTemplate> => {
    const now = Date.now();
    const created: SavedReportTemplate = {
      ...template,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await put(created);
    setTemplates(prev => [created, ...prev]);
    return created;
  }, []);

  const updateTemplate = useCallback(async (id: string, updates: Partial<SavedReportTemplate>) => {
    setTemplates(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t);
      const updated = next.find(t => t.id === id);
      if (updated) put(updated).catch(() => { /* ignore */ });
      return next;
    });
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    await del(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  return { templates, saveTemplate, updateTemplate, deleteTemplate };
}
