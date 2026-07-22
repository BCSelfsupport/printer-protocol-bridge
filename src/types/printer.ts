export type PrinterRole = 'none' | 'master' | 'slave';

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
  // Last-known jet-running state for this printer. Populated by the emulator
  // per-printer status poll and by the connected printer's ^SU parse. Undefined
  // when we've never seen a state (e.g. real hardware peer where we only ping).
  // Used by "Stop All Jets" to skip printers already stopped.
  jetRunning?: boolean;
  // Master/Slave configuration
  role?: PrinterRole;
  masterId?: number; // ID of the master printer (when role === 'slave')
  serialNumber?: string; // User-entered serial number for fleet tracking
  expiryOffsetDays?: number; // Per-printer expiration date offset in days (e.g., +1, +2, +7)
  lineId?: string; // Line ID label used for Line ID field in messages
  // Per-printer print orientation override. When set, master → slave sync
  // rewrites every synced message on this printer with this rotation baked
  // into the ^NM header, so lines running in the opposite direction of
  // travel (e.g. R→L vs L→R) always print correctly regardless of what the
  // master message stores.
  rotation?: 'Normal' | 'Mirror' | 'Flip' | 'Mirror Flip';
  // Per-printer NEW-message defaults. Different printers on different lines
  // often need different Width / Delay / Speed baselines (photocell distance,
  // head size, product speed). When set, these values seed the editor for any
  // NEW message created for this printer and are pushed after ^NM so the
  // printer's baked-in defaults (W=15 / D=100) are overwritten. Rotation is
  // intentionally NOT part of this — it lives in its own field above.
  // Missing fields fall back to the fleet-wide defaults.
  messageDefaults?: Partial<Pick<PrintSettings, 'width' | 'height' | 'delay' | 'bold' | 'gap' | 'pitch' | 'speed'>>;
  // Master → Slave sync outcome tracking. Set to true when the last push to
  // this slave failed (timeout, rejected, offline). Cleared on a subsequent
  // successful sync. Used to render an "OUT OF SYNC" badge on the slave card.
  syncOutOfDate?: boolean;
  syncLastFailure?: { messageName: string; reason: string; at: number } | null;
  // Master only. When true, restore legacy behavior: selecting a message on
  // the master immediately fans out ^SM to every slave in this master's group.
  // When false/undefined (default), operator picks targets via the
  // "Apply to Printers" dialog per selection.
  autoSyncSelection?: boolean;
  // Last ^SM message selection outcome for this printer. Rendered as a
  // small pass/fail pip under the printer icon so operators can see at a
  // glance whether the printer actually acknowledged the requested message.
  lastSelectionResult?: {
    messageName: string;
    success: boolean;
    reason?: string;
    at: number;
  } | null;
}


export interface PrinterStatus {
  printOn: boolean;
  makeupGood: boolean;
  inkFull: boolean;
  isRunning: boolean;
  jetRunning: boolean; // Whether the ink jet is active (independent of HV)
  productCount: number;
  printCount: number;
  customCounters: number[]; // Custom counters 1-4
  currentMessage: string | null;
  errorMessage: string | null;
  printerVersion: string | null;
  printerModel: string | null;
  printerVariant: string | null;
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
  // Printer's own clock from ^SD
  printerTime?: Date | null;
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

// Fleet-wide preferred defaults for message adjust settings.
// Used both when creating a new message in the editor AND as the fallback when
// selecting a legacy message that has no stored adjustSettings — so we never
// inherit whatever the HMI happens to be showing (e.g. W15/D200 leftovers).
// Rotation is intentionally omitted; it's driven by the per-printer setup card.
export const FLEET_DEFAULT_ADJUST_SETTINGS: PrintSettings = {
  width: 2,
  height: 8,
  delay: 500,
  bold: 0,
  gap: 0,
  pitch: 0,
  repeatAmount: 0,
  rotation: 'Normal',
  speed: 'Ultra Fast',
};

export interface ConnectionState {
  isConnected: boolean;
  connectedPrinter: Printer | null;
  status: PrinterStatus | null;
  metrics: PrinterMetrics | null;
  settings: PrintSettings;
  messages: PrintMessage[];
}
