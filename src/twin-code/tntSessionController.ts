/**
 * tntSessionController — wires the TnT TCP uplink to the TwinCode dispatcher.
 *
 * Implements the behaviour confirmed by Authentix on 2026-07-17
 * (mem://integration/authentix-tnt-answers-2026-07):
 *
 *  - CONFIG (0x10):  TnT hands us the FULL §5 Print Message (17 chars, or 24
 *    with lot code) whose serial sub-field is the STARTING serial. We validate
 *    the format, seed a PrintMessageCounter, and preflight the lid DataMatrix
 *    capacity. A malformed message is a Category 1 (fatal) condition — line
 *    stops and we wait for a valid (re-)Config. (Q1, Q5, Q11)
 *  - PRINT (0x20):   "start printing" command — NOT a per-bottle request (Q10).
 *    We arm the line and dispatch the incremented serial per bottle trigger.
 *  - REQUEST (0x30): reply with a STATUS frame carrying last serial, dispensed
 *    count, and current fault state.
 *  - Re-Config is identical to an original Config — unconditional reseed, no
 *    rewind/resume logic (Q11).
 *
 * ACKs are sent by electron/tntServer.cjs on frame receipt; this controller
 * only sends STATUS / FAULT outbound frames.
 *
 * PROVISIONAL: Config payload field names and the §5 offsets are placeholders
 * until Interface Spec §4/§5 text and the promised pcap arrive. Everything
 * spec-dependent is funnelled through `parseConfigPayload` and
 * `tntPrintMessage.ts` so the fix is localised.
 */

import {
  PrintMessageCounter,
  parsePrintMessage,
  serialWillWrap,
  checkDataMatrixCapacity,
  type ParsedPrintMessage,
} from "./tntPrintMessage";

/** Opcodes — keep in sync with electron/tntCodec.cjs. */
export const TNT_OPCODES = {
  CONFIG: 0x10,
  PRINT: 0x20,
  REQUEST: 0x30,
  ACK: 0x40,
  NACK: 0x4f,
  STATUS: 0x50,
  FAULT: 0x60,
} as const;

export type TntFaultCategory = 1 | 2;

export interface TntFault {
  category: TntFaultCategory;
  /** Category 2 sub-code — must come from Interface Spec §8 verbatim (Q6). */
  subCode: number | null;
  message: string;
  at: string;
}

export interface TntSessionState {
  /** True once a valid Config has seeded the serial counter. */
  configured: boolean;
  /** True after a Print (start) command and while no fatal fault is latched. */
  running: boolean;
  /** Latched Category 1 (fatal) fault — only a valid re-Config clears it. */
  fatal: TntFault | null;
  /** Last parsed Print Message (the template the serial increments inside). */
  template: ParsedPrintMessage | null;
  /** Bottles dispatched since the last (re-)Config. */
  dispensed: number;
  /** Last serial string actually dispatched. */
  lastSerial: string | null;
  /** DataMatrix capacity warning from preflight, if any. */
  capacityWarning: string | null;
}

/** Minimal shape of the electron TnT API this controller needs. */
export interface TntApiLike {
  send: (opcode: number, payload: unknown) => Promise<unknown> | unknown;
  onFrame: (cb: (entry: TntFrameEntryLike) => void) => (() => void) | void;
}

export interface TntFrameEntryLike {
  dir: "in" | "out";
  opcode: number;
  name?: string;
  payload?: unknown;
  json?: unknown;
}

/** Serial sink: production wires this to twinDispatcher.dispatch(). */
export type DispatchFn = (serial: string) => Promise<{ ok: boolean; error?: string }>;

export interface TntSessionControllerOptions {
  api: TntApiLike;
  dispatch: DispatchFn;
  /** Lid DataMatrix symbol currently configured (e.g. "16x16"). */
  lidSymbol?: string;
  /** Optional listener for UI/HUD state updates. */
  onState?: (state: TntSessionState) => void;
}

const INITIAL_STATE: TntSessionState = {
  configured: false,
  running: false,
  fatal: null,
  template: null,
  dispensed: 0,
  lastSerial: null,
  capacityWarning: null,
};

/**
 * Extract the §5 Print Message string from a Config payload.
 * PROVISIONAL: field names are placeholders pending Interface Spec §4 text.
 */
export function parseConfigPayload(json: unknown): { printMessage: string } | { error: string } {
  if (!json || typeof json !== "object") {
    return { error: "Config payload is missing or not an object" };
  }
  const o = json as Record<string, unknown>;
  const candidate =
    (typeof o.printMessage === "string" && o.printMessage) ||
    (typeof o.message === "string" && o.message) ||
    (typeof o.startMessage === "string" && o.startMessage) ||
    null;
  if (!candidate) {
    return { error: "Config payload has no printMessage field (provisional name — confirm §4)" };
  }
  return { printMessage: candidate };
}

export class TntSessionController {
  private api: TntApiLike;
  private dispatchFn: DispatchFn;
  private lidSymbol: string;
  private onState?: (state: TntSessionState) => void;
  private counter = new PrintMessageCounter();
  private state: TntSessionState = { ...INITIAL_STATE };
  private unsubscribe: (() => void) | null = null;

  constructor(opts: TntSessionControllerOptions) {
    this.api = opts.api;
    this.dispatchFn = opts.dispatch;
    this.lidSymbol = opts.lidSymbol ?? "16x16";
    this.onState = opts.onState;
  }

  start(): void {
    if (this.unsubscribe) return;
    const off = this.api.onFrame((entry) => {
      if (entry.dir !== "in") return;
      void this.handleFrame(entry);
    });
    this.unsubscribe = typeof off === "function" ? off : null;
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  getState(): TntSessionState {
    return { ...this.state };
  }

  private setState(patch: Partial<TntSessionState>): void {
    this.state = { ...this.state, ...patch };
    this.onState?.(this.getState());
  }

  private sendStatus(): void {
    void this.api.send(TNT_OPCODES.STATUS, {
      configured: this.state.configured,
      running: this.state.running,
      fatal: this.state.fatal,
      dispensed: this.state.dispensed,
      lastSerial: this.state.lastSerial,
      at: new Date().toISOString(),
    });
  }

  private sendFault(fault: TntFault): void {
    void this.api.send(TNT_OPCODES.FAULT, fault);
  }

  /** Category 1 = fatal: stop the line, latch the fault, wait for re-Config. */
  private raiseFatal(message: string): void {
    const fault: TntFault = {
      category: 1,
      subCode: null,
      message,
      at: new Date().toISOString(),
    };
    this.setState({ fatal: fault, running: false });
    this.sendFault(fault);
  }

  async handleFrame(entry: TntFrameEntryLike): Promise<void> {
    switch (entry.opcode) {
      case TNT_OPCODES.CONFIG:
        this.handleConfig(entry.json ?? entry.payload);
        return;
      case TNT_OPCODES.PRINT:
        await this.handlePrint();
        return;
      case TNT_OPCODES.REQUEST:
        this.sendStatus();
        return;
      default:
        return;
    }
  }

  /**
   * Config / re-Config. Per Q11 a re-Config is treated EXACTLY like an
   * original Config: unconditional reseed, clears any latched fatal fault.
   */
  handleConfig(json: unknown): { ok: boolean; error?: string } {
    const extracted = parseConfigPayload(json);
    if ("error" in extracted) {
      this.raiseFatal(extracted.error);
      return { ok: false, error: extracted.error };
    }
    try {
      const parsed = parsePrintMessage(extracted.printMessage);
      this.counter.reseed(extracted.printMessage);

      // Preflight: lid DataMatrix must hold the real payload (16x16 is NOT
      // enough for 17–24 chars — flagged for the template/protocol table).
      const cap = checkDataMatrixCapacity(parsed.compact.length, this.lidSymbol);

      this.setState({
        configured: true,
        running: false, // wait for the Print (start) command
        fatal: null,
        template: parsed,
        dispensed: 0,
        lastSerial: null,
        capacityWarning: cap.ok ? null : cap.message,
      });
      this.sendStatus();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.raiseFatal(`Config rejected: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  /**
   * Print = "start printing" (Q10). Arms the line. Per-bottle dispensing
   * happens via `dispenseNext()` when the line reports a bottle trigger.
   */
  async handlePrint(): Promise<void> {
    if (this.state.fatal) return; // line stays stopped until re-Config
    if (!this.counter.seeded) {
      this.raiseFatal("Print received before any valid Config (out-of-sync)");
      return;
    }
    if (!this.state.running) this.setState({ running: true });
    await this.dispenseNext();
  }

  /** Dispense the next bottle's serial through the dispatcher. */
  async dispenseNext(): Promise<{ ok: boolean; serial?: string; error?: string }> {
    if (this.state.fatal) return { ok: false, error: "fatal fault latched" };
    if (!this.state.running) return { ok: false, error: "line not started" };
    const template = this.state.template;
    if (!template) return { ok: false, error: "not configured" };

    // Fixed-width serial wrap is an out-of-sync condition — treat as fatal
    // and wait for TnT to re-Config with a fresh starting serial.
    if (serialWillWrap(template, this.counter.dispensed)) {
      this.raiseFatal(
        `Serial sub-field would wrap past ${template.serial.length} digits — re-Config required`,
      );
      return { ok: false, error: "serial wrap" };
    }

    const serial = this.counter.next();
    if (serial === null) return { ok: false, error: "not seeded" };

    const result = await this.dispatchFn(serial);
    if (!result.ok) {
      // Dispatch failures are line faults; category/sub-code mapping awaits
      // Interface Spec §8 (Q6) — send as Category 2 placeholder, sub-code 0.
      const fault: TntFault = {
        category: 2,
        subCode: 0, // placeholder until §8 lands
        message: result.error ?? "dispatch failed",
        at: new Date().toISOString(),
      };
      this.sendFault(fault);
      return { ok: false, error: result.error };
    }

    this.setState({
      dispensed: this.counter.dispensed,
      lastSerial: serial,
    });
    return { ok: true, serial };
  }
}
