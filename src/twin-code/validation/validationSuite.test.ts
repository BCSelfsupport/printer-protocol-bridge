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
    expect(Array.from(browser.encodeClearBuffersReply(true))).toEqual(Array.from(codec.encodeClearBuffersReply(true)));
    expect(Array.from(browser.encodeClearBuffersReply(false))).toEqual(Array.from(codec.encodeClearBuffersReply(false)));
    expect(Array.from(browser.encodeRequestError("09"))).toEqual(Array.from(codec.encodeRequestError("09")));
    expect(Array.from(browser.encodeCategoryFault(2, 1, { code: "07A274323442U", address: "192.168.0.91" })))
      .toEqual(Array.from(codec.encodeCategoryFault(2, 1, { code: "07A274323442U", address: "192.168.0.91" })));
    expect(Array.from(browser.encodeCategoryFault(2, 2, { faultNumber: 16 })))
      .toEqual(Array.from(codec.encodeCategoryFault(2, 2, { faultNumber: 16 })));
    const cfg = "2001000000000000000000000000000000000006";
    expect(browser.parseConfig(cfg)).toEqual(codec.parseConfig(cfg));
  });

  it("all checks pass; nothing left pending", async () => {
    const { results } = await runValidation({ bottles: 200, faultRatePct: 5, maxLatencyMs: 40 }, () => {});
    expect(results).toHaveLength(TOTAL_CHECKS);
    expect(results.filter((r) => r.status === "fail")).toEqual([]);
    expect(results.filter((r) => r.status === "pending")).toEqual([]);
  }, 30000);
});

import { buildTestPrintMessage, LOG_CONFIG, TEST_SERIAL_START } from "./liveValidation";
import { parseConfig as pc, parsePrint as pp } from "./tntCodecBrowser";
import { mapConfigToPrinters, validatePrintedCode, buildPrintedCode } from "../tntLineRunner";

describe("live validation test data (from 1 Oct log)", () => {
  it("log Config maps P1 normal, P2 inverted+reversed", () => {
    const m = mapConfigToPrinters(pc(LOG_CONFIG) as never);
    expect(m.printer1).toEqual({ inverted: false, reversed: false, bold: false });
    expect(m.printer2).toEqual({ inverted: true, reversed: true, bold: false });
  });
  it("test Print message is 17 chars and yields a valid 13-char code in the 9xxxxx range", () => {
    const body = buildTestPrintMessage(TEST_SERIAL_START, "07", "A", "274");
    expect(body).toBe("300107A274900001U");
    const p = pp(body) as never as { prodLine: string; alphaYear: string; julian: string; serialValue: number };
    const code = buildPrintedCode(p, p.serialValue);
    expect(code).toBe("07A274900001U");
    expect(validatePrintedCode(code).ok).toBe(true);
  });
});
