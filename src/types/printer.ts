export interface Printer {
  id: number;
  name: string;
  ipAddress: string;
  port: number;
  isConnected: boolean;
  isAvailable: boolean;
  status: 'ready' | 'not_ready' | 'error' | 'offline';
  hasActiveErrors: boolean;
  // Quick status fields for overview display
  inkLevel?: 'FULL' | 'LOW' | 'EMPTY' | 'UNKNOWN';
  makeupLevel?: 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN';
  currentMessage?: string | null;
  printCount?: number;
}

export interface PrinterStatus {
  printOn: boolean;
  makeupGood: boolean;
  inkFull: boolean;
  isRunning: boolean;
  productCount: number;
  printCount: number;
  customCounters: number[]; // Custom counters 1-4
  currentMessage: string | null;
  errorMessage: string | null;
  printerVersion: string | null;
  printerTime: Date | null;
  // Detailed consumable levels from ^SU
  inkLevel: 'FULL' | 'LOW' | 'EMPTY' | 'UNKNOWN';
  makeupLevel: 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN';
}

export interface PrinterMetrics {
  powerHours: string;
  streamHours: string;
  modulation: number;
  viscosity: number;
  charge: number;
  pressure: number;
  rps: number;
  phaseQual: number;
  hvDeflection: boolean;
  inkLevel: string;
  makeupLevel: string;
  printStatus: string;
  subsystems: {
    v300up: boolean;
    vltOn: boolean;
    gutOn: boolean;
    modOn: boolean;
  };
}

export interface PrintMessage {
  id: number;
  name: string;
}

export interface PrintSettings {
  width: number;
  height: number;
  delay: number;
  rotation: 'Normal' | 'Inverted' | '90CW' | '90CCW';
  bold: number;
  speed: 'Fast' | 'Faster' | 'Fastest' | 'Ultra Fast';
  gap: number;
  pitch: number;
  repeatAmount: number;
}

export interface ConnectionState {
  isConnected: boolean;
  connectedPrinter: Printer | null;
  status: PrinterStatus | null;
  metrics: PrinterMetrics | null;
  settings: PrintSettings;
  messages: PrintMessage[];
}
