import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { CheckCircle2, XCircle, Clock, PlayCircle, Loader2, Download, ShieldCheck, FlaskConical } from "lucide-react";
import {
  runValidation, DEFAULT_VALIDATION, TOTAL_CHECKS, TEST_DATA,
  type CheckResult, type FrameLogEntry,
} from "../validation/validationSuite";

export function ValidationSuiteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [bottles, setBottles] = useState(DEFAULT_VALIDATION.bottles);
  const [faultRate, setFaultRate] = useState(DEFAULT_VALIDATION.faultRatePct);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [log, setLog] = useState<FrameLogEntry[]>([]);
  const [meta, setMeta] = useState<{ startedAt: string; finishedAt: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const counts = useMemo(() => ({
    pass: results.filter((r) => r.status === "pass").length,
    fail: results.filter((r) => r.status === "fail").length,
    pending: results.filter((r) => r.status === "pending").length,
  }), [results]);

  const sections = useMemo(() => {
    const m = new Map<string, CheckResult[]>();
    results.forEach((r) => m.set(r.section, [...(m.get(r.section) ?? []), r]));
    return [...m.entries()];
  }, [results]);

  const run = async () => {
    setRunning(true); setResults([]); setLog([]); setMeta(null);
    abortRef.current = new AbortController();
    try {
      const out = await runValidation(
        { bottles, faultRatePct: faultRate, maxLatencyMs: DEFAULT_VALIDATION.maxLatencyMs },
        (r, l) => { setResults((p) => [...p, r]); setLog(l); },
        abortRef.current.signal,
      );
      setMeta({ startedAt: out.startedAt, finishedAt: out.finishedAt });
    } finally { setRunning(false); }
  };

  const exportReport = () => {
    const report = { kind: "TwinCode end-to-end validation (sandbox)", ...meta, options: { bottles, faultRatePct: faultRate }, testData: TEST_DATA, summary: counts, results, frameLog: log };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `twincode-validation-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const done = !running && meta;
  const verdict = done ? (counts.fail === 0 ? "pass" : "fail") : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!running) onOpenChange(v); else abortRef.current?.abort(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> Full TwinCode validation</DialogTitle>
          <DialogDescription>
            Replicates Authentix Track-n-Trace with test data and two virtual printers, then checks every step from Config to printed code.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span><Badge className="mr-1 text-[10px]">SANDBOX</Badge>No real printers, Track-n-Trace link, serial catalog or production run are used. A final check proves live data was not changed.</span>
        </div>

        {!running && !meta && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><Label>Simulated bottles</Label><span className="font-mono">{bottles}</span></div>
              <Slider value={[bottles]} min={50} max={5000} step={50} onValueChange={([v]) => setBottles(v)} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><Label>Injected missed-confirm rate</Label><span className="font-mono">{faultRate}%</span></div>
              <Slider value={[faultRate]} min={0} max={20} step={1} onValueChange={([v]) => setFaultRate(v)} />
            </div>
          </div>
        )}

        {(running || meta) && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{running ? "Running checks…" : "Complete"}</span>
              <span className="font-mono">{results.length}/{TOTAL_CHECKS} · <span className="text-primary">{counts.pass} pass</span> · <span className="text-destructive">{counts.fail} fail</span> · {counts.pending} pending</span>
            </div>
            <Progress value={(results.length / TOTAL_CHECKS) * 100} />
          </div>
        )}

        {verdict && (
          <div className={`rounded-md border p-3 text-sm font-semibold ${verdict === "pass" ? "border-primary/40 bg-primary/5 text-primary" : "border-destructive/40 bg-destructive/5 text-destructive"}`}>
            {verdict === "pass"
              ? `All testable checks passed. ${counts.pending} item(s) waiting on Authentix answers.`
              : `${counts.fail} check(s) failed — review below before going live.`}
          </div>
        )}

        {sections.length > 0 && (
          <ScrollArea className="h-72 rounded-md border border-border">
            <div className="space-y-3 p-3">
              {sections.map(([name, rs]) => (
                <div key={name}>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{name}</div>
                  {rs.map((r) => (
                    <div key={r.id} className="flex items-start gap-2 border-t border-border/40 py-1 text-xs">
                      {r.status === "pass" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        : r.status === "fail" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                        : <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-foreground"><span className="font-mono text-muted-foreground">{r.id}</span> {r.name}</div>
                        <div className={`break-words font-mono text-[10px] ${r.status === "fail" ? "text-destructive" : "text-muted-foreground"}`}>{r.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {log.length > 0 && (
          <details className="rounded-md border border-border text-xs">
            <summary className="cursor-pointer px-3 py-2 font-medium">Simulated interface traffic ({log.length} frames)</summary>
            <ScrollArea className="h-40">
              <table className="w-full font-mono text-[10px]">
                <tbody>
                  {log.map((e, i) => (
                    <tr key={i} className="border-t border-border/40">
                      <td className="px-2 py-0.5 text-muted-foreground">{e.t}ms</td>
                      <td className="px-2 py-0.5">{e.dir}</td>
                      <td className="px-2 py-0.5">{e.label}</td>
                      <td className="px-2 py-0.5 text-muted-foreground">{e.hex ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </details>
        )}

        <DialogFooter className="gap-2">
          {done && <Button variant="outline" onClick={exportReport}><Download className="mr-1 h-4 w-4" /> Export report</Button>}
          <Button variant="ghost" onClick={() => (running ? abortRef.current?.abort() : onOpenChange(false))}>{running ? "Stop" : "Close"}</Button>
          <Button onClick={run} disabled={running}>
            {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running…</> : <><PlayCircle className="mr-2 h-4 w-4" /> {meta ? "Run again" : "Run validation"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
