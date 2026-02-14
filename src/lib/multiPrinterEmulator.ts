/**
 * Multi-Printer Emulator Manager
 * Manages multiple independent printer emulator instances for testing
 */

import { EmulatorState, CommandLogEntry, SimulatedPrinter, PROTOCOL_COMMANDS } from './printerEmulator';

// Default state template for new emulator instances
const createDefaultState = (overrides?: Partial<EmulatorState>): EmulatorState => ({
  hvOn: false,
  jetRunning: false,
  v300up: false,
  vltOn: false,
  gutOn: false,
  modOn: false,
  echoOn: false,
  utf8Mode: false,
  oneToOneMode: false,
  forcePhotoEye: false,
  autoAlign: false,
  isLoggedIn: false,
  
  modulation: 160,
  charge: 65,
  pressure: 40,
  rps: 28.13,
  phaseQual: 100,
  viscosity: 4.20,
  
  inkLevel: 'FULL',
  makeupLevel: 'FULL',
  
  printheadTemp: 24.71,
  electronicsTemp: 30.78,
  
  currentMessage: 'BESTCODE',
  productCount: 308,
  printCount: 7,
  customCounters: [10, 21, 34, 45],
  
  delay: 0,
  delayReverse: 0,
  photoEyeTriggerDelay: 0,
  pitch: 100,
  printHeight: 8,
  printWidth: 100,
  repeatCount: 1,
  gap: 1,
  bold: 0,
  
  powerHours: 165.0,
  streamHours: 120.5,
  
  messages: ['BESTCODE', 'BESTCODE-AUTO', 'TEST', 'SAMPLE', 'BC-GEN2'],
  logos: ['ENCODER.BMP', 'highVolt.bmp', 'phaseWave.bmp', 'running_2.bmp', 'USBdrive.bmp'],
  
  errorsOn: false,
  ...overrides,
});

// Predefined emulated printers with unique configurations
export interface EmulatedPrinterConfig {
  id: number;
  name: string;
  ipAddress: string;
  port: number;
  initialState: Partial<EmulatorState>;
}

const EMULATED_PRINTERS: EmulatedPrinterConfig[] = [
  {
    id: 1,
    name: 'Printer 1',
    ipAddress: '192.168.1.55',
    port: 23,
    initialState: {
      currentMessage: 'BESTCODE',
      printCount: 1247,
      productCount: 5832,
      inkLevel: 'FULL',
      makeupLevel: 'FULL',
      hvOn: false,
    },
  },
  {
    id: 2,
    name: 'Printer 2',
    ipAddress: '192.168.1.56',
    port: 23,
    initialState: {
      currentMessage: 'TEST',
      printCount: 892,
      productCount: 3421,
      inkLevel: 'FULL',
      makeupLevel: 'LOW' as const,
      hvOn: false,
      jetRunning: false,
    },
  },
  {
    id: 3,
    name: 'Line A - Primary',
    ipAddress: '192.168.1.100',
    port: 23,
    initialState: {
      currentMessage: 'SAMPLE',
      printCount: 45892,
      productCount: 128456,
      inkLevel: 'LOW',
      makeupLevel: 'GOOD' as const,
      hvOn: false,
      jetRunning: false,
    },
  },
  {
    id: 4,
    name: 'Line B - Secondary',
    ipAddress: '192.168.1.101',
    port: 23,
    initialState: {
      currentMessage: 'BC-GEN2',
      printCount: 234,
      productCount: 1089,
      inkLevel: 'FULL',
      makeupLevel: 'EMPTY',
      hvOn: false,
      errorsOn: true,
    },
  },
  {
    id: 5,
    name: 'Printer 5',
    ipAddress: '192.168.1.57',
    port: 23,
    initialState: {
      currentMessage: 'TEST',
      printCount: 5621,
      productCount: 18432,
      inkLevel: 'FULL',
      makeupLevel: 'FULL',
      hvOn: false,
      jetRunning: false,
    },
  },
  {
    id: 6,
    name: 'Printer 6',
    ipAddress: '192.168.1.58',
    port: 23,
    initialState: {
      currentMessage: 'SAMPLE',
      printCount: 9834,
      productCount: 42156,
      inkLevel: 'FULL',
      makeupLevel: 'GOOD' as const,
      hvOn: false,
      jetRunning: false,
    },
  },
];

/**
 * Individual Printer Emulator Instance
 */
class PrinterEmulatorInstance {
  private state: EmulatorState;
  private commandLog: CommandLogEntry[] = [];
  private listeners: Set<(state: EmulatorState) => void> = new Set();
  private logListeners: Set<(log: CommandLogEntry[]) => void> = new Set();
  
  public readonly config: EmulatedPrinterConfig;
  private readonly VERSION = 'v01.09.00.14';
  private readonly BUILD_DATE = 'Feb 06 2026 10:30:00';

  constructor(config: EmulatedPrinterConfig) {
    this.config = config;
    this.state = createDefaultState(config.initialState);
    // Restore persisted messages for this instance
    this.loadPersistedMessages();
  }

  private get storageKey(): string {
    return `emulator-messages-${this.config.ipAddress}`;
  }

  private loadPersistedMessages() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const msgs = JSON.parse(saved) as string[];
        if (Array.isArray(msgs) && msgs.length > 0) {
          this.state.messages = msgs;
        }
      }
    } catch { /* ignore */ }
  }

  private persistMessages() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state.messages));
    } catch { /* ignore */ }
  }

  getState(): EmulatorState {
    return { ...this.state };
  }

  getSimulatedPrinter(): SimulatedPrinter {
    return {
      id: this.config.id,
      name: this.config.name,
      ipAddress: this.config.ipAddress,
      port: this.config.port,
      isAvailable: true,
      status: this.state.hvOn && this.state.jetRunning ? 'ready' : 'not_ready',
    };
  }

  getCommandLog(): CommandLogEntry[] {
    return [...this.commandLog];
  }

  subscribe(listener: (state: EmulatorState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeToLog(listener: (log: CommandLogEntry[]) => void): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getState()));
  }

  private notifyLogListeners() {
    this.logListeners.forEach(listener => listener(this.getCommandLog()));
  }

  private addLog(command: string, response: string, direction: 'sent' | 'received') {
    this.commandLog.unshift({
      timestamp: new Date(),
      command,
      response,
      direction,
    });
    if (this.commandLog.length > 100) {
      this.commandLog = this.commandLog.slice(0, 100);
    }
    this.notifyLogListeners();
  }

  /**
   * Process a command and return a simulated response
   */
  processCommand(command: string): { success: boolean; response: string } {
    const trimmedCommand = command.trim().toUpperCase();
    this.addLog(command.trim(), '', 'sent');

    let response = '';
    let success = true;

    try {
      if (trimmedCommand.startsWith('^VV')) {
        response = this.cmdViewVersion();
      } else if (trimmedCommand.startsWith('^EN')) {
        response = this.cmdEchoOn();
      } else if (trimmedCommand.startsWith('^EF')) {
        response = this.cmdEchoOff();
      } else if (trimmedCommand.startsWith('^SU')) {
        response = this.cmdStatusUpdate();
      } else if (trimmedCommand.startsWith('^SJ')) {
        response = this.cmdStartStopJet(trimmedCommand);
      } else if (trimmedCommand.startsWith('^PR')) {
        response = this.cmdPrintControl(trimmedCommand);
      } else if (trimmedCommand.startsWith('^SM')) {
        response = this.cmdSelectMessage(trimmedCommand);
      } else if (trimmedCommand.startsWith('^LM')) {
        response = this.cmdListMessages();
      } else if (trimmedCommand.startsWith('^CN')) {
        response = this.cmdCountQuery();
      } else if (trimmedCommand.startsWith('^TP')) {
        response = this.cmdShowTemperature();
      } else if (trimmedCommand.startsWith('^TM')) {
        response = this.cmdShowRunTime();
      } else if (trimmedCommand.startsWith('^PH')) {
        response = this.cmdPrintHeight(trimmedCommand);
      } else if (trimmedCommand.startsWith('^PW')) {
        response = this.cmdPrintWidth(trimmedCommand);
      } else if (trimmedCommand.startsWith('^DA')) {
        response = this.cmdDelayAdjust(trimmedCommand);
      } else if (trimmedCommand.startsWith('^PA')) {
        response = this.cmdPitchAdjust(trimmedCommand);
      } else if (trimmedCommand.startsWith('^SD')) {
        response = this.cmdShowDate();
      } else if (trimmedCommand.startsWith('^LG')) {
        response = this.cmdLogin(trimmedCommand);
      } else if (trimmedCommand.startsWith('^LO')) {
        response = this.cmdLogout();
      } else if (trimmedCommand.startsWith('^CC')) {
        response = this.cmdChangeCounter(trimmedCommand);
      } else if (trimmedCommand.startsWith('^DM')) {
        response = this.cmdDeleteMessage(trimmedCommand);
      } else if (trimmedCommand.startsWith('^NM')) {
        response = this.cmdNewMessage(trimmedCommand);
      } else if (trimmedCommand.startsWith('^PT')) {
        response = this.cmdForcePrint();
      } else if (trimmedCommand.startsWith('^FE')) {
        response = this.cmdForcePhotoEye(true);
      } else if (trimmedCommand.startsWith('^FF')) {
        response = this.cmdForcePhotoEye(false);
      } else {
        response = this.formatError(3, 'CmdNotRec', 'Command not recognized');
        success = false;
      }
    } catch (error) {
      response = this.formatError(1, 'Error', 'Generic error');
      success = false;
    }

    this.addLog(command.trim(), response, 'received');
    this.notifyListeners();

    return { success, response };
  }

  // Command implementations (simplified versions from main emulator)
  private cmdViewVersion(): string {
    return `Remote Server ${this.VERSION} built ${this.BUILD_DATE}`;
  }

  private cmdEchoOn(): string {
    this.state.echoOn = true;
    return 'Command Successful!';
  }

  private cmdEchoOff(): string {
    this.state.echoOn = false;
    return '>';
  }

  private cmdStatusUpdate(): string {
    const s = this.state;
    if (s.echoOn) {
      return [
        `STATUS: Modulation[${s.modulation}] Charge[${s.charge}] Pressure[${s.pressure}] RPS[${s.rps.toFixed(2)}]`,
        `PhaseQual[${s.phaseQual}%] AllowErrors[${s.errorsOn ? 1 : 0}] HVDeflection[${s.hvOn ? 1 : 0}] Viscosity[${s.viscosity.toFixed(2)}]`,
        `Ink Level: ${s.inkLevel}`,
        `Makeup Level: ${s.makeupLevel}`,
        `V300UP: ${s.v300up ? 1 : 0} VLT_ON: ${s.vltOn ? 1 : 0} GUT_ON: ${s.gutOn ? 1 : 0} MOD_ON: ${s.modOn ? 1 : 0}`,
        `Print Status: ${s.hvOn && s.jetRunning ? 'Ready' : 'Not ready'}`,
        `Message: ${s.currentMessage || 'NONE'}`,
      ].join('\r\n');
    } else {
      return [
        `Mod[${s.modulation}] Chg[${s.charge}] Prs[${s.pressure}] RPS[${s.rps.toFixed(2)}] PhQ[${s.phaseQual}%] Err[${s.errorsOn ? 1 : 0}] HvD[${s.hvOn ? 1 : 0}] Vis[${s.viscosity.toFixed(2)}]`,
        `INK: ${s.inkLevel} MAKEUP: ${s.makeupLevel}`,
        `V300UP: ${s.v300up ? 1 : 0} VLT_ON: ${s.vltOn ? 1 : 0} GUT_ON: ${s.gutOn ? 1 : 0} MOD_ON: ${s.modOn ? 1 : 0}`,
        `PRINT: ${s.hvOn && s.jetRunning ? 'Ready' : 'Not ready'}`,
        `MSG: ${s.currentMessage || 'NONE'}`,
      ].join('\r\n');
    }
  }

  private cmdStartStopJet(cmd: string): string {
    const match = cmd.match(/\^SJ\s*([01])/);
    if (match) {
      const start = match[1] === '1';
      if (start) {
        this.state.jetRunning = true;
        this.state.v300up = true;
        this.state.vltOn = true;
        this.state.gutOn = true;
        this.state.modOn = true;
        return this.state.echoOn ? 'Command Successful!\r\nJet starting...' : 'Jet OK';
      } else {
        this.state.jetRunning = false;
        this.state.hvOn = false;
        this.state.v300up = false;
        this.state.vltOn = false;
        this.state.gutOn = false;
        this.state.modOn = false;
        return this.state.echoOn ? 'Command Successful!\r\nJet stopping...' : 'Jet Stop OK';
      }
    }
    return this.formatError(2, 'CmdFormat', 'Usage: ^SJ 0 or ^SJ 1');
  }

  private cmdPrintControl(cmd: string): string {
    const match = cmd.match(/\^PR\s*([01])/);
    if (match) {
      const enable = match[1] === '1';
      if (enable) {
        if (!this.state.jetRunning) {
          return this.state.echoOn ? 'Error 59: Cannot enable printing - jet not running' : 'Err[59]';
        }
        this.state.hvOn = true;
        return this.state.echoOn ? 'Command Successful!\r\nHV Deflection ON' : 'HV ON';
      } else {
        this.state.hvOn = false;
        return this.state.echoOn ? 'Command Successful!\r\nHV Deflection OFF' : 'HV OFF';
      }
    }
    return this.formatError(2, 'CmdFormat', 'Usage: ^PR 0 or ^PR 1');
  }

  private cmdForcePrint(): string {
    if (!this.state.hvOn) {
      return this.formatError(59, 'CantPrint', 'Cannot print - HV deflection not enabled');
    }
    this.state.printCount++;
    return this.state.echoOn ? 'Command Successful!\r\nPrint triggered' : 'OK';
  }

  private cmdForcePhotoEye(enable: boolean): string {
    return this.state.echoOn
      ? `Command Successful!\r\nPhoto Eye ${enable ? 'Enabled' : 'Disabled'}`
      : enable ? 'FE ON' : 'FE OFF';
  }

  private cmdSelectMessage(cmd: string): string {
    const match = cmd.match(/\^SM\s+(.+)/i);
    if (match) {
      const msgName = match[1].trim();
      if (this.state.messages.includes(msgName.toUpperCase()) || this.state.messages.includes(msgName)) {
        this.state.currentMessage = msgName.toUpperCase();
        return this.state.echoOn ? `Command Successful!\r\nMessage selected: ${msgName}` : `MSG: ${msgName}`;
      }
      return this.formatError(14, 'FileNotFound', `Message '${msgName}' not found`);
    }
    return this.formatError(2, 'CmdFormat', 'Usage: ^SM messagename');
  }

  private cmdShowDate(): string {
    const now = new Date();
    // Return ISO format for reliable parsing
    return now.toISOString();
  }

  private cmdListMessages(): string {
    const msgs = this.state.messages;
    if (this.state.echoOn) {
      return `Messages (${msgs.length}):\r\n${msgs.map((m, i) => `${i + 1}. ${m}${m === this.state.currentMessage ? ' (current)' : ''}`).join('\r\n')}`;
    }
    // Echo-off: still mark the current message so the app can detect it
    return msgs.map(m => m === this.state.currentMessage ? `${m} (current)` : m).join('\r\n');
  }

  private cmdCountQuery(): string {
    const s = this.state;
    if (s.echoOn) {
      return [
        `COUNT QUERY:`,
        `Product Count: ${s.productCount}`,
        `Print Count: ${s.printCount}`,
        `Counter 1: ${s.customCounters[0]}`,
        `Counter 2: ${s.customCounters[1]}`,
        `Counter 3: ${s.customCounters[2]}`,
        `Counter 4: ${s.customCounters[3]}`,
      ].join('\r\n');
    }
    return `PC[${s.productCount}] PrC[${s.printCount}] C1[${s.customCounters[0]}] C2[${s.customCounters[1]}] C3[${s.customCounters[2]}] C4[${s.customCounters[3]}]`;
  }

  private cmdShowTemperature(): string {
    if (this.state.echoOn) {
      return `Printhead: ${this.state.printheadTemp.toFixed(2)}°C\r\nElectronics: ${this.state.electronicsTemp.toFixed(2)}°C`;
    }
    return `PH[${this.state.printheadTemp.toFixed(2)}] EL[${this.state.electronicsTemp.toFixed(2)}]`;
  }

  private cmdShowRunTime(): string {
    if (this.state.echoOn) {
      return `Power Hours: ${this.state.powerHours.toFixed(1)}\r\nStream Hours: ${this.state.streamHours.toFixed(1)}`;
    }
    return `PWR[${this.state.powerHours.toFixed(1)}] STR[${this.state.streamHours.toFixed(1)}]`;
  }

  private cmdPrintHeight(cmd: string): string {
    const match = cmd.match(/\^PH\s*(\d+)/);
    if (match) {
      const value = parseInt(match[1]);
      if (value >= 0 && value <= 10) {
        this.state.printHeight = value;
        return this.state.echoOn ? `Command Successful!\r\nPrint Height: ${value}` : `PH: ${value}`;
      }
      return this.formatError(4, 'OutOfRange', 'Height must be 0-10');
    }
    return `Print Height: ${this.state.printHeight}`;
  }

  private cmdPrintWidth(cmd: string): string {
    const match = cmd.match(/\^PW\s*(\d+)/);
    if (match) {
      const value = parseInt(match[1]);
      if (value >= 0 && value <= 16000) {
        this.state.printWidth = value;
        return this.state.echoOn ? `Command Successful!\r\nPrint Width: ${value}` : `PW: ${value}`;
      }
      return this.formatError(4, 'OutOfRange', 'Width must be 0-16000');
    }
    return `Print Width: ${this.state.printWidth}`;
  }

  private cmdDelayAdjust(cmd: string): string {
    const match = cmd.match(/\^DA\s*(\d+)/);
    if (match) {
      const value = parseInt(match[1]);
      this.state.delay = value;
      return this.state.echoOn ? `Command Successful!\r\nDelay: ${value}` : `DA: ${value}`;
    }
    return `Delay: ${this.state.delay}`;
  }

  private cmdPitchAdjust(cmd: string): string {
    const match = cmd.match(/\^PA\s*(\d+)/);
    if (match) {
      const value = parseInt(match[1]);
      this.state.pitch = value;
      return this.state.echoOn ? `Command Successful!\r\nPitch: ${value}` : `PA: ${value}`;
    }
    return `Pitch: ${this.state.pitch}`;
  }

  private cmdLogin(cmd: string): string {
    const match = cmd.match(/\^LG\s+(\S+)/);
    if (match) {
      this.state.isLoggedIn = true;
      return this.state.echoOn ? 'Command Successful!\r\nLogged in' : 'Login OK';
    }
    return this.formatError(2, 'CmdFormat', 'Usage: ^LG password');
  }

  private cmdLogout(): string {
    this.state.isLoggedIn = false;
    return this.state.echoOn ? 'Command Successful!\r\nLogged out' : 'Logout OK';
  }

  private cmdChangeCounter(cmd: string): string {
    // ^CC C;V - Set counter C to value V
    // Counter IDs: 0 = Print, 1-4 = Custom, 6 = Product
    const match = cmd.match(/\^CC\s*(\d+)[;\s]+(\d+)/);
    if (match) {
      const counterId = parseInt(match[1]);
      const value = parseInt(match[2]);
      if (counterId === 0) {
        this.state.printCount = value;
        return this.state.echoOn ? `Command Successful!\r\nPrint Counter: ${value}` : `PC: ${value}`;
      } else if (counterId === 6) {
        this.state.productCount = value;
        return this.state.echoOn ? `Command Successful!\r\nProduct Counter: ${value}` : `PrC: ${value}`;
      } else if (counterId >= 1 && counterId <= 4) {
        this.state.customCounters[counterId - 1] = value;
        return this.state.echoOn ? `Command Successful!\r\nCounter ${counterId}: ${value}` : `C${counterId}: ${value}`;
      }
      return this.formatError(4, 'OutOfRange', 'Counter ID must be 0, 1-4, or 6');
    }
    return this.formatError(2, 'CmdFormat', 'Usage: ^CC counterId;value');
  }

  private cmdDeleteMessage(cmd: string): string {
    const match = cmd.match(/\^DM\s+(.+)/);
    if (match) {
      const msgName = match[1].trim().toUpperCase();
      if (msgName === this.state.currentMessage) {
        return this.formatError(8, 'DelFailed', 'Failed to delete message');
      }
      const idx = this.state.messages.indexOf(msgName);
      if (idx === -1) {
        return this.formatError(4, 'MsgNotFnd', 'Message not found');
      }
      this.state.messages.splice(idx, 1);
      this.persistMessages();
      return this.state.echoOn ? 'Command Successful!' : 'OK';
    }
    return this.formatError(2, 'CmdFormat', 'Invalid command format');
  }

  private cmdNewMessage(cmd: string): string {
    // Support: ^NM 0;0;0;16;MSGNAME[^AT...] or ^NM MSGNAME
    let msgName: string | null = null;

    const fullMatch = cmd.match(/\^NM\s*\d*;\d*;\d*;\d*;(\w+)/);
    if (fullMatch) {
      msgName = fullMatch[1].toUpperCase();
    } else {
      const simpleMatch = cmd.match(/\^NM\s+(\w+)/);
      if (simpleMatch) {
        msgName = simpleMatch[1].toUpperCase();
      }
    }

    if (!msgName) {
      return this.formatError(2, 'CmdFormat', 'Usage: ^NM t;s;o;p;name');
    }

    if (!this.state.messages.includes(msgName)) {
      this.state.messages.push(msgName);
    }
    this.persistMessages();
    return this.state.echoOn ? `Command Successful!\r\nMessage created: ${msgName}` : 'OK';
  }
  private formatError(code: number, type: string, message: string): string {
    return this.state.echoOn
      ? `ERROR ${code}: ${type}\r\n${message}`
      : `ERR[${code}] ${type}`;
  }

  setState<K extends keyof EmulatorState>(key: K, value: EmulatorState[K]) {
    this.state[key] = value;
    this.notifyListeners();
  }

  cycleInkLevel() {
    const levels: Array<'FULL' | 'GOOD' | 'LOW' | 'EMPTY'> = ['FULL', 'GOOD', 'LOW', 'EMPTY'];
    const currentIdx = levels.indexOf(this.state.inkLevel);
    const nextIdx = (currentIdx + 1) % levels.length;
    this.state.inkLevel = levels[nextIdx];
    this.notifyListeners();
  }

  cycleMakeupLevel() {
    const levels: Array<'FULL' | 'GOOD' | 'LOW' | 'EMPTY'> = ['FULL', 'GOOD', 'LOW', 'EMPTY'];
    const currentIdx = levels.indexOf(this.state.makeupLevel);
    const nextIdx = (currentIdx + 1) % levels.length;
    this.state.makeupLevel = levels[nextIdx];
    this.notifyListeners();
  }

  reset() {
    this.state = createDefaultState(this.config.initialState);
    this.commandLog = [];
    this.notifyListeners();
    this.notifyLogListeners();
  }
}

/**
 * Multi-Printer Emulator Manager
 */
class MultiPrinterEmulatorManager {
  private instances: Map<string, PrinterEmulatorInstance> = new Map();
  private enabledListeners: Set<(enabled: boolean) => void> = new Set();
  private _enabled: boolean = false;

  constructor() {
    // Initialize all predefined emulated printers
    EMULATED_PRINTERS.forEach(config => {
      const key = `${config.ipAddress}:${config.port}`;
      this.instances.set(key, new PrinterEmulatorInstance(config));
    });
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
    this.enabledListeners.forEach(listener => listener(value));
  }

  subscribeToEnabled(listener: (enabled: boolean) => void): () => void {
    this.enabledListeners.add(listener);
    return () => this.enabledListeners.delete(listener);
  }

  /**
   * Get all emulated printer configurations
   */
  getEmulatedPrinters(): SimulatedPrinter[] {
    if (!this._enabled) return [];
    return Array.from(this.instances.values()).map(inst => inst.getSimulatedPrinter());
  }

  /**
   * Get emulator instance by IP address (with or without port)
   */
  getInstanceByIp(ipAddress: string, port?: number): PrinterEmulatorInstance | null {
    if (!this._enabled) return null;
    
    // Try with port first
    const keyWithPort = `${ipAddress}:${port || 23}`;
    if (this.instances.has(keyWithPort)) {
      return this.instances.get(keyWithPort)!;
    }
    
    // Try matching just IP
    for (const [key, instance] of this.instances) {
      if (key.startsWith(ipAddress + ':')) {
        return instance;
      }
    }
    
    return null;
  }

  /**
   * Get emulator instance by printer ID
   */
  getInstanceById(id: number): PrinterEmulatorInstance | null {
    if (!this._enabled) return null;
    
    for (const instance of this.instances.values()) {
      if (instance.config.id === id) {
        return instance;
      }
    }
    
    return null;
  }

  /**
   * Check if an IP is an emulated printer
   */
  isEmulatedIp(ipAddress: string, port?: number): boolean {
    return this.getInstanceByIp(ipAddress, port) !== null;
  }

  /**
   * Process command for a specific printer
   */
  processCommand(ipAddress: string, port: number, command: string): { success: boolean; response: string } | null {
    const instance = this.getInstanceByIp(ipAddress, port);
    if (instance) {
      return instance.processCommand(command);
    }
    return null;
  }

  /**
   * Get state for a specific printer
   */
  getState(ipAddress: string, port?: number): EmulatorState | null {
    const instance = this.getInstanceByIp(ipAddress, port);
    return instance?.getState() || null;
  }

  /**
   * Subscribe to state changes for a specific printer
   */
  subscribe(ipAddress: string, port: number, listener: (state: EmulatorState) => void): () => void {
    const instance = this.getInstanceByIp(ipAddress, port);
    if (instance) {
      return instance.subscribe(listener);
    }
    return () => {};
  }

  /**
   * Reset all emulators to their initial states
   */
  resetAll() {
    this.instances.forEach(instance => instance.reset());
  }

  /**
   * Get the default/first emulated printer instance (for backward compatibility)
   */
  getDefaultInstance(): PrinterEmulatorInstance | null {
    if (!this._enabled) return null;
    return this.getInstanceById(1);
  }
}

// Singleton instance
export const multiPrinterEmulator = new MultiPrinterEmulatorManager();

// Re-export types
export { PROTOCOL_COMMANDS };
export type { EmulatorState, CommandLogEntry, SimulatedPrinter };
