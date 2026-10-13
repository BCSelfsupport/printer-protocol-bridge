import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ active: false, lineActive: false }));
const dispatch = vi.hoisted(() => vi.fn());
const bind = vi.hoisted(() => vi.fn());
vi.mock("../productionRun", () => ({ productionRun: { getState: () => ({ active: state.active }) } }));
vi.mock("../twinDispatcher", () => ({ twinDispatcher: {
  getPhotocellMirrorState: () => ({ active: state.lineActive }), dispatch, bind,
} }));
import { connectionCheck, runLiveReplay, safetyCheck, sendBatch } from "./liveValidation";

describe("TwinCode validation production lock", () => {
  beforeEach(() => { state.active = false; state.lineActive = false; vi.clearAllMocks(); });
  it("blocks all live validation operations during an active production run", async () => {
    state.active = true;
    expect(safetyCheck().ok).toBe(false);
    expect((await connectionCheck()).ok).toBe(false);
    expect((await sendBatch(["07A286900001U"], vi.fn())).ok).toBe(false);
    expect((await runLiveReplay({ startSerial: 900001, bottles: 10, gapMs: 300, log: vi.fn(), onProgress: vi.fn() })).ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(bind).not.toHaveBeenCalled();
  });
  it("blocks test transmissions while the live photocell line is running", async () => {
    state.lineActive = true;
    expect(safetyCheck().ok).toBe(false);
    expect((await sendBatch(["07A286900001U"], vi.fn())).ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("allows validation when production and the live line are stopped", () => {
    expect(safetyCheck().ok).toBe(true);
  });
});