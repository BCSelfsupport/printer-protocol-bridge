// The validation report that gets filed must carry the PC's own clock, so an
// auditor can tie every line back to the wall clock the operator was watching.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as XLSX from "xlsx";
import { buildValidationWorkbook, type ValidationReport } from "./reportXlsx";

const REAL_TZ = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "Pacific/Kiritimati"; // UTC+14: 2026-10-13T23:30Z is the next local day
});

afterEach(() => {
  if (REAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = REAL_TZ;
});

const report: ValidationReport = {
  generatedAt: "2026-10-13T23:30:00.412Z",
  testData: { trigger: "photocell" },
  steps: [{ step: "4. Ten test codes", status: "pass", detail: "10 sent", at: "2026-10-13T23:31:02.050Z" }],
  inspection: [{ check: "codes match", ok: true }],
  softwareChecks: [{ section: "code", name: "13 chars", status: "pass", detail: "ok", ms: 1 }],
  trafficLog: [{ t: "13:30:00.412", dir: "P1+P2→CodeSync", text: "PRINTED both" }],
};

function summaryValue(wb: ReturnType<typeof buildValidationWorkbook>, key: string): string {
  const sheet = XLSX.read(new Uint8Array(wb), { type: "array" }).Sheets["Summary"];
  const row = (XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number)[][])
    .find((r) => r[0] === key);
  return String(row?.[1] ?? "");
}

describe("Excel validation report clock", () => {
  it("stamps the summary with PC time, not UTC", () => {
    const value = summaryValue(buildValidationWorkbook(report), "Generated (PC clock)");
    expect(value).toContain("13:30:00.412");
    expect(value).not.toContain("23:30");
  });

  it("records the PC time zone", () => {
    expect(summaryValue(buildValidationWorkbook(report), "Time zone")).toContain("UTC+14:00");
  });

  it("dates the traffic log so a filed sheet is not ambiguous", () => {
    expect(summaryValue(buildValidationWorkbook(report), "Traffic log times")).toContain("PC clock");
  });
});
