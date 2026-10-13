import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, XCircle, Circle, Loader2, Download, FlaskConical, ChevronRight, AlertTriangle } from "lucide-react";
import { runValidation, DEFAULT_VALIDATION, TEST_DATA, type CheckResult } from "../validation/validationSuite";
import {
  safetyCheck, connectionCheck, releaseValidationLink, sendSingle, sendBatch, runLiveReplay, runLiveTnt, buildTestPrintMessage, julianToday,
  LOG_CONFIG, TEST_SERIAL_START, type LiveLogEntry, type TriggerMode, type TntStage,
} from "../validation/liveValidation";
import { buildPrintedCode } from "../tntLineRunner";
import { usePrinterStorage } from "@/hooks/usePrinterStorage";
import { downloadValidationXlsx, type ValidationReport } from "../validation/reportXlsx";

type Status = "todo" | "running" | "pass" | "fail";
interface StepState { status: Status; detail: string; at?: string }

const STEPS = [
  { id: "software", title: "1. Software checks (no printers)", what: "Runs 33 checks of the Track-n-Trace message handling, code format, queue, rollover and status reply using test data. Nothing is sent to printers." },
  { id: "safety", title: "2. Safety check", what: "Confirms no production run and no live line is active, so test codes cannot mix with real production." },
  { id: "connection", title: "3. Live printer connection", what: "Checks the bound pair and asks both printers for their live settings over the network." },
  { id: "single", title: "4. Ten test codes", what: "Sends 10 consecutive test codes to both printers, one per photocell trigger (or Print Go on a bench). Then check each printed code on the line and confirm them one at a time below." },
  { id: "replay", title: "5. Track-n-Trace replay to live printers", what: "Plays the old system's recorded Config, then a test Print message, and drives both real printers through the two-code queue, one code per photocell trigger. Stops at the first failure." },
  { id: "stall", title: "6. Printer failure test", what: "Stop or disconnect Printer 2 (side), then send. CodeSync must hold the code on both printers. Reconnect and resend the SAME code — nothing must be skipped." },
  { id: "inspect", title: "7. Printed output inspection", what: "Check the physical prints and tick every box." },
  { id: "tnt", title: "8. Real Track-n-Trace data link", what: "Part 2: the REAL Track-n-Trace PC connects to this PC, sends its own Config and Print message, CodeSync prints the codes on both printers (one per photocell trigger), then T&T's real 30-second poll must get back the last printed serial. Use a test lot on the T&T side." },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const INSPECT = [
  "Lid (Printer 1) DataMatrix scans to exactly the same 13 characters as the side text",
  "Side (Printer 2) text is readable and matches the code shown here",
  "Every replayed code appears once, in order, with no gaps or repeats",
  "Print position / orientation on each printer is correct for the line",
  "Test codes (serial 9xxxxx) have been removed from product before release",
];

export function ValidationSuiteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [steps, setSteps] = useState<Record<StepId, StepState>>(
    () => Object.fromEntries(STEPS.map((s) => [s.id, { status: "todo", detail: "" }])) as Record<StepId, StepState>,
  );
  const [active, setActive] = useState<StepId>("software");
  const [softResults, setSoftResults] = useState<CheckResult[]>([]);
  const [log, setLog] = useState<LiveLogEntry[]>([]);
  const [startSerial, setStartSerial] = useState(TEST_SERIAL_START);
  const [bottles, setBottles] = useState(20);
  const [gapMs, setGapMs] = useState(300);
  const [progress, setProgress] = useState(0);
  const BATCH = 10;
  const [batchSent, setBatchSent] = useState<string[]>([]);
  const [codeTicks, setCodeTicks] = useState<Record<string, boolean | undefined>>({});
  const [stallPhase, setStallPhase] = useState<"ready" | "held" | "done">("ready");
  const [ticks, setTicks] = useState<boolean[]>(INSPECT.map(() => false));
  const [trigger, setTrigger] = useState<TriggerMode>("photocell");
  const [tntCodes, setTntCodes] = useState(5);
  const [tntStages, setTntStages] = useState<Partial<Record<TntStage["id"], TntStage>>>({});
  const abortRef = useRef<AbortController | null>(null);
  const busy = Object.values(steps).some((s) => s.status === "running");

  const testCode = useMemo(() => buildPrintedCode({ prodLine: "07", alphaYear: "A", julian: julianToday() }, startSerial), [startSerial]);
  const stallCode = useMemo(() => buildPrintedCode({ prodLine: "07", alphaYear: "A", julian: julianToday() }, startSerial + 500), [startSerial]);
  const { printers } = usePrinterStorage();
  const addLog = (e: LiveLogEntry) => setLog((l) => [...l.slice(-400), e]);
  const set = (id: StepId, status: Status, detail: string) =>
    setSteps((s) => ({ ...s, [id]: { status, detail, at: new Date().toISOString() } }));
  const nextAfter = (id: StepId) => { const i = STEPS.findIndex((s) => s.id === id); if (i < STEPS.length - 1) setActive(STEPS[i + 1].id); };

  const runSoftware = async () => {
    set("software", "running", ""); setSoftResults([]);
    const out = await runValidation(DEFAULT_VALIDATION, (r) => setSoftResults((p) => [...p, r]));
    const fail = out.results.filter((r) => r.status === "fail").length;
    const pend = out.results.filter((r) => r.status === "pending").length;
    set("software", fail ? "fail" : "pass", `${out.results.length - fail - pend} pass · ${fail} fail · ${pend} waiting on Authentix`);
  };
  const runSafety = () => { const r = safetyCheck(); set("safety", r.ok ? "pass" : "fail", r.detail); };
  const runConnection = async () => { set("connection", "running", ""); const r = await connectionCheck(printers); set("connection", r.ok ? "pass" : "fail", r.detail); };
  const batchCodes = useMemo(
    () => Array.from({ length: BATCH }, (_, i) => buildPrintedCode({ prodLine: "07", alphaYear: "A", julian: julianToday() }, startSerial + i)),
    [startSerial],
  );
  const runSingle = async () => {
    set("single", "running", ""); setBatchSent([]); setCodeTicks({});
    const r = await sendBatch(batchCodes, addLog, (_i, code, ok) => { if (ok) setBatchSent((p) => [...p, code]); }, trigger);
    set("single", r.ok ? "running" : "fail", r.ok ? `${r.detail} — now confirm each printed code below` : r.detail);
  };
  const runReplay = async () => {
    set("replay", "running", ""); setProgress(0); abortRef.current = new AbortController();
    const r = await runLiveReplay({ startSerial, bottles, gapMs, trigger, log: addLog, onProgress: (d, t) => setProgress((d / t) * 100), signal: abortRef.current.signal });
    set("replay", r.ok ? "pass" : "fail", r.detail);
  };
  const runStall = async () => {
    set("stall", "running", "");
    const r = await sendSingle(stallCode, addLog, trigger);
    if (stallPhase === "ready") {
      if (r.ok) set("stall", "fail", "Code was accepted although Printer 2 should be stopped/disconnected. Make sure it is really offline and retry.");
      else { setStallPhase("held"); set("stall", "running", `Held correctly (${r.detail}). Now reconnect Printer 2 and press Resend.`); }
    } else {
      if (r.ok) { setStallPhase("done"); set("stall", "pass", `Held while Printer 2 was down, then ${stallCode} printed on both after reconnect — nothing skipped.`); }
      else set("stall", "running", `Still failing (${r.detail}). Check Printer 2 is back online and press Resend.`);
    }
  };

  const runTnt = async () => {
    set("tnt", "running", ""); setProgress(0); setTntStages({}); abortRef.current = new AbortController();
    const r = await runLiveTnt({ codes: tntCodes, trigger, log: addLog, onStage: (st) => setTntStages((p) => ({ ...p, [st.id]: st })), onProgress: (d, t) => setProgress((d / t) * 100), signal: abortRef.current.signal });
    set("tnt", r.ok ? "pass" : "fail", r.detail);
  };

  const buildReport = () => ({
      kind: "TwinCode live validation report", generatedAt: new Date().toISOString(),
      testData: { logConfig: LOG_CONFIG, printMessage: buildTestPrintMessage(startSerial), testCode, stallCode, bottles, gapMs, sandbox: TEST_DATA, trigger, tntCodes, tntStages },
      steps: STEPS.map((s) => ({ step: s.title, ...steps[s.id] })),
      inspection: INSPECT.map((q, i) => ({ check: q, ok: ticks[i] })),
      softwareChecks: softResults, trafficLog: log,
  });
  const reportFilename = (ext: string) => `twincode-validation-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;
  const exportReport = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(buildReport(), null, 2)], { type: "application/json" }));
    a.download = reportFilename("json");
    a.click(); URL.revokeObjectURL(a.href);
  };
  const exportExcel = () => {
    try {
      downloadValidationXlsx(buildReport() as ValidationReport, reportFilename("xlsx"));
    } catch (err) {
      console.error("Excel export failed", err);
    }
  };

  const Icon = ({ s }: { s: Status }) =>
    s === "pass" ? <CheckCircle2 className="h-4 w-4 text-primary" /> : s === "fail" ? <XCircle className="h-4 w-4 text-destructive" />
      : s === "running" ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Circle className="h-4 w-4 text-muted-foreground" />;

  const liveBlocked = steps.safety.status !== "pass" || steps.connection.status !== "pass";
  const step = STEPS.find((s) => s.id === active)!;
  const passed = STEPS.filter((s) => steps[s.id].status === "pass").length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { if (!v) void releaseValidationLink(); onOpenChange(v); } }}>
      <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" /> TwinCode validation — step by step
            <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              v{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "?"}
            </span>
          </DialogTitle>
          <DialogDescription>
            Test data is built from the old system's recorded Track-n-Trace log (Config, Line 07, Year A, today's Julian day). Test serials start at {TEST_SERIAL_START} so they can't be mistaken for production codes. The serial list, ledger and production runs are never touched.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-[240px_1fr]">
          <div className="space-y-1">
            {STEPS.map((s) => (
              <button key={s.id} type="button" disabled={busy} onClick={() => setActive(s.id)}
                className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${active === s.id ? "border-primary bg-primary/5" : "border-border"}`}>
                <Icon s={steps[s.id].status} /><span className="flex-1">{s.title}</span><ChevronRight className="h-3 w-3 text-muted-foreground" />
              </button>
            ))}
            <div className="pt-2 text-[11px] text-muted-foreground">{passed}/{STEPS.length} steps passed</div>
            <Button size="sm" variant="outline" className="w-full" onClick={exportReport}><Download className="mr-1 h-4 w-4" /> Export report</Button>
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-semibold">{step.title}</div>
              <p className="text-xs text-muted-foreground">{step.what}</p>
            </div>

            {["single", "replay", "stall", "tnt"].includes(active) && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs">
                <span className="font-medium">Print release:</span>
                <Button size="sm" variant={trigger === "photocell" ? "default" : "outline"} className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => setTrigger("photocell")}>Photocell (live line)</Button>
                <Button size="sm" variant={trigger === "printgo" ? "default" : "outline"} className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => setTrigger("printgo")}>Print Go (bench, no product)</Button>
                <span className="text-muted-foreground">{trigger === "photocell" ? "Each code waits (up to 30 s) for a product to trip the photocell before the next is released." : "CodeSync fires each print itself."}</span>
              </div>
            )}

            {["single", "replay", "stall", "tnt"].includes(active) && liveBlocked && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4" /> Pass steps 2 and 3 first — live sends are locked until then.
              </div>
            )}

            {active === "software" && (
              <>
                <Button size="sm" onClick={runSoftware} disabled={busy}>Run software checks</Button>
                {softResults.length > 0 && (
                  <ScrollArea className="h-56 rounded border border-border">
                    {softResults.map((r) => (
                      <div key={r.id} className="flex gap-2 border-b border-border/40 px-2 py-1 text-[11px]">
                        <Icon s={r.status === "pending" ? "todo" : r.status} />
                        <div><span className="font-mono text-muted-foreground">{r.id}</span> {r.name}<div className="font-mono text-[10px] text-muted-foreground">{r.detail}</div></div>
                      </div>
                    ))}
                  </ScrollArea>
                )}
              </>
            )}
            {active === "safety" && <Button size="sm" onClick={runSafety} disabled={busy}>Run safety check</Button>}
            {active === "connection" && <Button size="sm" onClick={runConnection} disabled={busy}>Check printers</Button>}

            {active === "single" && (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1"><Label className="text-xs">Test start serial</Label>
                    <Input type="number" className="h-8 w-32" value={startSerial} min={900001} max={998000} onChange={(e) => setStartSerial(Math.max(900001, Math.min(998000, Number(e.target.value) || TEST_SERIAL_START)))} /></div>
                  <div className="text-xs">Code to print: <span className="font-mono font-semibold">{testCode}</span></div>
                </div>
                <Button size="sm" onClick={runSingle} disabled={busy || liveBlocked}>Send {BATCH} test codes to both printers</Button>
                {batchSent.length > 0 && steps.single.status === "running" && (
                  <div className="space-y-1">
                    <span className="text-xs">Check each printed code on the line and mark it:</span>
                    {batchSent.map((c) => (
                      <div key={c} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs">
                        <span className="font-mono font-semibold">{c}</span>
                        <span className="flex-1" />
                        {codeTicks[c] === true && <Badge variant="secondary" className="text-[10px]">printed OK</Badge>}
                        {codeTicks[c] === false && <Badge variant="destructive" className="text-[10px]">wrong / missing</Badge>}
                        <Button size="sm" variant={codeTicks[c] === true ? "default" : "outline"} className="h-6 px-2 text-[10px]"
                          onClick={() => setCodeTicks((t) => ({ ...t, [c]: true }))}>OK</Button>
                        <Button size="sm" variant={codeTicks[c] === false ? "destructive" : "outline"} className="h-6 px-2 text-[10px]"
                          onClick={() => setCodeTicks((t) => ({ ...t, [c]: false }))}>Fail</Button>
                      </div>
                    ))}
                    {batchSent.every((c) => codeTicks[c] !== undefined) && (
                      <Button size="sm" className="mt-1"
                        onClick={() => {
                          const bad = batchSent.filter((c) => codeTicks[c] === false);
                          set("single", bad.length ? "fail" : "pass",
                            bad.length ? `Operator reported problems with: ${bad.join(", ")}` : `All ${batchSent.length} codes confirmed printed on both printers`);
                        }}>Finish step</Button>
                    )}
                  </div>
                )}
              </>
            )}

            {active === "replay" && (
              <>
                <div className="rounded bg-muted/40 p-2 font-mono text-[10px]">
                  Config (from log): {LOG_CONFIG}<br />Print (test): {buildTestPrintMessage(startSerial)}
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="space-y-1"><Label className="text-xs">Codes to print</Label>
                    <Input type="number" className="h-8 w-24" value={bottles} min={1} max={500} onChange={(e) => setBottles(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} /></div>
                  {trigger === "printgo" && <div className="space-y-1"><Label className="text-xs">Gap between codes (ms)</Label>
                    <Input type="number" className="h-8 w-28" value={gapMs} min={0} max={5000} onChange={(e) => setGapMs(Math.max(0, Math.min(5000, Number(e.target.value) || 0)))} /></div>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={runReplay} disabled={busy || liveBlocked}>Start replay</Button>
                  {steps.replay.status === "running" && <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>Stop</Button>}
                </div>
                {steps.replay.status !== "todo" && <Progress value={progress} />}
              </>
            )}

            {active === "stall" && (
              <>
                <div className="text-xs">Test code: <span className="font-mono font-semibold">{stallCode}</span></div>
                <Button size="sm" onClick={runStall} disabled={busy || liveBlocked || stallPhase === "done"}>
                  {stallPhase === "ready" ? "Printer 2 is offline — send" : "Printer 2 reconnected — resend same code"}
                </Button>
                {stallPhase !== "ready" && <Button size="sm" variant="ghost" onClick={() => { setStallPhase("ready"); set("stall", "todo", ""); }}>Restart this step</Button>}
              </>
            )}

            {active === "tnt" && (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1"><Label className="text-xs">Codes to print</Label>
                    <Input type="number" className="h-8 w-24" value={tntCodes} min={1} max={100} onChange={(e) => setTntCodes(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></div>
                  <Button size="sm" onClick={runTnt} disabled={busy || liveBlocked}>Start real data link test</Button>
                  {steps.tnt.status === "running" && <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>Stop</Button>}
                </div>
                <div className="space-y-1">
                  {([["endpoint", "Endpoint listening on this PC"], ["client", "Track-n-Trace PC connected"], ["config", "Config received + acknowledged"], ["print", "Print message received + code valid"], ["codes", "Codes printed on both printers"], ["poll", "30-second poll returns last serial"]] as const).map(([id, label]) => {
                    const st = tntStages[id];
                    return (
                      <div key={id} className="flex items-start gap-2 rounded border border-border px-2 py-1 text-xs">
                        <Icon s={!st ? "todo" : st.ok === null ? "running" : st.ok ? "pass" : "fail"} />
                        <div><div className="font-medium">{label}</div>{st && <div className="text-[11px] text-muted-foreground">{st.detail}</div>}</div>
                      </div>
                    );
                  })}
                </div>
                {steps.tnt.status !== "todo" && <Progress value={progress} />}
              </>
            )}

            {active === "inspect" && (
              <>
                {INSPECT.map((q, i) => (
                  <label key={q} className="flex items-start gap-2 text-xs">
                    <Checkbox checked={ticks[i]} onCheckedChange={(v) => setTicks((t) => t.map((x, j) => (j === i ? !!v : x)))} /> {q}
                  </label>
                ))}
                <Button size="sm" disabled={!ticks.every(Boolean)} onClick={() => set("inspect", "pass", "All inspection points confirmed by operator")}>Confirm inspection</Button>
              </>
            )}

            {steps[active].detail && (
              <div className={`whitespace-pre-line rounded border px-2 py-1.5 text-xs ${steps[active].status === "fail" ? "border-destructive/40 text-destructive" : steps[active].status === "pass" ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
                {steps[active].detail}
              </div>
            )}
            {steps[active].status === "pass" && active !== "inspect" && <Button size="sm" variant="ghost" onClick={() => nextAfter(active)}>Next step <ChevronRight className="ml-1 h-3 w-3" /></Button>}

            {log.length > 0 && ["single", "replay", "stall", "tnt"].includes(active) && (
              <ScrollArea className="h-40 rounded border border-border">
                <table className="w-full font-mono text-[10px]"><tbody>
                  {log.map((e, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="px-1 text-muted-foreground">{e.t}</td><td className="px-1">{e.dir}</td><td className="px-1">{e.text}</td><td className="px-1 text-muted-foreground">{e.hex ?? ""}</td>
                    </tr>
                  ))}
                </tbody></table>
              </ScrollArea>
            )}
            <Badge variant="secondary" className="text-[10px]">Steps 4–6 and 8 print real codes · production data untouched</Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
