/**
 * Twin Code — Production Run Bar.
 *
 * Single horizontal strip rendered below the page header in BOTH HUD and
 * Debug modes. Shows:
 *   - Idle: a "Start production run" button + helpful subtext.
 *   - Active: lot/operator/elapsed timer + live printed/missed counters,
 *     Stop+Export button.
 *   - Just-completed: a green banner with quick CSV / JSON export buttons
 *     for the most recent run (kept in memory).
 */

import { useEffect, useState } from "react";
import { Play, Square, Download, FileJson, FileSpreadsheet, AlertCircle, ClipboardList, X, Activity, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useProductionRun, useLiveRunSummary } from "../useProductionRun";
import { productionRun, downloadRunCSV, downloadRunJSON, type ProductionRunExport } from "../productionRun";
import { useCatalog } from "../useCatalog";
import { useTwinPair } from "../twinPairStore";
import { twinDispatcher } from "../twinDispatcher";
import { StartRunDialog } from "./StartRunDialog";
import { PreflightDialog } from "./PreflightDialog";
import { toast } from "@/hooks/use-toast";

export function ProductionRunBar() {
  const run = useProductionRun();
  const summary = useLiveRunSummary();
  const cat = useCatalog();
  const pair = useTwinPair();
  const [startOpen, setStartOpen] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [elapsedTick, setElapsedTick] = useState(0);

  // Re-render the elapsed clock once per second while a run is active
  useEffect(() => {
    if (!run.active) return;
    const t = setInterval(() => setElapsedTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [run.active]);
  void elapsedTick;

  // Auto-stop when the catalog is exhausted: download the signed export and
  // surface a toast so the operator immediately sees the end-of-lot artifacts.
  useEffect(() => {
    productionRun.setAutoStopHandler((exp) => {
      downloadRunCSV(exp);
      downloadRunJSON(exp);
      toast({
        title: `Lot ${exp.meta.lotNumber} complete — catalog exhausted`,
        description: `${exp.summary.printed.toLocaleString()} printed · ${exp.summary.missed.toLocaleString()} missed · yield ${exp.summary.yieldPct.toFixed(2)}%. Audit CSV + signed JSON downloaded.`,
      });
    });
    return () => productionRun.setAutoStopHandler(null);
  }, []);

  const handleStop = async () => {
    setStopping(true);
    try {
      const exp = await productionRun.stop();
      setConfirmStop(false);
      if (exp) {
        toast({
          title: `Run ${exp.meta.lotNumber} completed`,
          description: `${exp.summary.printed.toLocaleString()} printed · ${exp.summary.missed.toLocaleString()} missed · yield ${exp.summary.yieldPct.toFixed(2)}%`,
        });
      }
    } finally {
      setStopping(false);
    }
  };

  // -------- ACTIVE state --------
  if (run.active && summary) {
    const liveTone = run.active.liveAtStart;
    return (
      <>
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-4 py-2.5">
          <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="font-mono">{run.active.lotNumber}</span>
              <Badge variant={liveTone ? "default" : "secondary"} className="text-[10px]">
                {liveTone ? "LIVE" : "SYNTH"}
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground">
              operator <span className="text-foreground">{run.active.operator}</span>
              {run.active.note && <> · {run.active.note}</>}
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
            <Stat label="elapsed" value={formatElapsed(summary.elapsedSec)} mono />
            <Stat label="printed" value={summary.printed.toLocaleString()} tone="ok" mono />
            <Stat label="missed" value={summary.missed.toLocaleString()} tone={summary.missed > 0 ? "bad" : "default"} mono />
            <Stat label="yield" value={`${summary.yieldPct.toFixed(2)}%`} tone={summary.yieldPct >= 99.5 ? "ok" : summary.yieldPct >= 98 ? "warn" : "bad"} mono />
            <Button size="sm" variant="destructive" onClick={() => setConfirmStop(true)} disabled={stopping}>
              <Square className="mr-1 h-4 w-4" /> Stop &amp; export
            </Button>
          </div>
        </div>

        <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>End production run?</AlertDialogTitle>
              <AlertDialogDescription>
                This freezes lot <span className="font-mono">{run.active.lotNumber}</span> and produces a tamper-evident audit
                you can download as CSV or signed JSON. The conveyor will keep running — pause it manually if you don't want
                more bottles to fly past unbatched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={stopping}>Keep running</AlertDialogCancel>
              <AlertDialogAction onClick={handleStop} disabled={stopping}>
                End run
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // -------- COMPLETED state (last run, kept in memory) --------
  if (run.lastCompleted) {
    return (
      <CompletedRunBanner
        exp={run.lastCompleted}
        onDismiss={() => productionRun.cancel()}
        onStartNew={() => setStartOpen(true)}
        startOpen={startOpen}
        onStartOpenChange={setStartOpen}
      />
    );
  }

  // -------- IDLE state --------
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border bg-muted/30 px-4 py-2.5">
        <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="text-xs text-muted-foreground">
          No active production run. Start a run to lock the line to a lot # and capture an auditable trail of every printed serial.
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setPreflightOpen(true)}>
            <Activity className="mr-1 h-4 w-4" /> Pre-flight
          </Button>
          <Button size="sm" onClick={() => setStartOpen(true)}>
            <Play className="mr-1 h-4 w-4" /> Start production run
          </Button>
        </div>
      </div>
      <StartRunDialog open={startOpen} onOpenChange={setStartOpen} onStarted={() => { /* no-op */ }} />
      <PreflightDialog open={preflightOpen} onOpenChange={setPreflightOpen} />
    </>
  );
}

// ---------- Sub-components ----------

function CompletedRunBanner({
  exp,
  onDismiss,
  onStartNew,
  startOpen,
  onStartOpenChange,
}: {
  exp: ProductionRunExport;
  onDismiss: () => void;
  onStartNew: () => void;
  startOpen: boolean;
  onStartOpenChange: (v: boolean) => void;
}) {
  const tone = exp.summary.missed === 0 ? "ok" : exp.summary.yieldPct >= 98 ? "warn" : "bad";
  const borderClass =
    tone === "ok" ? "border-primary/40 bg-primary/5" :
    tone === "warn" ? "border-accent bg-accent/10" :
    "border-destructive/40 bg-destructive/5";
  return (
    <>
      <div className={`flex flex-wrap items-center gap-3 rounded-md border px-4 py-2.5 ${borderClass}`}>
        {tone === "bad" ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
        )}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Run complete · <span className="font-mono">{exp.meta.lotNumber}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {exp.summary.printed.toLocaleString()} printed · {exp.summary.missed.toLocaleString()} missed · yield {exp.summary.yieldPct.toFixed(2)}% · {formatElapsed(exp.summary.elapsedSec)} ·{" "}
            <span className="font-mono" title={`Document SHA-256: ${exp.documentHash}`}>
              sig {exp.documentHash.slice(0, 12)}…
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadRunCSV(exp)}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadRunJSON(exp)}>
            <FileJson className="mr-1 h-4 w-4" /> Signed JSON
          </Button>
          <Button size="sm" onClick={onStartNew}>
            <Play className="mr-1 h-4 w-4" /> New run
          </Button>
          <Button size="icon" variant="ghost" onClick={onDismiss} title="Dismiss banner">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <StartRunDialog open={startOpen} onOpenChange={onStartOpenChange} onStarted={() => { /* no-op */ }} />
    </>
  );
}

function Stat({
  label, value, tone = "default", mono,
}: {
  label: string; value: string; tone?: "default" | "ok" | "warn" | "bad"; mono?: boolean;
}) {
  const valueClass =
    tone === "ok"   ? "text-primary" :
    tone === "warn" ? "text-yellow-500 dark:text-yellow-400" :
    tone === "bad"  ? "text-destructive" :
    "text-foreground";
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`${mono ? "font-mono" : ""} font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm.toString().padStart(2, "0")}m`;
}
