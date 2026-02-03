interface PrinterAPI {
  checkStatus: (printers: { id: number; ipAddress: string; port: number }[]) => Promise<{
    id: number;
    isAvailable: boolean;
    status: 'ready' | 'not_ready' | 'error' | 'offline';
    responseTime?: number;
    error?: string;
  }[]>;
  // Register printer connection details without opening a TCP socket.
  setMeta: (printer: { id: number; ipAddress: string; port: number }) => Promise<{ success: boolean }>;
  connect: (printer: { id: number; ipAddress: string; port: number }) => Promise<{ success: boolean; reused?: boolean; error?: string }>;
  disconnect: (printerId: number) => Promise<{ success: boolean }>;
  sendCommand: (printerId: number, command: string) => Promise<{ success: boolean; response?: string; error?: string }>;
}

interface AppAPI {
  getVersion: () => Promise<string>;
  checkForUpdates: () => void;
  installUpdate: () => void;
}

interface ElectronAPI {
  isElectron: boolean;
  printer: PrinterAPI;
  app: AppAPI;
  onUpdateAvailable: (callback: (info: { version: string }) => void) => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => void;
  onPrinterConnectionLost: (callback: (payload: { printerId: number }) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
