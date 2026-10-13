// Excel (.xlsx) version of the TwinCode validation report.
// Same content as the JSON report, arranged into readable sheets.
import * as XLSX from "xlsx";

export interface ValidationReport {
  generatedAt: string;
  testData: Record<string, unknown>;
  steps: { step: string; status: string; detail: string; at?: string }[];
  inspection: { check: string; ok: boolean }[];
  softwareChecks: { section: string; name: string; status: string; detail: string; ms: number }[];
  trafficLog: { t: string; dir: string; text: string; hex?: string }[];
}

export function buildValidationWorkbook(report: ValidationReport): Uint8Array {
  const wb = XLSX.utils.book_new();

  const summary: (string | number | null)[][] = [
    ["TwinCode validation report", null],
    ["Generated", new Date(report.generatedAt).toLocaleString()],
    ["Generated (UTC)", report.generatedAt],
    ["Steps passed", `${report.steps.filter((s) => s.status === "pass").length} of ${report.steps.length}`],
    ["Software checks passed", `${report.softwareChecks.filter((c) => c.status === "pass").length} of ${report.softwareChecks.length}`],
    ["Inspection checks ticked", `${report.inspection.filter((c) => c.ok).length} of ${report.inspection.length}`],
    ["Traffic log entries", report.trafficLog.length],
  ];
  for (const [k, v] of Object.entries(report.testData)) {
    summary.push([`Test data — ${k}`, typeof v === "string" ? v : JSON.stringify(v)]);
  }
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 30 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  const wsSteps = XLSX.utils.aoa_to_sheet([
    ["Step", "Status", "Detail", "At"],
    ...report.steps.map((s) => [s.step, s.status, s.detail, s.at ? new Date(s.at).toLocaleString() : ""]),
  ]);
  wsSteps["!cols"] = [{ wch: 38 }, { wch: 10 }, { wch: 90 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsSteps, "Steps");

  const wsChecks = XLSX.utils.aoa_to_sheet([
    ["Section", "Check", "Status", "Detail", "ms"],
    ...report.softwareChecks.map((c) => [c.section, c.name, c.status, c.detail, c.ms]),
  ]);
  wsChecks["!cols"] = [{ wch: 24 }, { wch: 46 }, { wch: 10 }, { wch: 90 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, wsChecks, "Software checks");

  const wsInspect = XLSX.utils.aoa_to_sheet([
    ["Inspection check", "Confirmed"],
    ...report.inspection.map((c) => [c.check, c.ok ? "YES" : "no"]),
  ]);
  wsInspect["!cols"] = [{ wch: 90 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsInspect, "Inspection");

  const wsLog = XLSX.utils.aoa_to_sheet([
    ["Time", "Direction", "Text", "Hex"],
    ...report.trafficLog.map((e) => [e.t, e.dir, e.text, e.hex ?? ""]),
  ]);
  wsLog["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 90 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsLog, "Traffic log");

  // type "array" returns an ArrayBuffer — wrap it so callers always get real bytes.
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Uint8Array(out);
}

export function downloadValidationXlsx(report: ValidationReport, filename: string): void {
  const data = buildValidationWorkbook(report);
  const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
