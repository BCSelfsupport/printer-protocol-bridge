import { describe, it, expect } from "vitest";
import { mapBestCodeFault } from "./tntFaultMap";
describe("BestCode → §8 fault map", () => {
  it("make-up empty is 16", () => expect(mapBestCodeFault("Makeup empty")).toMatchObject({ category: 2, code: 16 }));
  it("ink low is 23", () => expect(mapBestCodeFault("Ink low")).toMatchObject({ category: 2, code: 23 }));
  it("jet stop is ink system 11", () => expect(mapBestCodeFault("jet-stop")).toMatchObject({ category: 2, code: 11 }));
  it("lost connection is category 3", () => expect(mapBestCodeFault("A:No active connection").category).toBe(3));
  it("unknown is 0", () => expect(mapBestCodeFault("weird")).toMatchObject({ category: 2, code: 0 }));
  it("never uses laser category 4", () => expect(["", "laser", "interlock"].every((t) => (mapBestCodeFault(t).category as number) !== 4)).toBe(true));
});
