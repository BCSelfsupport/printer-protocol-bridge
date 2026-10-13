import { describe, it, expect } from "vitest";
import { julianToday } from "./liveValidation";

describe("julianToday uses PC local date", () => {
  it("Oct 13 local late evening is day 286 regardless of UTC", () => {
    expect(julianToday(new Date(2026, 9, 13, 23, 30))).toBe("286");
  });
  it("Jan 1 local just after midnight is day 001", () => {
    expect(julianToday(new Date(2026, 0, 1, 0, 5))).toBe("001");
  });
});
