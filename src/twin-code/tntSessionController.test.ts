import { describe, it, expect, vi } from "vitest";
import {
  TntSessionController,
  TNT_OPCODES,
  parseConfigPayload,
  type TntApiLike,
  type TntFrameEntryLike,
} from "./tntSessionController";

const VALID_17 = "300108A180220274U"; // production 3, config 001, line 08, code A180, serial 220274, unit U

function makeApi() {
  const sent: Array<{ opcode: number; payload: unknown }> = [];
  let frameCb: ((e: TntFrameEntryLike) => void) | null = null;
  const api: TntApiLike = {
    send: vi.fn((opcode: number, payload: unknown) => {
      sent.push({ opcode, payload });
    }),
    onFrame: (cb) => {
      frameCb = cb;
      return () => {
        frameCb = null;
      };
    },
  };
  return {
    api,
    sent,
    emit: (e: TntFrameEntryLike) => frameCb?.(e),
  };
}

function makeController(overrides?: { dispatchFail?: boolean }) {
  const { api, sent, emit } = makeApi();
  const dispatch = vi.fn(async (serial: string) =>
    overrides?.dispatchFail ? { ok: false, error: "no C ack" } : { ok: true, serial },
  );
  const ctl = new TntSessionController({ api, dispatch });
  ctl.start();
  return { ctl, api, sent, emit, dispatch };
}

describe("parseConfigPayload", () => {
  it("extracts the print message from a Config payload", () => {
    expect(parseConfigPayload({ printMessage: VALID_17 })).toEqual({ printMessage: VALID_17 });
  });
  it("rejects a payload without a message field", () => {
    const r = parseConfigPayload({ partType: "X" });
    expect("error" in r).toBe(true);
  });
});

describe("TntSessionController", () => {
  it("seeds on Config and reports STATUS", () => {
    const { emit, sent, ctl } = makeController();
    emit({ dir: "in", opcode: TNT_OPCODES.CONFIG, json: { printMessage: VALID_17 } });
    expect(ctl.getState().configured).toBe(true);
    expect(ctl.getState().template?.serialValue).toBe(220274);
    expect(sent.some((f) => f.opcode === TNT_OPCODES.STATUS)).toBe(true);
  });

  it("flags the 16x16 DataMatrix capacity shortfall for a 17-char payload", () => {
    const { emit, ctl } = makeController();
    emit({ dir: "in", opcode: TNT_OPCODES.CONFIG, json: { printMessage: VALID_17 } });
    expect(ctl.getState().capacityWarning).toMatch(/16x16/);
    expect(ctl.getState().capacityWarning).toMatch(/18x18/);
  });

  it("latches a Category 1 fatal on a malformed Config and rejects Prints", async () => {
    const { emit, sent, ctl, dispatch } = makeController();
    emit({ dir: "in", opcode: TNT_OPCODES.CONFIG, json: { printMessage: "TOOSHORT" } });
    expect(ctl.getState().fatal?.category).toBe(1);
    expect(sent.some((f) => f.opcode === TNT_OPCODES.FAULT)).toBe(true);
    emit({ dir: "in", opcode: TNT_OPCODES.PRINT });
    await Promise.resolve();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("raises Category 1 (out-of-sync) on Print before Config", async () => {
    const { emit, ctl } = makeController();
    emit({ dir: "in", opcode: TNT_OPCODES.PRINT });
    await Promise.resolve();
    expect(ctl.getState().fatal?.category).toBe(1);
  });

  it("dispenses incremented serials per bottle after Print", async () => {
    const { emit, ctl, dispatch } = makeController();
    emit({ dir: "in", opcode: TNT_OPCODES.CONFIG, json: { printMessage: VALID_17 } });
    emit({ dir: "in", opcode: TNT_OPCODES.PRINT });
    await Promise.resolve();
    await Promise.resolve();
    await ctl.dispenseNext();
    expect(dispatch).toHaveBeenNthCalledWith(1, "300108A180220274U"); // starting serial first
    expect(dispatch).toHaveBeenNthCalledWith(2, "300108A180220275U"); // incremented in-format
    expect(ctl.getState().dispensed).toBe(2);
  });

  it("treats re-Config as a full reseed (no rewind/resume)", () => {
    const { emit, ctl } = makeController();
    emit({ dir: "in", opcode: TNT_OPCODES.CONFIG, json: { printMessage: VALID_17 } });
    ctl.handleConfig({ printMessage: "300108A180000001U" }); // TnT sends fresh starting serial
    expect(ctl.getState().template?.serialValue).toBe(1);
    expect(ctl.getState().dispensed).toBe(0);
    expect(ctl.getState().fatal).toBeNull();
  });

  it("answers a Request with a STATUS frame", () => {
    const { emit, sent } = makeController();
    emit({ dir: "in", opcode: TNT_OPCODES.REQUEST });
    const status = sent.find((f) => f.opcode === TNT_OPCODES.STATUS);
    expect(status).toBeTruthy();
  });

  it("reports dispatch failures as Category 2 faults (§8 sub-code pending)", async () => {
    const { emit, sent, ctl } = makeController({ dispatchFail: true });
    emit({ dir: "in", opcode: TNT_OPCODES.CONFIG, json: { printMessage: VALID_17 } });
    await ctl.handlePrint();
    const fault = sent.find((f) => f.opcode === TNT_OPCODES.FAULT);
    expect((fault?.payload as { category: number }).category).toBe(2);
    expect(ctl.getState().fatal).toBeNull(); // Category 2 is not fatal
  });
});
