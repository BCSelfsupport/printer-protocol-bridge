import { describe, it, expect } from "vitest";
import { runValidation, TOTAL_CHECKS } from "./validationSuite";
import * as browser from "./tntCodecBrowser";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codec = require("../../../electron/tntCodec.cjs");

describe("TwinCode validation suite", () => {
  it("browser codec matches the Electron codec byte-for-byte", () => {
    const body = "300107A274323442U";
    expect(Array.from(browser.encodeFrame(2, body))).toEqual(Array.from(codec.encodeFrame(2, body)));
    expect(Array.from(browser.encodeLastSerial(42))).toEqual(Array.from(codec.encodeLastSerial(42)));
    expect(Array.from(browser.encodeConfigAck())).toEqual(Array.from(codec.encodeConfigAck()));
    const cfg = "2001000000000000000000000000000000000006";
    expect(browser.parseConfig(cfg)).toEqual(codec.parseConfig(cfg));
  });

  it("all testable checks pass; only Authentix items are pending", async () => {
    const { results } = await runValidation({ bottles: 200, faultRatePct: 5, maxLatencyMs: 40 }, () => {});
    expect(results).toHaveLength(TOTAL_CHECKS);
    expect(results.filter((r) => r.status === "fail")).toEqual([]);
    expect(results.filter((r) => r.status === "pending").map((r) => r.id)).toEqual(["A1", "A2"]);
  }, 30000);
});
