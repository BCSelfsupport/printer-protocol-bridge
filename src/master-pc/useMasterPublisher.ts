import { useEffect, useRef } from 'react';
import type { Printer } from '@/types/printer';
import type { SharedHistory } from './types';
import { subscribeMasterReadings, getMasterReadings } from './readings';
export function useMasterPublisher(printers: Printer[], history: SharedHistory, productKey: string | null) {
  const current = useRef({ printers, history });
  current.current = { printers, history };
  useEffect(() => {
    const api = window.electronAPI?.sharing;
    if (!api || !productKey) return;
    let active = true, running = false, lastAuth = 0;
    const publish = async () => {
      if (!active || running) return; running = true;
      try {
        const info = await api.info();
        if (!info.enabled) {
          if (!info.configured && !await api.shouldResume()) return;
          await api.start({ productKey, machineId: localStorage.getItem('codesync-machine-id') ?? '', apiKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY });
        }
        if (Date.now() - lastAuth > 5 * 60 * 1000) { await api.authorize({ productKey, machineId: localStorage.getItem('codesync-machine-id') ?? '', apiKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }); lastAuth = Date.now(); }
        await api.publish({ printers: current.current.printers, metrics: getMasterReadings(), history: current.current.history });
      } catch { /* fail closed; viewers show stale state */ } finally { running = false; }
    };
    void publish(); const timer = setInterval(publish, 3000); const unsubscribe = subscribeMasterReadings(() => { void publish(); });
    return () => { active = false; clearInterval(timer); unsubscribe(); };
  }, [productKey]);
}
