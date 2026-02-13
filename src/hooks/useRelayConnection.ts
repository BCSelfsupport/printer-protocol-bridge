import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Provides a PrinterAPI-compatible interface that communicates with printers
 * through a PC running the Electron app's relay server.
 * 
 * Mobile PWA → HTTP fetch → PC Electron relay (port 8766) → TCP → Printer
 */

export interface RelayConfig {
  /** The PC's local IP address, e.g. "192.168.1.50" */
  pcIp: string;
  /** Relay port (default 8766) */
  port?: number;
}

const RELAY_STORAGE_KEY = 'relay-config';

export function useRelayConnection() {
  const [relayConfig, setRelayConfigState] = useState<RelayConfig | null>(() => {
    try {
      const stored = localStorage.getItem(RELAY_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [isRelayConnected, setIsRelayConnected] = useState(false);
  const [relayError, setRelayError] = useState<string | null>(null);

  const baseUrl = relayConfig
    ? `http://${relayConfig.pcIp}:${relayConfig.port || 8766}`
    : null;

  const setRelayConfig = useCallback((config: RelayConfig | null) => {
    setRelayConfigState(config);
    if (config) {
      localStorage.setItem(RELAY_STORAGE_KEY, JSON.stringify(config));
    } else {
      localStorage.removeItem(RELAY_STORAGE_KEY);
    }
    setIsRelayConnected(false);
    setRelayError(null);
  }, []);

  // Test relay connectivity
  const testRelay = useCallback(async (config?: RelayConfig): Promise<boolean> => {
    const target = config || relayConfig;
    if (!target) return false;
    
    const url = `http://${target.pcIp}:${target.port || 8766}/relay/info`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.relay) {
        setIsRelayConnected(true);
        setRelayError(null);
        return true;
      }
      return false;
    } catch (err: any) {
      setRelayError(err.message || 'Cannot reach relay');
      setIsRelayConnected(false);
      return false;
    }
  }, [relayConfig]);

  // Relay-based printer API
  const relayFetch = useCallback(async (endpoint: string, body: any) => {
    if (!baseUrl) throw new Error('Relay not configured');
    const res = await fetch(`${baseUrl}/relay/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    return res.json();
  }, [baseUrl]);

  const checkStatus = useCallback(async (printers: { id: number; ipAddress: string; port: number }[]) => {
    try {
      const data = await relayFetch('check-status', { printers });
      return data.printers || [];
    } catch {
      return printers.map(p => ({ id: p.id, isAvailable: false, status: 'offline' as const }));
    }
  }, [relayFetch]);

  const connect = useCallback(async (printer: { id: number; ipAddress: string; port: number }) => {
    try {
      return await relayFetch('connect', { printer });
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [relayFetch]);

  const disconnect = useCallback(async (printerId: number) => {
    try {
      return await relayFetch('disconnect', { printerId });
    } catch {
      return { success: true };
    }
  }, [relayFetch]);

  const sendCommand = useCallback(async (printerId: number, command: string) => {
    try {
      return await relayFetch('send-command', { printerId, command });
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [relayFetch]);

  // Auto-test relay on config change
  useEffect(() => {
    if (relayConfig) {
      testRelay();
    }
  }, [relayConfig, testRelay]);

  return {
    relayConfig,
    setRelayConfig,
    isRelayConnected,
    relayError,
    testRelay,
    // PrinterAPI-compatible methods
    checkStatus,
    connect,
    disconnect,
    sendCommand,
    /** Whether relay mode is active (config exists) */
    isRelayMode: !!relayConfig && !window.electronAPI,
  };
}
