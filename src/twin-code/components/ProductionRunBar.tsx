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
import { Play, Square, Download, FileJson, FileSpreadsheet, AlertCircle, ClipboardList, X, Activity, CheckCircle2, XCircle, FileText, Zap, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadEnvelopeReport } from "../envelopeReport";
import { conveyorSim } from "../conveyorSim";
import { useConveyor } from "../useConveyor";
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
import { twinDispatcher, type PhotocellMirrorState } from "../twinDispatcher";
import { useProductionMode } from "../printGoMode";
import { StartRunDialog } from "./StartRunDialog";
import { PreflightDialog } from "./PreflightDialog";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { Radio } from "lucide-react";

export function ProductionRunBar() {
  const run = useProductionRun();
  const summary = useLiveRunSummary();
  const cat = useCatalog();
  const pair = useTwinPair();
  const [productionMode] = useProductionMode();
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

  // Hardware photocell mirror — when in Production mode, the printer's real
  // photocell drives every print. We poll ^CN to mirror those trips into the
  // catalog ledger so "Printed" increments live without any host-side ^PT.
  useEffect(() => {
    if (!run.active) return;
    if (!productionMode) return;
    if (!twinDispatcher.isBound()) return;
    twinDispatcher.startPhotocellMirror({ autoCode: !!pair.autoCodeMode });
    return () => {
      twinDispatcher.stopPhotocellMirror();
    };
  }, [run.active, productionMode, pair.autoCodeMode]);

  // Auto-stop when the catalog is exhausted OR the run-length cap is hit:
  // download the signed export + envelope report and surface a toast so the
  // operator immediately sees the end-of-lot artifacts.
  useEffect(() => {
    productionRun.setAutoStopHandler((exp) => {
      // CRITICAL: stop the conveyor sim too. Sealing the run alone leaves
      // Auto Print Go pacing forever, which is what produced the "BOTTLE #640"
      // runaway after a 50-bottle lot. Halt the photocell first, then export.
      conveyorSim.stop();
      downloadRunCSV(exp);
      downloadRunJSON(exp);
      downloadEnvelopeReport(exp);
      const reason = exp.meta.targetCount
        ? `run length cap (${exp.meta.targetCount}) reached`
        : "catalog exhausted";
      toast({
        title: `Lot ${exp.meta.lotNumber} complete — ${reason}`,
        description: `${exp.summary.printed.toLocaleString()} printed · ${exp.summary.missed.toLocaleString()} missed · yield ${exp.summary.yieldPct.toFixed(2)}%. CSV + signed JSON + Envelope report downloaded.`,
      });
      // Celebrate cleanly via sonner — operators get a glanceable success
      // banner separate from the heavier download notice above.
      const celebrate = exp.summary.yieldPct >= 99 ? sonnerToast.success : sonnerToast;
      celebrate(`🎉 Lot ${exp.meta.lotNumber} complete`, {
        description: `${exp.summary.printed.toLocaleString()} printed · yield ${exp.summary.yieldPct.toFixed(2)}%`,
        duration: 8000,
      });
    });
    return () => productionRun.setAutoStopHandler(null);
  }, []);

  const handleStop = async () => {
    setStopping(true);
    try {
      // Manual Stop & Export must also halt Auto Print Go so the operator
      // doesn't have to click two buttons to fully stop the line.
      conveyorSim.stop();
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
    const target = run.active.targetCount ?? null;
    const consumed = summary.printed + summary.missed;
    void target; // (chip below uses it; consumed already shown)
    return (
      <>
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-4 py-2.5" data-tour="production-run-active">
          <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="font-mono">{run.active.lotNumber}</span>
              <Badge variant={liveTone ? "default" : "secondary"} className="text-[10px]">
                {liveTone ? "LIVE" : "SYNTH"}
              </Badge>
              {target && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {consumed} / {target}
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              operator <span className="text-foreground">{run.active.operator}</span>
              {run.active.note && <> · {run.active.note}</>}
            </div>
          </div>

          <ConveyorAutoControls consumed={consumed} elapsedSec={summary.elapsedSec} />

          <div className="ml-auto flex flex-wrap items-center gap-5">
            <BigStat label="Printed" value={summary.printed.toLocaleString()} tone="ok" />
            <BigStat label="Missed" value={summary.missed.toLocaleString()} tone={summary.missed > 0 ? "bad" : "default"} />
            <BigStat
              label="Yield"
              value={`${summary.yieldPct.toFixed(2)}%`}
              tone={summary.yieldPct >= 99.5 ? "ok" : summary.yieldPct >= 98 ? "warn" : "bad"}
            />
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Elapsed</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                {formatElapsed(summary.elapsedSec)}
              </span>
            </div>
            <Button size="lg" variant="destructive" onClick={() => setConfirmStop(true)} disabled={stopping}>
              <Square className="mr-1.5 h-4 w-4" /> Stop &amp; export
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
        onDismiss={() => productionRun.dismissCompleted()}
        onResetAll={() => productionRun.resetAll()}
        onStartNew={() => setStartOpen(true)}
        startOpen={startOpen}
        onStartOpenChange={setStartOpen}
      />
    );
  }

  // -------- IDLE state --------
  // The pre-run readiness UI used to live here as a dashed callout box, but
  // operators got two competing surfaces (this bar + the catalog strip just
  // below). Start Run + Pre-flight now live inside CatalogStripBar so there's
  // a single horizontal control row. We render nothing while idle.
  void cat; void pair; void setStartOpen; void setPreflightOpen; void startOpen; void preflightOpen;
  return null;
}


// ---------- Sub-components ----------

function CompletedRunBanner({
  exp,
  onDismiss,
  onResetAll,
  onStartNew,
  startOpen,
  onStartOpenChange,
}: {
  exp: ProductionRunExport;
  onDismiss: () => void;
  onResetAll: () => void;
  onStartNew: () => void;
  startOpen: boolean;
  onStartOpenChange: (v: boolean) => void;
}) {
  const tone = exp.summary.missed === 0 ? "ok" : exp.summary.yieldPct >= 98 ? "warn" : "bad";
  const borderClass =
    tone === "ok" ? "border-primary/40 bg-primary/5" :
    tone === "warn" ? "border-accent bg-accent/10" :
    "border-destructive/40 bg-destructive/5";
  const [confirmReset, setConfirmReset] = useState(false);
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Download className="mr-1 h-4 w-4" /> Download
                <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Audit artifacts
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => downloadEnvelopeReport(exp)}>
                <FileText className="mr-2 h-4 w-4" />
                Envelope report (HTML)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => downloadRunCSV(exp)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                CSV export
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadRunJSON(exp)}>
                <FileJson className="mr-2 h-4 w-4" />
                Signed JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={onStartNew} className="shadow-md ring-2 ring-primary/30">
            <Play className="mr-1 h-4 w-4" /> New run
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmReset(true)}
            title="Wipe lot ledger, reset bottle counter & faults — keeps the loaded CSV"
          >
            <X className="mr-1 h-4 w-4" /> Reset &amp; clear
          </Button>
          <Button size="icon" variant="ghost" onClick={onDismiss} title="Dismiss banner only (keep ledger as-is)">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <StartRunDialog open={startOpen} onOpenChange={onStartOpenChange} onStarted={() => { /* no-op */ }} />
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset and clear this lot?</AlertDialogTitle>
            <AlertDialogDescription>
              This will: dismiss the completed banner, reset the catalog so all{" "}
              <span className="font-mono">{exp.meta.catalogTotalAtStart.toLocaleString()}</span>{" "}
              serials are available again, zero the bottle counter, and clear fault history.
              The CSV stays loaded. Make sure you've already downloaded the CSV / Signed JSON / Envelope report
              for lot <span className="font-mono">{exp.meta.lotNumber}</span> — they will NOT be recoverable after reset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { onResetAll(); setConfirmReset(false); }}
            >
              Reset everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

/** Glance-sized stat for the active production run banner — readable across the room. */
function BigStat({
  label, value, tone = "default",
}: {
  label: string; value: string; tone?: "default" | "ok" | "warn" | "bad";
}) {
  const valueClass =
    tone === "ok"   ? "text-primary" :
    tone === "warn" ? "text-yellow-500 dark:text-yellow-400" :
    tone === "bad"  ? "text-destructive" :
    "text-foreground";
  return (
    <div className="flex flex-col items-end gap-0.5 leading-none">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-mono text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
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

/**
 * Inline conveyor controls inside the active production-run banner.
 *
 * The HUD already has a separate LineControlsBar (further down the page) but
 * operators kept missing it and starting a run with the conveyor stopped —
 * which produced "ELAPSED 30s · PRINTED 0 · MISSED 0" with no obvious cause.
 * This row puts a one-click Start/Stop + a manual Fire 1 right next to the
 * lot number so it's impossible to miss.
 */
function ConveyorAutoControls({ consumed, elapsedSec }: { consumed: number; elapsedSec: number }) {
  const conv = useConveyor();
  const [running, setRunning] = useState(() => conveyorSim.isRunning());
  useEffect(() => {
    const id = window.setInterval(() => {
      const r = conveyorSim.isRunning();
      setRunning((prev) => (prev === r ? prev : r));
    }, 300);
    return () => window.clearInterval(id);
  }, []);

  // Soft warning when run has been active for >5s but nothing has been
  // dispatched yet — almost always means the conveyor sim isn't running.
  const stalled = !running && consumed === 0 && elapsedSec >= 5;

  return (
    <div className="flex items-center gap-2">
      {running ? (
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs border-emerald-500/50 text-emerald-500 hover:text-emerald-400"
          onClick={() => conveyorSim.stop()}
          title={`Auto Print Go is firing at ~${Math.round(conv.bpm)} bpm`}
        >
          <Square className="mr-1 h-3.5 w-3.5" />
          Stop Auto Print Go
          <span className="ml-1.5 font-mono text-[10px] opacity-70">{Math.round(conv.bpm)} bpm</span>
        </Button>
      ) : (
        <Button
          size="sm"
          className={stalled ? "h-8 px-2.5 text-xs animate-pulse" : "h-8 px-2.5 text-xs"}
          variant={stalled ? "default" : "secondary"}
          onClick={() => conveyorSim.start()}
          title={`Start the bottle generator — bottles cross the photocell at ${Math.round(conv.bpm)} BPM and trigger Print Go. Adjust speed/pitch in the Line tab.`}
        >
          <Play className="mr-1 h-3.5 w-3.5" />
          {stalled ? "Start Auto Print Go ←" : "Start Auto Print Go"}
          <span className="ml-1.5 font-mono text-[10px] opacity-70">{Math.round(conv.bpm)} bpm</span>
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-8 px-2 text-xs"
        onClick={() => conveyorSim.manualFire()}
        title="Fire one bottle manually — useful to confirm the dispatcher is reaching the printers"
      >
        <Zap className="mr-1 h-3.5 w-3.5" /> Fire 1
      </Button>
    </div>
  );
}
