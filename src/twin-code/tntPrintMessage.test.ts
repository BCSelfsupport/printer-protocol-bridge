import { describe, it, expect } from "vitest";
import {
  parsePrintMessage,
  incrementPrintMessage,
  printMessageSequence,
  validatePrintMessage,
  serialWillWrap,
  PrintMessageCounter,
  checkDataMatrixCapacity,
  smallestDataMatrixFor,
} from "./tntPrintMessage";

const EXAMPLE = "3 001 08 A180 220274 U"; // Authentix §5 worked example (17 compact)
const EXAMPLE_LOT = "300108A180220274U" + "LOT0001"; // 24 compact

describe("Print Message parsing", () => {
  it("parses the 17-char no-lot message and strips spacing", () => {
    const p = parsePrintMessage(EXAMPLE);
    expect(p.compact).toBe("300108A180220274U");
    expect(p.hasLotCode).toBe(false);
    expect(p.production).toBe("3");
    expect(p.config).toBe("001");
    expect(p.line).toBe("08");
    expect(p.code).toBe("A180");
    expect(p.serial).toBe("220274");
    expect(p.serialValue).toBe(220274);
    expect(p.unit).toBe("U");
    expect(p.lot).toBeNull();
  });

  it("parses the 24-char with-lot message", () => {
    const p = parsePrintMessage(EXAMPLE_LOT);
    expect(p.hasLotCode).toBe(true);
    expect(p.lot).toBe("LOT0001");
    expect(p.serial).toBe("220274");
  });

  it("rejects wrong lengths and bad charsets", () => {
    expect(validatePrintMessage("25X221546754U").ok).toBe(false); // old 13-char assumption
    expect(validatePrintMessage("300108A18022027!").ok).toBe(false);
    expect(validatePrintMessage("").ok).toBe(false);
  });
});

describe("serial increment inside the format", () => {
  it("increments only the serial sub-field", () => {
    expect(incrementPrintMessage(EXAMPLE)).toBe("300108A180220275U");
    expect(incrementPrintMessage(EXAMPLE, 26)).toBe("300108A180220300U");
  });

  it("preserves the lot block", () => {
    expect(incrementPrintMessage(EXAMPLE_LOT)).toBe("300108A180220275ULOT0001");
  });

  it("keeps leading zeros and fixed width", () => {
    const seq = printMessageSequence("300108A180000001U", 3);
    expect(seq).toEqual([
      "300108A180000001U",
      "300108A180000002U",
      "300108A180000003U",
    ]);
    expect(seq.every((s) => s.length === 17)).toBe(true);
  });

  it("detects wrap of the 6-digit field", () => {
    expect(serialWillWrap(parsePrintMessage("300108A180999999U"))).toBe(true);
    expect(serialWillWrap(parsePrintMessage("300108A180220274U"))).toBe(false);
  });
});

describe("PrintMessageCounter", () => {
  it("dispenses the starting serial first, then increments", () => {
    const c = new PrintMessageCounter();
    c.reseed(EXAMPLE);
    expect(c.next()).toBe("300108A180220274U");
    expect(c.next()).toBe("300108A180220275U");
    expect(c.dispensed).toBe(2);
  });

  it("re-Config resets to whatever TnT sent (no local rewind logic)", () => {
    const c = new PrintMessageCounter();
    c.reseed(EXAMPLE);
    c.next();
    c.next();
    c.reseed("300108A180300000U");
    expect(c.next()).toBe("300108A180300000U");
    expect(c.dispensed).toBe(1);
  });
});

describe("DataMatrix capacity guard", () => {
  it("flags 16x16 as too small for a 17/24-char message", () => {
    const v17 = checkDataMatrixCapacity(17, "16x16");
    expect(v17.ok).toBe(false);
    expect(v17.recommended).toBe("18x18");
    const v24 = checkDataMatrixCapacity(24, "16x16");
    expect(v24.ok).toBe(false);
    expect(v24.recommended).toBe("20x20");
  });

  it("passes when the symbol is large enough", () => {
    expect(checkDataMatrixCapacity(17, "20x20").ok).toBe(true);
    expect(smallestDataMatrixFor(13)).toBe("16x16");
  });
});
