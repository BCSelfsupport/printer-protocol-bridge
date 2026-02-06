/**
 * Printer Emulator for Development Mode
 * Simulates printer responses following the Bestcode Remote Communication Protocol v2.0
 */

export interface EmulatorState {
  // System states
  hvOn: boolean;
  jetRunning: boolean;
  v300up: boolean;
  vltOn: boolean;
  gutOn: boolean;
  modOn: boolean;
  echoOn: boolean;
  utf8Mode: boolean;
  oneToOneMode: boolean;
  forcePhotoEye: boolean;
  autoAlign: boolean;
  isLoggedIn: boolean;
  
  // Metrics
  modulation: number;
  charge: number;
  pressure: number;
  rps: number;
  phaseQual: number;
  viscosity: number;
  
  // Levels
  inkLevel: 'FULL' | 'GOOD' | 'LOW' | 'EMPTY';
  makeupLevel: 'GOOD' | 'LOW' | 'EMPTY';
  
  // Temperatures
  printheadTemp: number;
  electronicsTemp: number;
  
  // Message & printing
  currentMessage: string;
  productCount: number;
  printCount: number;
  customCounters: number[];
  
  // Settings
  delay: number;
  delayReverse: number;
  photoEyeTriggerDelay: number;
  pitch: number;
  printHeight: number;
  printWidth: number;
  repeatCount: number;
  gap: number;
  bold: number;
  
  // Runtime
  powerHours: number;
  streamHours: number;
  
  // Messages store
  messages: string[];
  logos: string[];
  
  // Errors
  errorsOn: boolean;
}

export interface CommandLogEntry {
  timestamp: Date;
  command: string;
  response: string;
  direction: 'sent' | 'received';
}

// Simulated printer info for dev mode
export interface SimulatedPrinter {
  id: number;
  name: string;
  ipAddress: string;
  port: number;
  isAvailable: boolean;
  status: 'ready' | 'not_ready' | 'offline';
}

// Protocol v2.0 command definitions
export interface ProtocolCommand {
  code: string;
  name: string;
  description: string;
  category: 'system' | 'message' | 'printing' | 'query' | 'settings' | 'one-to-one';
}

export const PROTOCOL_COMMANDS: ProtocolCommand[] = [
  // System Commands
  { code: '^VV', name: 'View Version', description: 'Display firmware version', category: 'system' },
  { code: '^EN', name: 'Echo On', description: 'Enable command echo and verbose output', category: 'system' },
  { code: '^EF', name: 'Echo Off', description: 'Disable command echo, terse output', category: 'system' },
  { code: '^SJ 0', name: 'Stop Jet', description: 'Stop the ink jet', category: 'system' },
  { code: '^SJ 1', name: 'Start Jet', description: 'Start the ink jet', category: 'system' },
  { code: '^UT 0', name: 'UTF-8 Off', description: 'Disable UTF-8 mode', category: 'system' },
  { code: '^UT 1', name: 'UTF-8 On', description: 'Enable UTF-8 mode', category: 'system' },
  { code: '^LG', name: 'Login', description: 'Sign in with password (^LG password)', category: 'system' },
  { code: '^LO', name: 'Logout', description: 'Sign out of the printer', category: 'system' },
  
  // Query Commands
  { code: '^SU', name: 'Status Update', description: 'Query printer status (modulation, charge, pressure, etc.)', category: 'query' },
  { code: '^CN', name: 'Count Query', description: 'Query product count, print count, and custom counters', category: 'query' },
  { code: '^TM', name: 'Show Run Time', description: 'Show total run time hours', category: 'query' },
  { code: '^TP', name: 'Show Temperature', description: 'Show printhead and electronics temperature', category: 'query' },
  { code: '^SD', name: 'Show Date', description: 'Display current date and time', category: 'query' },
  { code: '^LM', name: 'List Messages', description: 'List all available messages', category: 'query' },
  { code: '^LL', name: 'List Logos', description: 'List all available graphics/logos', category: 'query' },
  { code: '^LF', name: 'List Fields', description: 'List fields in current or specified message', category: 'query' },
  { code: '^GM', name: 'Get Message Params', description: 'Get parameters of current or specified message', category: 'query' },
  { code: '^MS', name: 'One-to-One Status', description: 'Query One-to-One print mode status', category: 'query' },
  
  // Printing Commands
  { code: '^PR 0', name: 'Disable Printing', description: 'Turn off HV deflection (disable printing)', category: 'printing' },
  { code: '^PR 1', name: 'Enable Printing', description: 'Turn on HV deflection (enable printing)', category: 'printing' },
  { code: '^PT', name: 'Force Print', description: 'Force a print trigger', category: 'printing' },
  { code: '^FE', name: 'Force Photo Eye', description: 'Enable automatic photo eye trigger in 1-1 mode', category: 'printing' },
  { code: '^FF', name: 'Force Photo Eye Off', description: 'Disable automatic photo eye trigger', category: 'printing' },
  
  // Message Commands
  { code: '^SM', name: 'Select Message', description: 'Select a message for printing', category: 'message' },
  { code: '^NM', name: 'New Message', description: 'Create a new message', category: 'message' },
  { code: '^CM', name: 'Change Message', description: 'Change message parameters', category: 'message' },
  { code: '^DM', name: 'Delete Message', description: 'Delete a message', category: 'message' },
  { code: '^VM', name: 'View Message', description: 'View message as bitmap', category: 'message' },
  { code: '^MD', name: 'Message Data', description: 'Modify message field data', category: 'message' },
  { code: '^CF', name: 'Change Field', description: 'Change field parameters', category: 'message' },
  
  // Settings Commands
  { code: '^DA', name: 'Delay Adjust', description: 'Adjust print delay', category: 'settings' },
  { code: '^DR', name: 'Delay Reverse', description: 'Adjust reverse print delay', category: 'settings' },
  { code: '^DP', name: 'Delay Print Trigger', description: 'Adjust trigger delay for 1-1 mode', category: 'settings' },
  { code: '^PA', name: 'Pitch Adjust', description: 'Adjust print pitch', category: 'settings' },
  { code: '^PH', name: 'Print Height', description: 'Adjust print height (0-10)', category: 'settings' },
  { code: '^PW', name: 'Print Width', description: 'Adjust print width (0-16000)', category: 'settings' },
  { code: '^RA', name: 'Repeat Adjust', description: 'Adjust repeat count', category: 'settings' },
  { code: '^GP', name: 'Set Gap', description: 'Adjust character gap (0-9)', category: 'settings' },
  { code: '^SB', name: 'Set Bold', description: 'Adjust bold value', category: 'settings' },
  { code: '^SA', name: 'Set Auto Align', description: 'Enable/disable auto alignment', category: 'settings' },
  { code: '^CC', name: 'Change Counter', description: 'Modify counter settings', category: 'settings' },
  { code: '^CD', name: 'Change Date Delimiter', description: 'Change date separator character', category: 'settings' },
  { code: '^CH', name: 'Change Time Delimiter', description: 'Change time separator character', category: 'settings' },
  
  // One-to-One Mode Commands
  { code: '^MB', name: 'One-to-One Begin', description: 'Enter One-to-One print mode', category: 'one-to-one' },
  { code: '^ME', name: 'One-to-One End', description: 'Exit One-to-One print mode', category: 'one-to-one' },
];

const defaultState: EmulatorState = {
  hvOn: false,
  jetRunning: false,
  v300up: false,
  vltOn: true,
  gutOn: true,
  modOn: true,
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
  
  inkLevel: 'GOOD',
  makeupLevel: 'GOOD',
  
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
};

class PrinterEmulator {
  private state: EmulatorState = { ...defaultState };
  private commandLog: CommandLogEntry[] = [];
  private listeners: Set<(state: EmulatorState) => void> = new Set();
  private logListeners: Set<(log: CommandLogEntry[]) => void> = new Set();
  private enabledListeners: Set<(enabled: boolean) => void> = new Set();
  private _enabled: boolean = false;
  
  private readonly VERSION = 'v01.09.00.14';
  private readonly BUILD_DATE = 'Feb 06 2026 10:30:00';

  // The simulated printer that appears when emulator is enabled
  private readonly simulatedPrinter: SimulatedPrinter = {
    id: 1,
    name: 'Printer 1',
    ipAddress: '192.168.1.55',
    port: 23,
    isAvailable: true,
    status: 'not_ready',
  };

  get enabled() {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
    // Notify listeners when emulator is toggled
    this.enabledListeners.forEach(listener => listener(value));
  }

  /**
   * Get the simulated printer info (available when emulator is enabled)
   */
  getSimulatedPrinter(): SimulatedPrinter | null {
    if (!this._enabled) return null;
    // Return current status based on emulator state
    return {
      ...this.simulatedPrinter,
      isAvailable: true,
      status: this.state.hvOn ? 'ready' : 'not_ready',
    };
  }

  /**
   * Subscribe to emulator enabled/disabled changes
   */
  subscribeToEnabled(listener: (enabled: boolean) => void): () => void {
    this.enabledListeners.add(listener);
    return () => this.enabledListeners.delete(listener);
  }

  getState(): EmulatorState {
    return { ...this.state };
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
    // Keep only last 100 entries
    if (this.commandLog.length > 100) {
      this.commandLog = this.commandLog.slice(0, 100);
    }
    this.notifyLogListeners();
  }

  /**
   * Process a command and return a simulated response
   * Following Bestcode Remote Communication Protocol v2.0
   */
  processCommand(command: string): { success: boolean; response: string } {
    const trimmedCommand = command.trim().toUpperCase();
    this.addLog(command.trim(), '', 'sent');

    let response = '';
    let success = true;

    try {
      // Parse and execute command
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
      } else if (trimmedCommand.startsWith('^LL')) {
        response = this.cmdListLogos();
      } else if (trimmedCommand.startsWith('^CN')) {
        response = this.cmdCountQuery();
      } else if (trimmedCommand.startsWith('^TM')) {
        response = this.cmdShowRunTime();
      } else if (trimmedCommand.startsWith('^TP')) {
        response = this.cmdShowTemperature();
      } else if (trimmedCommand.startsWith('^SD')) {
        response = this.cmdShowDate();
      } else if (trimmedCommand.startsWith('^DA')) {
        response = this.cmdDelayAdjust(trimmedCommand);
      } else if (trimmedCommand.startsWith('^DR')) {
        response = this.cmdDelayReverse(trimmedCommand);
      } else if (trimmedCommand.startsWith('^DP')) {
        response = this.cmdDelayPrintTrigger(trimmedCommand);
      } else if (trimmedCommand.startsWith('^PA')) {
        response = this.cmdPitchAdjust(trimmedCommand);
      } else if (trimmedCommand.startsWith('^PH')) {
        response = this.cmdPrintHeight(trimmedCommand);
      } else if (trimmedCommand.startsWith('^PW')) {
        response = this.cmdPrintWidth(trimmedCommand);
      } else if (trimmedCommand.startsWith('^RA')) {
        response = this.cmdRepeatAdjust(trimmedCommand);
      } else if (trimmedCommand.startsWith('^GP')) {
        response = this.cmdSetGap(trimmedCommand);
      } else if (trimmedCommand.startsWith('^SB')) {
        response = this.cmdSetBold(trimmedCommand);
      } else if (trimmedCommand.startsWith('^SA')) {
        response = this.cmdSetAutoAlign(trimmedCommand);
      } else if (trimmedCommand.startsWith('^PT')) {
        response = this.cmdForcePrint();
      } else if (trimmedCommand.startsWith('^FE')) {
        response = this.cmdForcePhotoEye();
      } else if (trimmedCommand.startsWith('^FF')) {
        response = this.cmdForcePhotoEyeOff();
      } else if (trimmedCommand.startsWith('^MB')) {
        response = this.cmdOneToOneBegin();
      } else if (trimmedCommand.startsWith('^ME')) {
        response = this.cmdOneToOneEnd();
      } else if (trimmedCommand.startsWith('^MS')) {
        response = this.cmdOneToOneStatus();
      } else if (trimmedCommand.startsWith('^UT')) {
        response = this.cmdUtf8Mode(trimmedCommand);
      } else if (trimmedCommand.startsWith('^GM')) {
        response = this.cmdGetMessageParams(trimmedCommand);
      } else if (trimmedCommand.startsWith('^LF')) {
        response = this.cmdListFields(trimmedCommand);
      } else if (trimmedCommand.startsWith('^DM')) {
        response = this.cmdDeleteMessage(trimmedCommand);
      } else if (trimmedCommand.startsWith('^NM')) {
        response = this.cmdNewMessage(trimmedCommand);
      } else if (trimmedCommand.startsWith('^CM')) {
        response = this.cmdChangeMessage(trimmedCommand);
      } else if (trimmedCommand.startsWith('^CF')) {
        response = this.cmdChangeField(trimmedCommand);
      } else if (trimmedCommand.startsWith('^MD')) {
        response = this.cmdMessageData(trimmedCommand);
      } else if (trimmedCommand.startsWith('^CC')) {
        response = this.cmdChangeCounter(trimmedCommand);
      } else if (trimmedCommand.startsWith('^CD')) {
        response = this.cmdChangeDateDelimiter(trimmedCommand);
      } else if (trimmedCommand.startsWith('^CH')) {
        response = this.cmdChangeTimeDelimiter(trimmedCommand);
      } else if (trimmedCommand.startsWith('^VM')) {
        response = this.cmdViewMessage(trimmedCommand);
      } else if (trimmedCommand.startsWith('^LG')) {
        response = this.cmdLogin(trimmedCommand);
      } else if (trimmedCommand.startsWith('^LO')) {
        response = this.cmdLogout();
      } else {
        // Unknown command
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

  // ============ Command Implementations ============

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
      ].join('\r\n');
    } else {
      return [
        `Mod[${s.modulation}] Chg[${s.charge}] Prs[${s.pressure}] RPS[${s.rps.toFixed(2)}] PhQ[${s.phaseQual}%] Err[${s.errorsOn ? 1 : 0}] HvD[${s.hvOn ? 1 : 0}] Vis[${s.viscosity.toFixed(2)}]`,
        `INK: ${s.inkLevel} MAKEUP: ${s.makeupLevel}`,
        `V300UP: ${s.v300up ? 1 : 0} VLT_ON: ${s.vltOn ? 1 : 0} GUT_ON: ${s.gutOn ? 1 : 0} MOD_ON: ${s.modOn ? 1 : 0}`,
        `PRINT: ${s.hvOn && s.jetRunning ? 'Ready' : 'Not ready'}`,
      ].join('\r\n');
    }
  }

  private cmdStartStopJet(cmd: string): string {
    const match = cmd.match(/\^SJ\s*([01])/);
    if (match) {
      const start = match[1] === '1';
      if (start) {
        this.state.jetRunning = true;
        // Simulate startup progress
        return this.state.echoOn 
          ? 'Command Successful!\r\nProgress: 100%'
          : 'Progress: 100%';
      } else {
        this.state.jetRunning = false;
        this.state.hvOn = false;
        this.state.v300up = false;
        return this.state.echoOn 
          ? 'Command Successful!\r\nProgress: 100%'
          : 'Progress: 100%';
      }
    }
    return this.formatError(2, 'CmdFormat', 'Invalid command format');
  }

  private cmdPrintControl(cmd: string): string {
    const match = cmd.match(/\^PR\s*([01])/);
    if (match) {
      const enable = match[1] === '1';
      if (enable && !this.state.jetRunning) {
        return this.formatError(59, 'CantPrint', 'Cannot enable printing');
      }
      this.state.hvOn = enable;
      this.state.v300up = enable;
      return this.formatSuccess();
    }
    return this.formatError(2, 'CmdFormat', 'Invalid command format');
  }

  private cmdSelectMessage(cmd: string): string {
    const match = cmd.match(/\^SM\s*(.*)/);
    if (match && match[1].trim()) {
      const msgName = match[1].trim().toUpperCase();
      if (this.state.messages.includes(msgName)) {
        this.state.currentMessage = msgName;
        return this.formatSuccess();
      }
      return this.formatError(4, 'MsgNotFnd', 'Message not found');
    }
    // No message specified - show current
    return this.state.currentMessage;
  }

  private cmdListMessages(): string {
    return this.state.messages.join('\r\n') + '\r\n//EOL';
  }

  private cmdListLogos(): string {
    return this.state.logos.join('\r\n');
  }

  private cmdCountQuery(): string {
    const s = this.state;
    if (s.echoOn) {
      return `Product:${s.productCount}, Print:${s.printCount}, Custom1:${s.customCounters[0]}, Custom2:${s.customCounters[1]}, Custom3:${s.customCounters[2]}, Custom4:${s.customCounters[3]}`;
    }
    return `${s.productCount},${s.printCount},${s.customCounters.join(',')}`;
  }

  private cmdShowRunTime(): string {
    return `${this.state.powerHours.toFixed(1)} hours`;
  }

  private cmdShowTemperature(): string {
    if (this.state.echoOn) {
      return `TEMPS: Printhead[${this.state.printheadTemp.toFixed(2)}°C] Electric[${this.state.electronicsTemp.toFixed(2)}°C]`;
    }
    return `P[${this.state.printheadTemp.toFixed(2)}] E[${this.state.electronicsTemp.toFixed(2)}]`;
  }

  private cmdShowDate(): string {
    const now = new Date();
    return now.toLocaleString();
  }

  private cmdDelayAdjust(cmd: string): string {
    const match = cmd.match(/\^DA\s*(\d+)/);
    if (match) {
      const delay = parseInt(match[1]);
      if (delay >= 0 && delay <= 4000000000) {
        this.state.delay = delay;
        return this.formatSuccess();
      }
      return this.formatError(28, 'InvDelay', 'Invalid Delay value');
    }
    return `Delay: ${this.state.delay}`;
  }

  private cmdDelayReverse(cmd: string): string {
    const match = cmd.match(/\^DR\s*(\d+)/);
    if (match) {
      this.state.delayReverse = parseInt(match[1]);
      return this.formatSuccess();
    }
    return `DelayReverse: ${this.state.delayReverse}`;
  }

  private cmdDelayPrintTrigger(cmd: string): string {
    const match = cmd.match(/\^DP\s*(\d+)/);
    if (match) {
      const delay = parseInt(match[1]);
      if (delay >= 0 && delay <= 30000) {
        this.state.photoEyeTriggerDelay = delay;
        return this.state.echoOn ? `PhotoEye trigger = ${delay}` : `PET:${delay}`;
      }
      return this.formatError(29, 'InvTrig', 'Invalid Trigger Delay value');
    }
    return `PET:${this.state.photoEyeTriggerDelay}`;
  }

  private cmdPitchAdjust(cmd: string): string {
    const match = cmd.match(/\^PA\s*(\d+)/);
    if (match) {
      const pitch = parseInt(match[1]);
      if (pitch >= 0 && pitch <= 4000000000) {
        this.state.pitch = pitch;
        return this.formatSuccess();
      }
      return this.formatError(30, 'InvPitch', 'Invalid Pitch value');
    }
    return `Pitch: ${this.state.pitch}`;
  }

  private cmdPrintHeight(cmd: string): string {
    const match = cmd.match(/\^PH\s*(\d+)/);
    if (match) {
      const height = parseInt(match[1]);
      if (height >= 0 && height <= 10) {
        this.state.printHeight = height;
        return this.formatSuccess();
      }
      return this.formatError(31, 'InvHeight', 'Invalid Pad Height value');
    }
    return `Height: ${this.state.printHeight}`;
  }

  private cmdPrintWidth(cmd: string): string {
    const match = cmd.match(/\^PW\s*(\d+)/);
    if (match) {
      const width = parseInt(match[1]);
      if (width >= 0 && width <= 16000) {
        this.state.printWidth = width;
        return this.formatSuccess();
      }
      return this.formatError(32, 'InvWidth', 'Invalid Pad Width value');
    }
    return `Width: ${this.state.printWidth}`;
  }

  private cmdRepeatAdjust(cmd: string): string {
    const match = cmd.match(/\^RA\s*(\d+)/);
    if (match) {
      const count = parseInt(match[1]);
      if (count >= 0 && count <= 30000) {
        this.state.repeatCount = count;
        return this.formatSuccess();
      }
      return this.formatError(33, 'InvRepeat', 'Invalid Repeat value');
    }
    return `Repeat: ${this.state.repeatCount}`;
  }

  private cmdSetGap(cmd: string): string {
    const match = cmd.match(/\^GP\s*(\d+)/);
    if (match) {
      const gap = parseInt(match[1]);
      if (gap >= 0 && gap <= 9) {
        this.state.gap = gap;
        return this.formatSuccess();
      }
      return this.formatError(27, 'InvGap', 'Invalid Gap value');
    }
    return `Gap: ${this.state.gap}`;
  }

  private cmdSetBold(cmd: string): string {
    const match = cmd.match(/\^SB\s*(\d+)/);
    if (match) {
      this.state.bold = parseInt(match[1]);
      return this.formatSuccess();
    }
    return `Bold: ${this.state.bold}`;
  }

  private cmdSetAutoAlign(cmd: string): string {
    const match = cmd.match(/\^SA\s*([01])/);
    if (match) {
      this.state.autoAlign = match[1] === '1';
      return this.formatSuccess();
    }
    return `AutoAlign: ${this.state.autoAlign ? 1 : 0}`;
  }

  private cmdForcePrint(): string {
    if (!this.state.hvOn) {
      return this.formatError(59, 'CantPrint', 'Cannot enable printing');
    }
    this.state.printCount++;
    this.state.productCount++;
    return this.formatSuccess();
  }

  private cmdForcePhotoEye(): string {
    this.state.forcePhotoEye = true;
    return this.state.echoOn ? 'Force PhotoEye trigger.' : 'On';
  }

  private cmdForcePhotoEyeOff(): string {
    this.state.forcePhotoEye = false;
    return this.state.echoOn ? 'Disable PhotoEye trigger.' : 'Off';
  }

  private cmdOneToOneBegin(): string {
    if (!this.state.jetRunning) {
      return this.formatError(7, 'JetStopped', 'Jet not running');
    }
    this.state.oneToOneMode = true;
    this.state.forcePhotoEye = false;
    this.state.photoEyeTriggerDelay = 0;
    return this.state.echoOn ? 'OnetoOne Print Mode\r\nCommand Successful!' : '1-1';
  }

  private cmdOneToOneEnd(): string {
    this.state.oneToOneMode = false;
    return this.state.echoOn ? 'Normal Print Mode\r\nCommand Successful!' : 'NORM';
  }

  private cmdOneToOneStatus(): string {
    const on = this.state.oneToOneMode;
    return this.state.echoOn ? `OnetoOne mode=${on ? 'ON' : 'OFF'}` : `1-1=${on ? 'ON' : 'OFF'}`;
  }

  private cmdUtf8Mode(cmd: string): string {
    const match = cmd.match(/\^UT\s*([01])/);
    if (match) {
      this.state.utf8Mode = match[1] === '1';
      return this.formatSuccess();
    }
    return `UTF-8: ${this.state.utf8Mode ? 1 : 0}`;
  }

  private cmdGetMessageParams(_cmd: string): string {
    // Simplified response
    return `T:4 S:0 O:0 P:0`;
  }

  private cmdListFields(_cmd: string): string {
    return [
      `${this.state.currentMessage}: H:16 L:1 W:135 S:0 R:0 P:0`,
      'Fields (1):',
      'Field 1: T:4000 (0, 0) W:87 H:16 B:0 G:1, R:0',
      `Element: T:0 D:${this.state.currentMessage}`,
    ].join('\r\n');
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
      return this.formatSuccess();
    }
    return this.formatError(2, 'CmdFormat', 'Invalid command format');
  }

  private cmdNewMessage(cmd: string): string {
    // Simplified: just add the message name
    const match = cmd.match(/\^NM\s*\d*;\d*;\d*;\d*;(\w+)/);
    if (match) {
      const msgName = match[1].toUpperCase();
      if (!this.state.messages.includes(msgName)) {
        this.state.messages.push(msgName);
      }
      return this.formatSuccess();
    }
    return this.formatSuccess();
  }

  private cmdChangeMessage(_cmd: string): string {
    return this.formatSuccess();
  }

  private cmdChangeField(_cmd: string): string {
    return this.formatSuccess();
  }

  private cmdMessageData(_cmd: string): string {
    if (this.state.oneToOneMode) {
      return 'R';
    }
    return this.formatSuccess();
  }

  private cmdChangeCounter(_cmd: string): string {
    return this.formatSuccess();
  }

  private cmdChangeDateDelimiter(_cmd: string): string {
    return this.formatSuccess();
  }

  private cmdChangeTimeDelimiter(_cmd: string): string {
    return this.formatSuccess();
  }

  private cmdViewMessage(_cmd: string): string {
    // Return a placeholder for message view
    return '<img alt="" src="data:image/bmp;base64,..." />';
  }

  // ============ Helper Methods ============

  private formatSuccess(): string {
    return this.state.echoOn ? 'Command Successful!' : '>';
  }

  private formatError(code: number, shortMsg: string, longMsg: string): string {
    return this.state.echoOn ? `Error ${code}: ${longMsg}` : `? ${code}: ${shortMsg}`;
  }

  /**
   * Manually toggle a state value (for dev panel)
   */
  toggleState(key: keyof EmulatorState) {
    const current = this.state[key];
    if (typeof current === 'boolean') {
      (this.state as any)[key] = !current;
      
      // Handle dependencies
      if (key === 'hvOn') {
        this.state.v300up = this.state.hvOn;
      }
      if (key === 'jetRunning' && !this.state.jetRunning) {
        this.state.hvOn = false;
        this.state.v300up = false;
        this.state.oneToOneMode = false;
      }
      
      this.notifyListeners();
    }
  }

  /**
   * Cycle ink level for testing (FULL -> LOW -> EMPTY -> FULL)
   */
  cycleInkLevel() {
    const levels: Array<'FULL' | 'LOW' | 'EMPTY'> = ['FULL', 'LOW', 'EMPTY'];
    const currentIdx = levels.indexOf(this.state.inkLevel === 'GOOD' ? 'FULL' : this.state.inkLevel);
    const nextIdx = (currentIdx + 1) % levels.length;
    this.state.inkLevel = levels[nextIdx];
    this.notifyListeners();
  }

  /**
   * Cycle makeup level for testing (GOOD -> LOW -> EMPTY -> GOOD)
   */
  cycleMakeupLevel() {
    const levels: Array<'GOOD' | 'LOW' | 'EMPTY'> = ['GOOD', 'LOW', 'EMPTY'];
    const actualIdx = levels.findIndex(l => l === this.state.makeupLevel);
    const nextIdx = (actualIdx === -1 ? 0 : actualIdx + 1) % levels.length;
    this.state.makeupLevel = levels[nextIdx];
    this.notifyListeners();
  }

  // ============ Login/Logout Commands ============
  
  private readonly ADMIN_PASSWORD = 'TEXAS';

  private cmdLogin(cmd: string): string {
    // Extract password from command: ^LG password or ^LG;password
    const match = cmd.match(/\^LG[\s;]+(.+)/i);
    if (match) {
      const password = match[1].trim();
      if (password.toUpperCase() === this.ADMIN_PASSWORD) {
        this.state.isLoggedIn = true;
        return this.state.echoOn 
          ? 'Command Successful!\r\nLogin accepted - Admin access granted'
          : 'Login OK';
      } else {
        return this.formatError(5, 'AuthFail', 'Invalid password');
      }
    }
    return this.formatError(2, 'CmdFormat', 'Usage: ^LG password');
  }

  private cmdLogout(): string {
    this.state.isLoggedIn = false;
    return this.state.echoOn
      ? 'Command Successful!\r\nLogged out'
      : 'Logout OK';
  }

  /**
   * Set a state value
   */
  setState<K extends keyof EmulatorState>(key: K, value: EmulatorState[K]) {
    this.state[key] = value;
    this.notifyListeners();
  }

  /**
   * Reset to default state
   */
  reset() {
    this.state = { ...defaultState };
    this.commandLog = [];
    this.notifyListeners();
    this.notifyLogListeners();
  }
}

// Singleton instance
export const printerEmulator = new PrinterEmulator();
