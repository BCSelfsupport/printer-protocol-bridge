/**
 * useTntUplink — React hook exposing TnT TCP endpoint state.
 *
 * Phase 1 responsibility is limited to: reading state, subscribing to frame
 * events, and updating enable/port config. Frame → dispatcher wiring lives
 * in Phase 2.
 */
import { useEffect, useState, useCallback } from 'react';
import type { TntState, TntConfig, TntFrameEntry } from '@/types/electron';

const EMPTY: TntState = {
  listening: false,
  port: 8101,
  connected: false,
  peer: null,
  framesIn: 0,
  framesOut: 0,
  lastFrameAt: null,
  lastError: null,
  recent: [],
};

export function useTntUplink() {
  const api = typeof window !== 'undefined' ? window.electronAPI?.tnt : undefined;
  const [state, setState] = useState<TntState>(EMPTY);
  const [config, setConfigState] = useState<TntConfig>({ enabled: false, port: 8101 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!api) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const [s, c] = await Promise.all([api.getState(), api.getConfig()]);
      if (cancelled) return;
      setState(s);
      setConfigState(c);
      setLoading(false);
    })();
    const offState = api.onState((s) => setState(s));
    const offFrame = api.onFrame((entry: TntFrameEntry) => {
      // state event follows every frame; keep this as a hook for callers who
      // just want to react to frames without diffing state.recent.
      void entry;
    });
    return () => { cancelled = true; offState?.(); offFrame?.(); };
  }, [api]);

  const setConfig = useCallback(async (next: TntConfig) => {
    if (!api) return;
    const res = await api.setConfig(next);
    if (res?.config) setConfigState(res.config);
  }, [api]);

  return {
    supported: !!api,
    loading,
    state,
    config,
    setConfig,
  };
}
