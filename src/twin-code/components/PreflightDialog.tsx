/**
 * Twin Code — Pre-flight (dry-run) dialog.
 *
 * Fires 5–10 ghost cycles through the bonded path (or a synthetic stand-in
 * when no pair is bound) and surfaces a green/red "ready for production"
 * verdict. Catalog and production-run ledger are NOT touched.
 *
 * Use cases:
 *   1. Operator click before locking a real batch (entry point: Production
 *      Run bar, Start Run dialog).
 *   2. Bench/no-printer development — verifies the dispatcher contract and
 *      shows what a healthy run looks like.
 */

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, PlayCircle, Loader2, RotateCcw, Activity, AlertTriangle } from "lucide-react";
import {
  runPreflight,
  DEFAULT_PREFLIGHT_CONFIG,
  type PreflightCycleResult,
  type PreflightVerdict,
} from "../preflight";
import { twinDispatcher } from "../twinDispatcher";
import { toast } from "@/hooks/use-toast";

export function PreflightDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [cycles, setCycles] = useState<number>(DEFAULT_PREFLIGHT_CONFIG.cycles);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [liveResults, setLiveResults] = useState<PreflightCycleResult[]>([]);
  const [verdict, setVerdict] = useState<PreflightVerdict | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isLive = twinDispatcher.isBound();

  // Reset state every time the dialog opens
  useEffect(() => {
    if (open) {
      setVerdict(null);
      setLiveResults([]);
      setProgress({ current: 0, total: 0 });
    } else {
      // Cancel any in-flight test if the user closes mid-run
      abortRef.current?.abort();
    }
  }, [open]);

  const handleRun = async () => {
    setRunning(true);
    setVerdict(null);
    setLiveResults([]);
    setProgress({ current: 0, total: cycles });
    abortRef.current = new AbortController();
    try {
      const v = await runPreflight(
        { cycles },
        (current, total, result) => {
          setProgress({ current, total });
          setLiveResults((prev) => [...prev, result]);
        },
        abortRef.current.signal,
      );
      setVerdict(v);
      if (v.pass) {
        toast({
          title: "Pre-flight passed",
          description: `${v.succeeded}/${v.total} cycles · cycle p95 ${v.cycle.p95.toFixed(1)}ms · skew p95 ${v.skew.p95.toFixed(1)}ms`,
        });
      } else {
        toast({
          title: "Pre-flight failed",
          description: "Review the checks below before starting a real batch.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Pre-flight error", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const handleReset = () => {
    setVerdict(null);
    setLiveResults([]);
    setProgress({ current: 0, total: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!running) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> Pre-flight test (dry run)
          </DialogTitle>
          <DialogDescription>
            Fires {cycles} ghost cycles through the bonded path to verify cycle, skew, and ACK health.
            No catalog serials are consumed; nothing is written to the production-run ledger.
          </DialogDescription>
        </DialogHeader>

        {/* Mode banner */}
        <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${isLive ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}>
          {isLive ? (
            <>
              <Badge className="text-[10px]">LIVE</Badge>
              <span className="text-foreground">Bonded pair detected — ghost cycles will hit real printer wires.</span>
            </>
          ) : (
            <>
              <Badge variant="secondary" className="text-[10px]">SYNTH</Badge>
              <span className="text-muted-foreground">No bonded pair. Test will use the synthetic timing model.</span>
            </>
          )}
        </div>

        {/* Cycle count slider */}
        {!verdict && !running && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Cycles</Label>
              <span className="font-mono text-xs text-muted-foreground">{cycles}</span>
            </div>
            <Slider
              value={[cycles]}
              min={5}
              max={20}
              step={1}
              onValueChange={([v]) => setCycles(v)}
            />
          </div>
        )}

        {/* Live progress */}
        {(running || liveResults.length > 0) && !verdict && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {running ? "Firing ghost cycles…" : "Complete"}
              </span>
              <span className="font-mono">{progress.current} / {progress.total}</span>
            </div>
            <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} />
          </div>
        )}

        {/* Verdict card */}
        {verdict && <VerdictCard verdict={verdict} />}

        {/* Per-cycle results */}
        {(liveResults.length > 0 || verdict) && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cycle results
            </div>
            <ScrollArea className="h-40 rounded-md border border-border bg-card">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">#</th>
                    <th className="px-2 py-1 text-right font-medium">A (ms)</th>
                    <th className="px-2 py-1 text-right font-medium">B (ms)</th>
                    <th className="px-2 py-1 text-right font-medium">Cycle</th>
                    <th className="px-2 py-1 text-right font-medium">Skew</th>
                    <th className="px-2 py-1 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(verdict?.results ?? liveResults).map((r) => (
                    <tr key={r.index} className="border-t border-border/50">
                      <td className="px-2 py-1 font-mono">{r.index}</td>
                      <td className="px-2 py-1 text-right font-mono">{r.aMs?.toFixed(1) ?? "—"}</td>
                      <td className="px-2 py-1 text-right font-mono">{r.bMs?.toFixed(1) ?? "—"}</td>
                      <td className="px-2 py-1 text-right font-mono">{r.cycleMs?.toFixed(1) ?? "—"}</td>
                      <td className="px-2 py-1 text-right font-mono">{r.skewMs?.toFixed(1) ?? "—"}</td>
                      <td className="px-2 py-1">
                        {r.ok ? (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <CheckCircle2 className="h-3 w-3" /> ok
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive" title={r.reason}>
                            <XCircle className="h-3 w-3" /> {r.reason ?? "fail"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {verdict ? (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
              <Button type="button" variant="outline" onClick={handleReset}>
                <RotateCcw className="mr-1 h-4 w-4" /> Run again
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>
                Cancel
              </Button>
              <Button type="button" onClick={handleRun} disabled={running}>
                {running ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running…</>
                ) : (
                  <><PlayCircle className="mr-2 h-4 w-4" /> Run pre-flight</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------- Verdict card ---------------

function VerdictCard({ verdict }: { verdict: PreflightVerdict }) {
  const tone = verdict.pass ? "ok" : "bad";
  const borderClass = tone === "ok"
    ? "border-primary/40 bg-primary/5"
    : "border-destructive/40 bg-destructive/5";
  const Icon = tone === "ok" ? CheckCircle2 : AlertTriangle;
  const iconClass = tone === "ok" ? "text-primary" : "text-destructive";

  return (
    <div className={`rounded-md border p-3 ${borderClass}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${iconClass}`} />
        <div className="flex flex-col">
          <div className="text-sm font-semibold text-foreground">
            {verdict.pass ? "Ready for production" : "Not ready — review issues"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {verdict.mode === "live" ? "LIVE bonded path" : "Synthetic timing model"} · {verdict.succeeded}/{verdict.total} cycles ok
          </div>
        </div>
      </div>

      <Separator className="my-2" />

      <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
        <Metric label="success" value={`${verdict.successPct.toFixed(1)}%`} tone={verdict.checks[0].ok ? "ok" : "bad"} />
        <Metric label="cycle p95" value={`${verdict.cycle.p95.toFixed(1)} ms`} tone={verdict.checks[1].ok ? "ok" : "bad"} />
        <Metric label="skew p95" value={`${verdict.skew.p95.toFixed(1)} ms`} tone={verdict.checks[2].ok ? "ok" : "bad"} />
        <Metric label="worst streak" value={String(verdict.worstStreak)} tone={verdict.checks[3].ok ? "ok" : "bad"} />
      </div>

      <Separator className="my-2" />

      <div className="space-y-1">
        {verdict.checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2 text-xs">
            {c.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            )}
            <span className={c.ok ? "text-foreground" : "text-destructive"}>{c.label}</span>
            {c.detail && (
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{c.detail}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "ok" | "bad" | "default" }) {
  const valueClass =
    tone === "ok" ? "text-primary" :
    tone === "bad" ? "text-destructive" :
    "text-foreground";
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}
