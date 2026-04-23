interface PrinterAPI {
  checkStatus: (printers: { id: number; ipAddress: string; port: number }[]) => Promise<{
    id: number;
    isAvailable: boolean;
    status: 'ready' | 'not_ready' | 'error' | 'offline';
    responseTime?: number;
    error?: string;
  }[]>;
  quickStatus: (printers: { id: number; ipAddress: string; port: number }[]) => Promise<{
    id: number;
    ok: boolean;
    raw?: string;
  }[]>;
  // Register printer connection details without opening a TCP socket.
  setMeta: (printer: { id: number; ipAddress: string; port: number }) => Promise<{ success: boolean }>;
  connect: (printer: { id: number; ipAddress: string; port: number }) => Promise<{ success: boolean; reused?: boolean; error?: string }>;
  disconnect: (printerId: number) => Promise<{ success: boolean }>;
  sendCommand: (printerId: number, command: string, options?: { maxWaitMs?: number; idleAfterDataMs?: number }) => Promise<{ success: boolean; response?: string; error?: string }>;
}

interface RelayAPI {
  getInfo: () => Promise<{ port: number; ips: string[] }>;
}

interface AppAPI {
  getVersion: () => Promise<string>;
  checkForUpdates: () => void;
  installUpdate: () => void;
  toggleFullscreen: () => Promise<{ fullscreen: boolean }>;
  isFullscreen: () => Promise<boolean>;
  getUpdateState: () => Promise<{ stage: string; info: { version: string } | null; progress: { percent: number; bytesPerSecond: number } | null }>;
  getUpdaterLog: () => Promise<string>;
  getScreenSources: () => Promise<{ id: string; name: string }[]>;
}

interface OneToOneAckPayload {
  printerId: number;
  kind: 'ack' | 'fault';
  /** ACK character: 'R' | 'T' | 'C'. Present when kind === 'ack'. */
  char?: 'R' | 'T' | 'C';
  /** Fault code. Present when kind === 'fault'. */
  code?: 'JET_STOP' | 'DEF_OFF';
  raw?: string;
  ts: number;
}

interface OneToOneAPI {
  attach: (printerId: number) => Promise<{ success: boolean }>;
  detach: (printerId: number) => Promise<{ success: boolean }>;
  sendMD: (printerId: number, command: string) => Promise<{ success: boolean; error?: string }>;
  /** Subscribe to async 1-1 events. Returns an unsubscribe function. */
  onAck: (callback: (payload: OneToOneAckPayload) => void) => () => void;
}

interface ElectronAPI {
  isElectron: boolean;
  printer: PrinterAPI;
  oneToOne: OneToOneAPI;
  relay: RelayAPI;
  app: AppAPI;
  onUpdateAvailable: (callback: (info: { version: string }) => void) => void;
  onUpdateDownloadProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => void;
  onPrinterConnectionLost: (callback: (payload: { printerId: number }) => void) => void;
  onRelayInfo: (callback: (info: { port: number; ips: string[] }) => void) => void;
  onPollingPauseChanged: (callback: (paused: boolean) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
