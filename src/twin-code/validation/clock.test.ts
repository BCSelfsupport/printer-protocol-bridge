import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { localTime, localDate, localTimeZone, fileStamp } from "./clock";

// Validation reports and traffic logs must stamp the PC's own clock, never UTC.
// The suite runs under a fixed non-UTC zone so a UTC leak is actually visible:
// Kiritimati (UTC+14) puts 2026-10-13T23:30Z on the following local day.
const REAL_TZ = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "Pacific/Kiritimati";
});

afterEach(() => {
  if (REAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = REAL_TZ;
});

describe("validation report clock", () => {
  const instant = new Date("2026-10-13T23:30:00.412Z");

  it("stamps traffic-log times on the PC clock, not UTC", () => {
    expect(localTime(instant)).toBe("13:30:00.412");
    expect(localTime(instant)).not.toBe(instant.toISOString().slice(11, 23));
  });

  it("keeps milliseconds so sub-second replies stay in order", () => {
    expect(localTime(new Date("2026-10-13T23:30:00.007Z"))).toBe("13:30:00.007");
  });

  it("dates the report by the PC calendar day", () => {
    expect(localDate(instant)).toBe(instant.toLocaleDateString());
    expect(localDate(instant)).not.toBe("10/13/2026");
  });

  it("names the zone the PC is in", () => {
    expect(localTimeZone(instant)).toContain("UTC+14:00");
  });

  it("names saved report files by PC time", () => {
    expect(fileStamp(instant)).toBe("2026-10-14_13-30-00");
    expect(fileStamp(instant)).not.toBe("2026-10-13_23-30-00");
  });
});
