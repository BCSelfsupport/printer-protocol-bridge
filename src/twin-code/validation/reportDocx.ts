// Word (.docx) version of the TwinCode validation report.
// Same content as the JSON/Excel report, laid out as a readable validation log
// with tables, suitable for filing.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ValidationReport } from "./reportXlsx";
import { localDateTime, localDate, localTimeZone, localTime } from "./clock";

const CONTENT_WIDTH = 9360; // US Letter, 1" margins
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } as const;
const borders = { top: border, bottom: border, left: border, right: border };
const margins = { top: 60, bottom: 60, left: 100, right: 100 };

function cell(text: string, width: number, opts?: { bold?: boolean; header?: boolean }): TableCell {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    margins,
    shading: opts?.header ? { fill: "E8EEF7", type: ShadingType.CLEAR } : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || "—", bold: opts?.bold ?? opts?.header ?? false, size: 18 })],
      }),
    ],
  });
}

function table(headers: string[], widths: number[], rows: string[][]): Table {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], { header: true })) }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, widths[i])) })),
    ],
  });
}

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26 })],
  });
}

function statusWord(status: string): string {
  return status === "pass" ? "PASS" : status === "fail" ? "FAIL" : status === "running" ? "INCOMPLETE" : "NOT RUN";
}

export async function buildValidationDocx(report: ValidationReport): Promise<Blob> {
  const stepsPassed = report.steps.filter((s) => s.status === "pass").length;
  const checksPassed = report.softwareChecks.filter((c) => c.status === "pass").length;
  const inspected = report.inspection.filter((c) => c.ok).length;

  const generated = new Date(report.generatedAt);
  const summaryRows: string[][] = [
    ["Generated (PC clock)", localDateTime(generated)],
    ["Time zone", localTimeZone(generated)],
    ["Generated (UTC)", report.generatedAt],
    ["Steps passed", `${stepsPassed} of ${report.steps.length}`],
    ["Software checks passed", `${checksPassed} of ${report.softwareChecks.length}`],
    ["Inspection checks confirmed", `${inspected} of ${report.inspection.length}`],
    ["Traffic log entries", String(report.trafficLog.length)],
    ["Overall result", stepsPassed === report.steps.length && inspected === report.inspection.length ? "PASS" : "REVIEW REQUIRED"],
  ];
  for (const [k, v] of Object.entries(report.testData)) {
    summaryRows.push([`Test data — ${k}`, typeof v === "string" ? v : JSON.stringify(v)]);
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "TwinCode Validation Log", size: 16, color: "666666" })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", size: 16, color: "666666" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "666666" }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 120 },
            children: [new TextRun({ text: "TwinCode Validation Report", bold: true, size: 36 })],
          }),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: "Record of an end-to-end validation of the TwinCode paired-printer system, including live printer communication, photocell-triggered printing and the Track-n-Trace data link. Test serials were used throughout; production data was not affected.",
                size: 18,
                color: "444444",
              }),
            ],
          }),

          heading("1. Summary"),
          table(["Item", "Value"], [3200, 6160], summaryRows),

          heading("2. Validation steps"),
          table(
            ["Step", "Result", "Detail", "Completed at"],
            [2400, 1100, 4160, 1700],
            report.steps.map((s) => [s.step, statusWord(s.status), s.detail, s.at ? localTime(new Date(s.at)) : ""]),
          ),

          heading("3. Software checks"),
          table(
            ["Section", "Check", "Result", "Detail", "ms"],
            [1700, 2700, 1000, 3360, 600],
            report.softwareChecks.map((c) => [c.section, c.name, statusWord(c.status), c.detail, String(c.ms)]),
          ),

          heading("4. Print inspection"),
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: "Each printed code was checked by eye against the product.", size: 18, color: "444444" })],
          }),
          table(
            ["Inspection check", "Confirmed"],
            [8260, 1100],
            report.inspection.map((c) => [c.check, c.ok ? "YES" : "no"]),
          ),

          heading("5. Traffic log"),
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: `Raw communication recorded during validation (printer replies and Track-n-Trace messages). Times are the PC clock (HH:MM:SS.mmm) on ${localDate(generated)}.`, size: 18, color: "444444" })],
          }),
          table(
            ["Time", "Direction", "Message"],
            [1500, 1300, 6560],
            report.trafficLog.map((e) => [e.t, e.dir, e.hex ? `${e.text}  [${e.hex}]` : e.text]),
          ),

          heading("6. Sign-off"),
          table(
            ["Role", "Name", "Signature", "Date"],
            [2200, 2800, 2560, 1800],
            [
              ["Performed by", "", "", ""],
              ["Reviewed by", "", "", ""],
            ],
          ),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function downloadValidationDocx(report: ValidationReport, filename: string): Promise<void> {
  const blob = await buildValidationDocx(report);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
