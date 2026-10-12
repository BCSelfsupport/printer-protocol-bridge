import { describe, it, expect } from "vitest";
import {
  buildPrintedCode,
  validatePrintedCode,
  mapConfigToPrinters,
  nextSerial,
  TwinPairQueue,
} from "./tntLineRunner";

// Real values from Authentix's log, 01 Oct 2026 09:09:11
const fields = { prodLine: "07", alphaYear: "A", julian: "274" };

describe("printed code", () => {
  it("is 13 chars and matches the log", () => {
    expect(buildPrintedCode(fields, 323646)).toBe("07A274323646U");
  });
  it("rejects wrong length and bad julian", () => {
    expect(validatePrintedCode("07A27432364U").ok).toBe(false);
    expect(validatePrintedCode("07A400323646U").ok).toBe(false);
    expect(validatePrintedCode("08A180220274U").ok).toBe(true);
  });
});

describe("config mapping", () => {
  it("block 1 → printer 1, block 2 → printer 2 (log: modes 00 and 06)", () => {
    const m = mapConfigToPrinters({ qty: 2, partType: "001", printers: [{ printMode: 0 }, { printMode: 6 }] });
    expect(m.printer1).toEqual({ inverted: false, reversed: false, bold: false });
    expect(m.printer2).toEqual({ inverted: true, reversed: true, bold: false });
    expect(m.warning).toBeNull();
  });
});

describe("rollover", () => {
  it("999900 → 1", () => expect(nextSerial(999900)).toBe(1));
});

describe("TwinPairQueue", () => {
  it("prefills two codes to both printers, as in the log", () => {
    const sent: string[] = [];
    const q = new TwinPairQueue((p, c) => sent.push(`${p}:${c}`));
    q.start(fields, 323646);
    expect(sent).toEqual(["1:07A274323646U", "2:07A274323646U", "1:07A274323647U", "2:07A274323647U"]);
  });
  it("only advances when both printers confirm", () => {
    const sent: string[] = [];
    const q = new TwinPairQueue((p, c) => sent.push(`${p}:${c}`));
    q.start(fields, 323646);
    sent.length = 0;
    expect(q.confirm(1, 323646)).toBe(false);
    expect(q.waitingOn).toBe(2);
    expect(q.lastSerial).toBe(0);
    expect(q.confirm(2, 323646)).toBe(true);
    expect(q.lastSerial).toBe(323646);
    expect(sent).toEqual(["1:07A274323648U", "2:07A274323648U"]);
  });
});
