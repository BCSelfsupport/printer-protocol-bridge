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
  inkLevel?: 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN';
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
  inkLevel: 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN';
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
  // AllowErrors and active error flag from ^SU (v2.6)
  allowErrors: boolean;
  errorActive: boolean;
  // Temperature readings from ^TP command
  printheadTemp: number;
  electronicsTemp: number;
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
  width: number;       // 0-1000
  height: number;      // 0-10
  delay: number;       // 0-4,000,000,000
  rotation: 'Normal' | 'Mirror' | 'Flip' | 'Mirror Flip';
  bold: number;        // 0-9
  speed: 'Fast' | 'Faster' | 'Fastest' | 'Ultra Fast';
  gap: number;         // 0-9
  pitch: number;       // 0-4,000,000,000
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
