/**
 * Printer Emulator for Development Mode
 * Simulates printer responses without needing actual hardware
 */

export interface EmulatorState {
  hvOn: boolean;
  jetRunning: boolean;
  v300up: boolean;
  vltOn: boolean;
  gutOn: boolean;
  modOn: boolean;
  modulation: number;
  charge: number;
  pressure: number;
  rps: number;
  phaseQual: number;
  viscosity: number;
  inkLevel: 'FULL' | 'LOW' | 'EMPTY';
  makeupLevel: 'GOOD' | 'LOW' | 'EMPTY';
  currentMessage: string;
  productCount: number;
  printCount: number;
}

export interface CommandLogEntry {
  timestamp: Date;
  command: string;
  response: string;
  direction: 'sent' | 'received';
}

const defaultState: EmulatorState = {
  hvOn: false,
  jetRunning: false,
  v300up: false,
  vltOn: true,
  gutOn: true,
  modOn: true,
  modulation: 110,
  charge: 75,
  pressure: 4.2,
  rps: 62500,
  phaseQual: 95,
  viscosity: 0.85,
  inkLevel: 'FULL',
  makeupLevel: 'GOOD',
  currentMessage: 'BC-GEN2',
  productCount: 1234,
  printCount: 5678,
};

class PrinterEmulator {
  private state: EmulatorState = { ...defaultState };
  private commandLog: CommandLogEntry[] = [];
  private listeners: Set<(state: EmulatorState) => void> = new Set();
  private logListeners: Set<(log: CommandLogEntry[]) => void> = new Set();
  private _enabled: boolean = false;

  get enabled() {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
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
    // Keep only last 50 entries
    if (this.commandLog.length > 50) {
      this.commandLog = this.commandLog.slice(0, 50);
    }
    this.notifyLogListeners();
  }

  /**
   * Process a command and return a simulated response
   */
  processCommand(command: string): { success: boolean; response: string } {
    const trimmedCommand = command.trim();
    this.addLog(trimmedCommand, '', 'sent');

    let response = '';

    // Parse command
    if (trimmedCommand.startsWith('^SU')) {
      // Status query - return current state
      response = this.generateStatusResponse();
    } else if (trimmedCommand.startsWith('^PR')) {
      // Print control (HV on/off)
      const match = trimmedCommand.match(/\^PR\s*([01])/);
      if (match) {
        const hvState = match[1] === '1';
        this.state.hvOn = hvState;
        this.state.v300up = hvState;
        response = hvState ? 'HV ON' : 'HV OFF';
      } else {
        response = 'OK';
      }
    } else if (trimmedCommand.startsWith('^SJ')) {
      // Jet control
      const match = trimmedCommand.match(/\^SJ\s*([01])/);
      if (match) {
        const jetState = match[1] === '1';
        this.state.jetRunning = jetState;
        if (!jetState) {
          // Stopping jet also turns off HV
          this.state.hvOn = false;
          this.state.v300up = false;
        }
        response = jetState ? 'JET START' : 'JET STOP';
      } else {
        response = 'OK';
      }
    } else if (trimmedCommand.startsWith('^VV')) {
      // Version query
      response = 'Version: v01.09.00.14';
    } else if (trimmedCommand.startsWith('^SM')) {
      // Select message
      const match = trimmedCommand.match(/\^SM\s*(.+)/);
      if (match) {
        this.state.currentMessage = match[1].trim();
        response = `Message selected: ${this.state.currentMessage}`;
      } else {
        response = 'OK';
      }
    } else {
      // Unknown command
      response = 'OK';
    }

    this.addLog(trimmedCommand, response, 'received');
    this.notifyListeners();

    return { success: true, response };
  }

  /**
   * Generate a ^SU status response matching protocol v2.0
   */
  private generateStatusResponse(): string {
    const lines = [
      `Modulation:${this.state.modulation}`,
      `Charge:${this.state.charge}`,
      `Pressure:${this.state.pressure.toFixed(1)}`,
      `RPS:${this.state.rps}`,
      `PhaseQual:${this.state.phaseQual}`,
      `Viscosity:${this.state.viscosity.toFixed(2)}`,
      `InkLevel:${this.state.inkLevel}`,
      `MakeupLevel:${this.state.makeupLevel}`,
      `V300UP:${this.state.v300up ? 1 : 0}`,
      `VLT_ON:${this.state.vltOn ? 1 : 0}`,
      `GUT_ON:${this.state.gutOn ? 1 : 0}`,
      `MOD_ON:${this.state.modOn ? 1 : 0}`,
      `HVDeflection:${this.state.hvOn ? 1 : 0}`,
      `PrintStatus:${this.state.hvOn ? 'Ready' : 'Not ready'}`,
      `CurrentMessage:${this.state.currentMessage}`,
      `ProductCount:${this.state.productCount}`,
      `PrintCount:${this.state.printCount}`,
    ];
    return lines.join('\r\n');
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
      }
      
      this.notifyListeners();
    }
  }

  /**
   * Set a numeric state value
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
