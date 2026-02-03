export interface Printer {
  id: number;
  name: string;
  ipAddress: string;
  port: number;
  isConnected: boolean;
  isAvailable: boolean;
  status: 'ready' | 'not_ready' | 'error' | 'offline';
  hasActiveErrors: boolean;
}

export interface PrinterStatus {
  printOn: boolean;
  makeupGood: boolean;
  inkFull: boolean;
  isRunning: boolean;
  productCount: number;
  printCount: number;
  currentMessage: string | null;
  errorMessage: string | null;
  printerVersion: string | null;
  printerTime: Date | null;
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
  speed: 'Slow' | 'Normal' | 'Fast';
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
