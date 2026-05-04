/**
 * Twin Code — Envelope Summary Report ("Bruce report").
 *
 * Generates a single-page, self-contained HTML file that answers ONE question:
 *
 *   "Given the cycle times we measured, what BPM ceiling does this pair impose,
 *    and how does that compare to common production targets?"
 *
 * The file is shareable — no external CSS, no external fonts, no JS needed —
 * and prints cleanly to PDF via the browser's print dialog.
 *
 * Why HTML and not real PDF? Two reasons:
 *   1. Zero new dependencies in the renderer; PDF libs are 200kb+.
 *   2. Recipients can re-flow it on any screen, then "Print → Save as PDF" if
 *      they want a static artifact. We get the best of both.
 */

import type { ProductionRunExport } from "./productionRun";
import type { BottleSample } from "./types";
import { computeHeadroom, cycleBudgetForBpm, DEFAULT_SAFETY_FACTOR } from "./throughputHeadroom";
import { conveyorSim } from "./conveyorSim";
import { liveMetrics } from "./liveMetrics";
import { twinDispatcher } from "./twinDispatcher";
import { profilerBus } from "./profilerBus";

const REFERENCE_BPMS = [50, 100, 150, 200, 300, 500];

interface CycleStats {
  count: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
  histogram: { bucket: string; count: number }[];
}

function pct(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeCycleStats(samples: BottleSample[]): CycleStats {
  const cycles = samples
    .filter((s) => s.outcome === "printed" && Number.isFinite(s.cycleMs))
    .map((s) => s.cycleMs!);

  if (cycles.length === 0) {
    return { count: 0, min: 0, p50: 0, p95: 0, max: 0, mean: 0, histogram: [] };
  }

  const min = Math.min(...cycles);
  const max = Math.max(...cycles);
  const mean = cycles.reduce((a, b) => a + b, 0) / cycles.length;

  // Bucket into 10 bins from min..max, label by bucket centre.
  const binCount = 10;
  const span = Math.max(1, max - min);
  const binWidth = span / binCount;
  const counts = Array.from({ length: binCount }, () => 0);
  for (const c of cycles) {
    const idx = Math.min(binCount - 1, Math.floor((c - min) / binWidth));
    counts[idx]++;
  }
  const histogram = counts.map((count, i) => ({
    bucket: `${(min + i * binWidth).toFixed(0)}–${(min + (i + 1) * binWidth).toFixed(0)} ms`,
    count,
  }));

  return { count: cycles.length, min, p50: pct(cycles, 0.5), p95: pct(cycles, 0.95), max, mean, histogram };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}

/**
 * Build the HTML string. Self-contained — no external assets.
 */
export function buildEnvelopeReportHTML(exp: ProductionRunExport): string {
  // Prefer the line-conditions snapshot captured at Start so the report shows
  // what the line was doing for THIS lot, not whatever conveyorSim is set to
  // at the moment the operator clicks Download.
  const cvLive = conveyorSim.getConfig();
  const cv = exp.meta.lineSnapshot
    ? { ...cvLive, ftPerMin: exp.meta.lineSnapshot.ftPerMin, pitchMm: exp.meta.lineSnapshot.pitchMm }
    : cvLive;
  const live = liveMetrics.getSnapshot();
  const profile = twinDispatcher.getBoundProfile();
  const samples = profilerBus.getSamples();
  const stats = computeCycleStats(samples);
  // Headroom snapshot at the moment of report generation.
  const headroom = computeHeadroom(samples, live.bpm > 0 ? live.bpm : exp.summary.elapsedSec > 0 ? (exp.summary.printed * 60) / exp.summary.elapsedSec : 0);

  const measuredAvgBpm = exp.summary.elapsedSec > 0
    ? (exp.summary.printed * 60) / exp.summary.elapsedSec
    : 0;

  // Reference table: for each target BPM, does the measured cycle p95 meet it?
  const referenceTable = REFERENCE_BPMS.map((targetBpm) => {
    const budget = cycleBudgetForBpm(targetBpm);
    const meets = Number.isFinite(stats.p95) && stats.p95 <= budget;
    return { targetBpm, budgetMs: budget, meets };
  });

  const verdictText = headroom.verdict === "ok"
    ? "PASS — measured cycle leaves comfortable headroom over the current line BPM."
    : headroom.verdict === "tight"
      ? "MARGINAL — measured cycle is within 15% of the BPM ceiling. Suitable for the current line but limited room to push throughput."
      : headroom.verdict === "over"
        ? "FAIL at current BPM — line is being asked to run faster than the measured cycle can sustain."
        : "INSUFFICIENT DATA — run more cycles to populate the envelope.";

  const verdictTone = headroom.verdict === "ok" ? "#10b981"
    : headroom.verdict === "tight" ? "#f59e0b"
    : headroom.verdict === "over" ? "#ef4444"
    : "#6b7280";

  const histMax = Math.max(1, ...stats.histogram.map((h) => h.count));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Twin Code — Envelope Report · Lot ${escapeHtml(exp.meta.lotNumber)}</title>
<style>
  :root {
    --fg: #0f172a;
    --muted: #475569;
    --border: #e2e8f0;
    --bg: #ffffff;
    --accent: #2563eb;
    --ok: #10b981;
    --warn: #f59e0b;
    --bad: #ef4444;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: var(--fg);
    background: var(--bg);
    margin: 0;
    padding: 32px;
    line-height: 1.45;
  }
  .page {
    max-width: 920px;
    margin: 0 auto;
  }
  h1 {
    font-size: 22px;
    margin: 0 0 4px 0;
    letter-spacing: -0.01em;
  }
  .sub {
    color: var(--muted);
    font-size: 12px;
    margin-bottom: 24px;
  }
  .verdict {
    border: 2px solid ${verdictTone};
    background: ${verdictTone}11;
    border-radius: 8px;
    padding: 16px 20px;
    margin: 16px 0 24px 0;
  }
  .verdict-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: ${verdictTone};
    margin-bottom: 4px;
  }
  .verdict-text {
    font-size: 15px;
    font-weight: 600;
    color: var(--fg);
  }
  .verdict-detail {
    font-size: 12px;
    color: var(--muted);
    margin-top: 6px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  .stat {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 12px;
    background: #f8fafc;
  }
  .stat-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .stat-value {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 22px;
    font-weight: 700;
    color: var(--fg);
    margin-top: 2px;
    line-height: 1.1;
  }
  .stat-sub {
    font-size: 10px;
    color: var(--muted);
    margin-top: 2px;
  }
  h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--muted);
    border-top: 1px solid var(--border);
    padding-top: 16px;
    margin-top: 24px;
    margin-bottom: 12px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th, td {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
  }
  th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    font-weight: 700;
  }
  td.num {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    text-align: right;
  }
  .pass { color: var(--ok); font-weight: 600; }
  .fail { color: var(--bad); font-weight: 600; }
  .hist-row {
    display: grid;
    grid-template-columns: 110px 1fr 40px;
    gap: 8px;
    align-items: center;
    font-size: 11px;
    margin-bottom: 3px;
  }
  .hist-label {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    color: var(--muted);
    text-align: right;
  }
  .hist-bar {
    background: #e2e8f0;
    height: 14px;
    border-radius: 2px;
    overflow: hidden;
  }
  .hist-fill {
    background: var(--accent);
    height: 100%;
  }
  .hist-count {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    text-align: right;
    color: var(--muted);
  }
  .footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    font-size: 10px;
    color: var(--muted);
    font-family: "SF Mono", Menlo, Consolas, monospace;
  }
  @media print {
    body { padding: 16px; }
    .verdict { break-inside: avoid; }
    h2 { break-after: avoid; }
    table { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <h1>Twin Code — Throughput Envelope Report</h1>
  <div class="sub">
    Lot <strong>${escapeHtml(exp.meta.lotNumber)}</strong> ·
    Operator ${escapeHtml(exp.meta.operator)} ·
    ${new Date(exp.meta.startedAt).toLocaleString()} ·
    Mode: ${exp.meta.liveAtStart ? "LIVE bonded pair" : "Synthetic"}
  </div>

  <div class="verdict">
    <div class="verdict-label">Envelope verdict</div>
    <div class="verdict-text">${escapeHtml(verdictText)}</div>
    <div class="verdict-detail">${escapeHtml(headroom.oneLiner)}</div>
  </div>

  <h2>Run summary</h2>
  <div class="grid">
    <div class="stat">
      <div class="stat-label">Printed</div>
      <div class="stat-value">${exp.summary.printed.toLocaleString()}</div>
      <div class="stat-sub">of ${exp.summary.total.toLocaleString()} dispatched</div>
    </div>
    <div class="stat">
      <div class="stat-label">Missed</div>
      <div class="stat-value" style="color:${exp.summary.missed > 0 ? "var(--bad)" : "var(--fg)"}">${exp.summary.missed.toLocaleString()}</div>
      <div class="stat-sub">${exp.summary.yieldPct.toFixed(2)}% yield</div>
    </div>
    <div class="stat">
      <div class="stat-label">Duration</div>
      <div class="stat-value">${exp.summary.elapsedSec}s</div>
      <div class="stat-sub">avg ${measuredAvgBpm.toFixed(1)} BPM</div>
    </div>
    <div class="stat">
      <div class="stat-label">Cycle p95</div>
      <div class="stat-value">${stats.count > 0 ? stats.p95.toFixed(0) + "ms" : "—"}</div>
      <div class="stat-sub">n=${stats.count}</div>
    </div>
  </div>

  <h2>Line conditions</h2>
  <table>
    <tr><td>Line speed</td><td class="num">${cv.ftPerMin} ft/min</td></tr>
    <tr><td>Pitch (centre-to-centre)</td><td class="num">${cv.pitchMm} mm</td></tr>
    <tr><td>Bottle Ø (configured)</td><td class="num">${live.bottleDiameterMm} mm</td></tr>
    <tr><td>Gap between bottles</td><td class="num">${Math.max(0, cv.pitchMm - live.bottleDiameterMm).toFixed(1)} mm</td></tr>
    <tr><td>Conveyor BPM (geometric model)</td><td class="num">${((cv.ftPerMin * 304.8 / 60) / cv.pitchMm * 60).toFixed(1)}</td></tr>
    <tr><td>A side · ${profile?.subA === "BD" ? "DataMatrix (^MD^BD)" : "Text (^MD^TD)"}</td><td class="num">lid printer</td></tr>
    <tr><td>B side · ${profile?.subB === "BD" ? "DataMatrix (^MD^BD)" : "Text (^MD^TD)"}</td><td class="num">side printer</td></tr>
  </table>

  ${exp.meta.printSnapshot ? `
  <h2>Print parameters (applied at bind)</h2>
  <p style="margin:0 0 8px 0;color:var(--muted);font-size:12px">
    These three settings dominate cycle time and therefore the maximum sustainable BPM.
    Lower Width and higher Speed shorten each strike; Delay is the dead time before each print fires.
    Compare runs with identical Width / Speed / Delay for apples-to-apples throughput verdicts.
  </p>
  <table>
    <tr><td>Width (^PW)</td><td class="num">${exp.meta.printSnapshot.widthDots} dot${exp.meta.printSnapshot.widthDots === 1 ? "" : "s"}</td></tr>
    <tr><td>Delay (^DA)</td><td class="num">${exp.meta.printSnapshot.delayDots} dot${exp.meta.printSnapshot.delayDots === 1 ? "" : "s"}</td></tr>
    <tr><td>Speed (^CM s${exp.meta.printSnapshot.speedCode})</td><td class="num">${escapeHtml(exp.meta.printSnapshot.speedLabel)}</td></tr>
  </table>
  ` : ""}

  <h2>Cycle-time distribution</h2>
  <div class="grid" style="grid-template-columns: repeat(5, 1fr);">
    <div class="stat"><div class="stat-label">min</div><div class="stat-value" style="font-size:16px">${stats.count > 0 ? stats.min.toFixed(0) + "ms" : "—"}</div></div>
    <div class="stat"><div class="stat-label">p50</div><div class="stat-value" style="font-size:16px">${stats.count > 0 ? stats.p50.toFixed(0) + "ms" : "—"}</div></div>
    <div class="stat"><div class="stat-label">mean</div><div class="stat-value" style="font-size:16px">${stats.count > 0 ? stats.mean.toFixed(0) + "ms" : "—"}</div></div>
    <div class="stat"><div class="stat-label">p95</div><div class="stat-value" style="font-size:16px;color:var(--accent)">${stats.count > 0 ? stats.p95.toFixed(0) + "ms" : "—"}</div></div>
    <div class="stat"><div class="stat-label">max</div><div class="stat-value" style="font-size:16px">${stats.count > 0 ? stats.max.toFixed(0) + "ms" : "—"}</div></div>
  </div>
  ${stats.count > 0 ? stats.histogram.map((h) => `
    <div class="hist-row">
      <div class="hist-label">${escapeHtml(h.bucket)}</div>
      <div class="hist-bar"><div class="hist-fill" style="width:${(h.count / histMax) * 100}%"></div></div>
      <div class="hist-count">${h.count}</div>
    </div>
  `).join("") : '<div style="color:var(--muted);font-size:12px;">No cycle data captured for this run.</div>'}

  <h2>Throughput envelope · target BPM vs measured cycle</h2>
  <p style="font-size:12px;color:var(--muted);margin:0 0 8px 0;">
    For each target BPM, the printer's worst-case cycle (p95) must be ≤ the budget below
    (with ${DEFAULT_SAFETY_FACTOR}× safety factor). Measured cycle p95 = <strong>${stats.count > 0 ? stats.p95.toFixed(0) + "ms" : "—"}</strong>.
  </p>
  <table>
    <thead>
      <tr><th>Target BPM</th><th class="num">Bottle interval</th><th class="num">Cycle budget</th><th>Verdict</th></tr>
    </thead>
    <tbody>
      ${referenceTable.map((r) => `
        <tr>
          <td><strong>${r.targetBpm}</strong> BPM</td>
          <td class="num">${(60_000 / r.targetBpm).toFixed(0)} ms</td>
          <td class="num">≤ ${r.budgetMs.toFixed(0)} ms</td>
          <td class="${r.meets ? "pass" : "fail"}">${stats.count > 0 ? (r.meets ? "✓ MEETS" : "✗ exceeds budget") : "—"}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <h2>How to read this</h2>
  <p style="font-size:12px;line-height:1.6;color:var(--muted);">
    A 50ms cycle target only matters if the line runs at <strong>1000 BPM</strong>. At more typical
    production speeds the bottle-to-bottle interval is much longer than the printer's cycle time,
    so the cycle envelope is rarely the bottleneck. Use this report to align engineering targets
    with the customer's actual throughput requirement, not a worst-case spec number.
  </p>

  <div class="footer">
    Generated ${new Date().toLocaleString()} · Document SHA-256 ${exp.documentHash} ·
    Records SHA-256 ${exp.recordsHash}
  </div>
</div>
</body>
</html>`;
}

/**
 * Trigger a download of the envelope report as a standalone HTML file.
 * Recipients open it in any browser; "Print → Save as PDF" produces a clean
 * one-page PDF artifact.
 */
export function downloadEnvelopeReport(exp: ProductionRunExport) {
  const html = buildEnvelopeReportHTML(exp);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeLot = exp.meta.lotNumber.replace(/[^a-zA-Z0-9._-]+/g, "_") || "lot";
  const stamp = new Date(exp.meta.startedAt).toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `twincode-envelope_${safeLot}_${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
