import { useEffect, useState, useCallback, useRef } from 'react';
import type { CustomReportTemplate } from '@/types/reportTemplates';

const DB_NAME = 'codesync-report-templates';
const DB_VERSION = 1;
const STORE = 'templates';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll(): Promise<CustomReportTemplate[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(template: CustomReportTemplate): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(template);
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
  const [templates, setTemplates] = useState<CustomReportTemplate[]>([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    getAll()
      .then(t => setTemplates(t.sort((a, b) => b.updatedAt - a.updatedAt)))
      .catch(err => console.error('[useReportTemplates] load failed', err));
  }, []);

  const saveTemplate = useCallback(
    async (template: Omit<CustomReportTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      const now = Date.now();
      const existing = template.id ? templates.find(t => t.id === template.id) : null;
      const full: CustomReportTemplate = {
        ...template,
        id: template.id ?? crypto.randomUUID(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await put(full);
      setTemplates(prev => {
        const filtered = prev.filter(t => t.id !== full.id);
        return [full, ...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
      });
      return full;
    },
    [templates]
  );

  const deleteTemplate = useCallback(async (id: string) => {
    await del(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  const duplicateTemplate = useCallback(
    async (id: string) => {
      const src = templates.find(t => t.id === id);
      if (!src) return null;
      const now = Date.now();
      const copy: CustomReportTemplate = {
        ...src,
        id: crypto.randomUUID(),
        name: `${src.name} (copy)`,
        createdAt: now,
        updatedAt: now,
      };
      await put(copy);
      setTemplates(prev => [copy, ...prev].sort((a, b) => b.updatedAt - a.updatedAt));
      return copy;
    },
    [templates]
  );

  const renameTemplate = useCallback(
    async (id: string, name: string) => {
      const src = templates.find(t => t.id === id);
      if (!src) return;
      const updated = { ...src, name, updatedAt: Date.now() };
      await put(updated);
      setTemplates(prev =>
        prev.map(t => (t.id === id ? updated : t)).sort((a, b) => b.updatedAt - a.updatedAt)
      );
    },
    [templates]
  );

  return { templates, saveTemplate, deleteTemplate, duplicateTemplate, renameTemplate };
}
