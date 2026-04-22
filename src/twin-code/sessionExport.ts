import type { BottleSample, ProfilerSession } from "./types";

const HEADERS = [
  "index", "outcome", "serial",
  "t0", "t1", "t2a", "t2b", "t3a", "t3b", "t4",
  "ingressMs", "dispatchMs", "wireAMs", "wireBMs", "skewMs", "cycleMs",
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSessionCSV(samples: BottleSample[], label = "twin-code-session") {
  const rows = [HEADERS.join(",")];
  for (const s of samples) {
    rows.push([
      s.index,
      s.outcome,
      s.serial ?? "",
      s.t0.toFixed(3),
      s.t1.toFixed(3),
      s.t2a.toFixed(3),
      s.t2b.toFixed(3),
      s.t3a.toFixed(3),
      s.t3b.toFixed(3),
      s.t4.toFixed(3),
      s.ingressMs.toFixed(3),
      s.dispatchMs.toFixed(3),
      s.wireAMs.toFixed(3),
      s.wireBMs.toFixed(3),
      s.skewMs.toFixed(3),
      s.cycleMs.toFixed(3),
    ].join(","));
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadBlob(blob, `${label}-${stamp}.csv`);
}

export function exportSessionJSON(session: ProfilerSession) {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
  const stamp = new Date(session.startedAt).toISOString().replace(/[:.]/g, "-");
  downloadBlob(blob, `${session.label.replace(/\s+/g, "-")}-${stamp}.json`);
}

export async function importSessionJSON(file: File): Promise<ProfilerSession> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.samples)) {
    throw new Error("Invalid session file");
  }
  return parsed as ProfilerSession;
}
