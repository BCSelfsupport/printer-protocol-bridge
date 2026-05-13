/**
 * Twin Code — Catalog & Mode Strip (production HUD top bar).
 *
 * Replaces the old Conveyor panel for the operator HUD. Shows ONLY what a
 * production operator needs:
 *   - Load CSV catalog
 *   - Live counters: Total / Remaining / Printed / Miss-prints
 *   - LIVE / SYNTH toggle (with bound-pair guard)
 *   - Pre-flight (ghost cycles + ready/not-ready verdict)
 *   - Reset (end-of-lot housekeeping)
 *   - Ledger fingerprint + auto-save heartbeat
 *
 * Everything else (synthetic conveyor visualizer, speed sliders, fault-injection)
 * has been removed from the production view — those are demo/debug tools.
 */

import { useEffect, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  Trash2,
  Radio,
  Loader2,
  RotateCcw,
  Volume2,
  VolumeX,
  AlertTriangle,
  Play,
  Activity,
  Factory,
  FlaskConical,
  Layers,
  X,
  ChevronRight,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StartRunDialog } from "./StartRunDialog";
import { PreflightDialog } from "./PreflightDialog";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { CsvColumnPickerDialog } from "./CsvColumnPickerDialog";
import { LedgerResumeBanner } from "./LedgerResumeBanner";
import { FaultRecoveryBanner } from "./FaultRecoveryBanner";
import { conveyorSim } from "../conveyorSim";
import { catalog } from "../catalog";
import { catalogQueue, type CatalogQueueState } from "../catalogQueue";
import { faultGuard } from "../faultGuard";
import { useCatalog } from "../useCatalog";
import { useTwinPair } from "../twinPairStore";
import { twinDispatcher } from "../twinDispatcher";
import { lowCatalogChirp } from "../audioAlarm";
import { usePrinterStorage } from "@/hooks/usePrinterStorage";
import { useProductionMode } from "../printGoMode";
import { useProductionRun } from "../useProductionRun";

const LOW_THRESHOLD_KEY = "twincode.lowCatalogThreshold.v1";
const LOW_AUDIO_KEY = "twincode.lowCatalogAudio.v1";
const DEFAULT_LOW_THRESHOLD = 50;

export function CatalogStripBar() {
  const cat = useCatalog();
  const pair = useTwinPair();
  const autoCodeMode = !!pair.autoCodeMode;
  const { printers } = usePrinterStorage();
  const run = useProductionRun();
  const runActive = !!run.active;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const queueFileRef = useRef<HTMLInputElement | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvFilename, setCsvFilename] = useState<string>("catalog.csv");
  const [csvTarget, setCsvTarget] = useState<"active" | "queue">("active");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [productionMode, setProductionMode] = useProductionMode();
  const [startOpen, setStartOpen] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [queueState, setQueueState] = useState<CatalogQueueState>(() => catalogQueue.getState());

  useEffect(() => catalogQueue.subscribe(setQueueState), []);

  // Toast on auto-promotion so the operator sees the seamless handover.
  useEffect(() => {
    catalogQueue.setOnPromote((q, appended, skipped) => {
      toast({
        title: `On-deck catalog promoted: ${q.filename}`,
        description: `${appended.toLocaleString()} serials appended${skipped > 0 ? ` (${skipped.toLocaleString()} skipped — already printed)` : ""}.`,
      });
    });
    return () => catalogQueue.setOnPromote(null);
  }, []);

  // ---- Low-catalog warning settings (persisted) ----
  const [lowThreshold, setLowThreshold] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(LOW_THRESHOLD_KEY);
      const n = raw ? parseInt(raw, 10) : DEFAULT_LOW_THRESHOLD;
      return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LOW_THRESHOLD;
    } catch { return DEFAULT_LOW_THRESHOLD; }
  });
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(LOW_AUDIO_KEY) !== "0"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(LOW_THRESHOLD_KEY, String(lowThreshold)); } catch { /* ignore */ }
  }, [lowThreshold]);
  useEffect(() => {
    try { localStorage.setItem(LOW_AUDIO_KEY, audioEnabled ? "1" : "0"); } catch { /* ignore */ }
  }, [audioEnabled]);

  // One-shot guard so the chirp + toast fire on the falling edge only, not
  // every time React rerenders while we're under threshold. Re-arms when
  // remaining climbs back above the threshold (e.g. CSV reloaded / lot reset).
  const lowFiredRef = useRef(false);
  const remaining = Math.max(0, cat.total - cat.nextIndex);
  useEffect(() => {
    if (cat.total === 0) { lowFiredRef.current = false; return; }
    if (remaining > lowThreshold) {
      lowFiredRef.current = false;
      return;
    }
    if (remaining === 0) return; // end-of-lot is handled by auto-stop, not "low"
    if (lowFiredRef.current) return;
    lowFiredRef.current = true;
    if (audioEnabled) lowCatalogChirp();
    toast({
      title: `Low catalog — ${remaining.toLocaleString()} serials remaining`,
      description: `Stage the next CSV before the lot auto-finalizes (threshold: ${lowThreshold}).`,
    });
  }, [remaining, lowThreshold, audioEnabled, cat.total]);


  const pairBound = !!(pair.a && pair.b);

  // Tear down on unmount
  useEffect(() => {
    return () => {
      if (twinDispatcher.isBound()) {
        twinDispatcher.unbind().catch(() => {});
      }
    };
  }, []);

  const enableLive = async () => {
    if (!pairBound) {
      toast({ title: "Bind a twin pair first", variant: "destructive" });
      return;
    }
    setLiveBusy(true);
    const res = await twinDispatcher.bind(pair, printers, {
      messageNameA: pair.a?.messageName,
      messageNameB: pair.b?.messageName,
      fieldA: pair.a?.fieldIndex,
      fieldB: pair.b?.fieldIndex,
      subcommandA: pair.a?.subcommand,
      subcommandB: pair.b?.subcommand,
      autoCreateA: pair.a?.autoCreate ?? true,
      autoCreateB: pair.b?.autoCreate ?? true,
      autoCodeMode,
      autoCodeOpts: pair.autoCodeOpts,
    });
    setLiveBusy(false);
    if (!res.ok) {
      toast({
        title: "Could not enter LIVE mode",
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    // AUTO-code production must stay in native photocell mode (no ^MB/1:1),
    // otherwise the printer HMI disables Edit/New and the physical Print Go is
    // ignored. Catalog/CSV test mode still injects ^PT for synthetic bottles.
    conveyorSim.setLiveDispatcher((serial) =>
      twinDispatcher.dispatch(serial, { forceTrigger: !productionMode, autoCode: autoCodeMode }),
    );
    // Native photocell modes (Production / Auto-Code) print without any
    // host-side ^PT — start the ^CN mirror so each hardware strike feeds the
    // ledger + profilerBus, which drives the HUD's "Last printed" readout.
    if (productionMode || autoCodeMode) {
      twinDispatcher.startPhotocellMirror({ autoCode: autoCodeMode });
    }
    setLiveMode(true);
    toast({
      title: "LIVE bonded mode active",
      description: `Printer A id=${res.aId}, B id=${res.bId}`,
    });
  };

  const disableLive = async () => {
    setLiveBusy(true);
    conveyorSim.setLiveDispatcher(null);
    twinDispatcher.stopPhotocellMirror();
    await twinDispatcher.unbind();
    setLiveBusy(false);
    setLiveMode(false);
    toast({ title: "LIVE mode disengaged" });
  };

  // Dry-run was merged into Pre-flight (PreflightDialog) — one operator
  // gate before starting a real run, with raw timing stats inside.

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>, target: "active" | "queue") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setCsvFilename(file.name || "catalog.csv");
    setCsvTarget(target);
    setPickerOpen(true);
    e.target.value = "";
  };

  const handleConfirmCsv = (serials: string[], target: "active" | "queue", filename: string) => {
    if (target === "queue") {
      const res = catalogQueue.enqueue(serials, filename);
      setPickerOpen(false);
      setCsvText(null);
      if ("reason" in res) {
        toast({ title: "Couldn't stage on deck", description: res.reason, variant: "destructive" });
        return;
      }
      toast({
        title: `Staged on deck: ${filename}`,
        description: `${serials.length.toLocaleString()} serials. Will auto-promote when remaining \u2264 ${queueState.lowWater.toLocaleString()}.`,
      });
      return;
    }
    const { matchesPersisted } = catalog.load(serials);
    setPickerOpen(false);
    setCsvText(null);
    if (matchesPersisted) {
      toast({
        title: "Same catalog detected",
        description: "Use the resume banner to pick up where the previous run left off.",
      });
    }
  };

  const handleReset = () => {
    if (
      cat.consumedCount > 0 &&
      !confirm(
        "This will reset the local catalog cursor and counters for this lot. The cloud audit ledger is unaffected. Continue?",
      )
    ) {
      return;
    }
    // Stop the line and clear in-flight bottles BEFORE resetting the catalog,
    // otherwise the conveyor's RAF immediately re-dispenses the freshly-zeroed
    // serials and you're back where you started within ~50ms.
    conveyorSim.stop();
    conveyorSim.reset();
    faultGuard.reset();
    catalog.reset();
  };

  const printed = cat.consumedCount - cat.missCount;
  // `remaining` is computed above (used by the low-catalog watcher); reused here.
  const lowActive = !autoCodeMode && cat.total > 0 && remaining > 0 && remaining <= lowThreshold;

  return (
    <div className="space-y-2">
      <LedgerResumeBanner />
      <FaultRecoveryBanner />

      {/* Low-catalog warning banner (yellow). Visible only while remaining is
          between 1 and the configured threshold; disappears at 0 (auto-stop
          handles that) and above threshold. */}
      {lowActive && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div className="text-xs font-medium">
            Low catalog — <span className="font-mono">{remaining.toLocaleString()}</span> serials remaining.
            Stage the next CSV before the lot auto-finalizes.
          </div>
        </div>
      )}

      {/* Action row + LIVE toggle. When the catalog is empty, the whole row
          becomes a dashed drop target so operators have an obvious place to
          drop their CSV instead of hunting for a small button. */}
      <div
        data-tour="catalog-strip"
        className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 transition-colors ${
          !autoCodeMode && cat.total === 0
            ? "border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10"
            : "border-border bg-card"
        }`}
        onDragOver={(e) => {
          if (autoCodeMode) return;
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={async (e) => {
          if (autoCodeMode) return;
          const file = Array.from(e.dataTransfer.files).find(
            (f) => f.name.toLowerCase().endsWith(".csv") || f.type === "text/csv",
          );
          if (!file) return;
          e.preventDefault();
          const text = await file.text();
          setCsvText(text);
          setCsvFilename(file.name || "catalog.csv");
          setCsvTarget(cat.total === 0 ? "active" : "queue");
          setPickerOpen(true);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handleFile(e, "active")}
        />
        <input
          ref={queueFileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handleFile(e, "queue")}
        />
        {autoCodeMode ? (
          <div
            className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300"
            title="Auto-Code Mode is engaged — both printers generate serials natively from their counter slots. No CSV catalog is needed."
          >
            <Factory className="h-3.5 w-3.5" />
            Auto-Code Mode — no CSV needed
          </div>
        ) : (
          <>
            <Button
              size="sm"
              variant={cat.total === 0 ? "default" : "outline"}
              onClick={() => fileRef.current?.click()}
              className={cat.total === 0 ? "shadow-md" : ""}
              data-tour="catalog-upload"
            >
              <Upload className="mr-1 h-4 w-4" />
              {cat.total === 0 ? "Drop CSV here or click to browse" : "Load CSV catalog"}
            </Button>

            {cat.total > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => queueFileRef.current?.click()}
                title="Pre-stage the next CSV. It will auto-promote when the active catalog drops below the low-water mark — keeps the line printing across midnight without operator intervention."
                data-tour="catalog-queue-add"
              >
                <Layers className="mr-1 h-4 w-4" />
                Stage next CSV
                {queueState.items.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-mono text-primary">
                    {queueState.items.length}
                  </span>
                )}
              </Button>
            )}
          </>
        )}

        {/* LIVE mode toggle */}
        <div
          data-tour="live-toggle"
          className={`flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] ${
            liveMode
              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-500"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
          title={
            pairBound
              ? "Toggle real bonded dispatch via 1-1 mode"
              : "Bind a twin pair to enable LIVE mode"
          }
        >
          {liveBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                liveMode
                  ? "bg-emerald-500 shadow-[0_0_6px_2px_hsl(142_76%_45%/0.7)] animate-pulse"
                  : "bg-muted-foreground/40"
              }`}
              aria-hidden
            />
          )}
          <span className="font-mono uppercase tracking-wider">LIVE</span>
          <Switch
            checked={liveMode}
            disabled={liveBusy || !pairBound}
            onCheckedChange={(v) => (v ? enableLive() : disableLive())}
          />
        </div>

        {/* Print Go source: Auto (software ^PT, for testing) vs Production
            (wait for the real photocell wired to the printer's input). */}
        <div
          data-tour="print-go-mode"
          className={`flex items-stretch overflow-hidden rounded-md border text-[11px] font-mono uppercase tracking-wider ${
            productionMode
              ? 'border-amber-500/60 bg-amber-500/10'
              : 'border-sky-500/50 bg-sky-500/10'
          }`}
          title={
            productionMode
              ? 'PRODUCTION — software pre-loads ^MD; the physical photocell wired to the printer triggers each print.'
              : 'AUTO (TEST) — software fires Print Go (^PT) immediately after both sides ACK ^MD.'
          }
        >
          <button
            type="button"
            onClick={() => setProductionMode(false)}
            className={`flex items-center gap-1 px-2 py-1 transition-colors ${
              !productionMode
                ? 'bg-sky-500/30 text-sky-700 dark:text-sky-300'
                : 'text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Auto
          </button>
          <button
            type="button"
            onClick={() => setProductionMode(true)}
            className={`flex items-center gap-1 border-l px-2 py-1 transition-colors ${
              productionMode
                ? 'bg-amber-500/30 text-amber-700 dark:text-amber-300 border-amber-500/40'
                : 'text-muted-foreground hover:bg-muted/50 border-border'
            }`}
          >
            <Factory className="h-3.5 w-3.5" />
            Production
          </button>
        </div>

        {/* Pre-flight lives next to Start Run in ProductionRunBar — single entry point. */}

        <div className="ml-auto flex items-center gap-2">
          {/* Low-catalog warning settings */}
          <div
            className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px]"
            title="When remaining serials drop to or below this number, the operator gets a yellow banner + chirp so the next CSV can be staged before the line auto-stops."
          >
            <Label htmlFor="low-th" className="text-muted-foreground">
              Warn at
            </Label>
            <Input
              id="low-th"
              type="number"
              min={0}
              value={lowThreshold}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setLowThreshold(Number.isFinite(n) && n >= 0 ? n : 0);
              }}
              className="h-6 w-16 px-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => setAudioEnabled((v) => !v)}
              className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                audioEnabled
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              title={audioEnabled ? "Audio chirp ON — click to mute" : "Audio chirp MUTED — click to enable"}
              aria-label={audioEnabled ? "Mute low-catalog chirp" : "Enable low-catalog chirp"}
            >
              {audioEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            disabled={cat.consumedCount === 0 && cat.total === 0}
            title="Reset local lot counters (cloud ledger unaffected)"
          >
            <RotateCcw className="mr-1 h-4 w-4" /> Reset lot
          </Button>

          {!runActive && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPreflightOpen(true)}
                disabled={!autoCodeMode && cat.total === 0}
                title="Fire ghost cycles to verify timing and connectivity before the real run."
                data-tour="preflight-button"
              >
                <Activity className="mr-1 h-4 w-4" /> Pre-flight
              </Button>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        size="sm"
                        onClick={() => setStartOpen(true)}
                        disabled={(!autoCodeMode && cat.total === 0) || !liveMode}
                        className={(autoCodeMode || cat.total > 0) && liveMode ? "shadow-md ring-2 ring-primary/30" : ""}
                        data-tour="start-run-button"
                      >
                        <Play className="mr-1 h-4 w-4" /> Start production run
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {((!autoCodeMode && cat.total === 0) || !liveMode) && (
                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                      {!autoCodeMode && cat.total === 0
                        ? "Load a CSV catalog first so the printer has serials to fire."
                        : "Switch SYNTH → LIVE so codes actually print on the connected printer."}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>

      {/* On-deck queue — visible whenever there's at least one staged file or
          the operator changed the low-water mark. Stays out of the way otherwise. */}
      {queueState.items.length > 0 && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5" data-tour="catalog-queue">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 font-semibold text-primary">
              <Layers className="h-3.5 w-3.5" />
              On deck ({queueState.items.length})
              <span className="font-normal text-muted-foreground">
                · auto-promote at remaining ≤
              </span>
              <Input
                type="number"
                min={0}
                step={500}
                value={queueState.lowWater}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  catalogQueue.setLowWater(Number.isFinite(n) ? n : 0);
                }}
                className="h-6 w-20 px-1.5 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => catalogQueue.clear()}
            >
              <Trash2 className="mr-1 h-3 w-3" /> clear all
            </Button>
          </div>
          <ul className="space-y-1">
            {queueState.items.map((q, i) => (
              <li
                key={q.fingerprint}
                className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1 text-[11px]"
              >
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="font-mono text-muted-foreground">#{i + 1}</span>
                <span className="truncate font-medium" title={q.filename}>{q.filename}</span>
                <span className="font-mono text-muted-foreground">
                  {q.serials.length.toLocaleString()} serials
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  fp <span className="text-foreground">{q.fingerprint}</span>
                </span>
                <button
                  type="button"
                  onClick={() => catalogQueue.removeAt(i)}
                  className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label="Remove from queue"
                  title="Remove from queue"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {queueState.lastPromotion && (
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              Last promoted: <span className="font-medium text-foreground">{queueState.lastPromotion.filename}</span>
              {' '}· +{queueState.lastPromotion.appended.toLocaleString()} serials
              {queueState.lastPromotion.skipped > 0 && ` (${queueState.lastPromotion.skipped} skipped)`}
            </div>
          )}
        </div>
      )}

      <StartRunDialog open={startOpen} onOpenChange={setStartOpen} onStarted={() => { /* no-op */ }} />
      <PreflightDialog open={preflightOpen} onOpenChange={setPreflightOpen} />

      {/* Counter strip — large, glanceable. Hidden during an active production
          run because the same numbers (printed/missed/remaining) are already
          shown in the Production Run bar's chips and the HUD batch progress
          strip — duplicating them just eats vertical space. */}
      {!runActive && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-tour="catalog-counters">
          <Counter
            icon={<FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
            label="Catalog total"
            value={cat.total}
          />
          <Counter
            label="Remaining"
            value={remaining}
            tone={remaining === 0 && cat.total > 0 ? "warn" : "default"}
          />
          <Counter label="Printed" value={printed} tone="ok" />
          <Counter
            label="Miss-prints"
            value={cat.missCount}
            tone={cat.missCount > 0 ? "bad" : "default"}
            extra={
              cat.missCount > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => {
                    conveyorSim.stop();
                    conveyorSim.reset();
                    faultGuard.reset();
                    catalog.reset();
                  }}
                >
                  <Trash2 className="mr-1 h-3 w-3" /> reset
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Persistence status — small, reassures operator the audit trail is alive.
          Also hidden during an active run (ledger info is in the run bar header). */}
      {cat.fingerprint && !runActive && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono">
            ledger fp <span className="text-foreground">{cat.fingerprint}</span>
          </span>
          <span>·</span>
          <span>
            {cat.lastSavedAt
              ? `auto-saved ${formatRelativeTime(cat.lastSavedAt)}`
              : "awaiting first save…"}
          </span>
          <span>·</span>
          <span>persists across refresh / restart</span>
        </div>
      )}

      <CsvColumnPickerDialog
        open={pickerOpen}
        rawText={csvText}
        target={csvTarget}
        filename={csvFilename}
        onCancel={() => {
          setPickerOpen(false);
          setCsvText(null);
        }}
        onConfirm={handleConfirmCsv}
      />
      
    </div>
  );
}

function formatRelativeTime(epochMs: number): string {
  const sec = Math.max(0, Math.round((Date.now() - epochMs) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${(min / 60).toFixed(1)}h ago`;
}

function Counter({
  icon,
  label,
  value,
  tone = "default",
  extra,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  tone?: "default" | "ok" | "warn" | "bad";
  extra?: React.ReactNode;
}) {
  const toneClass =
    tone === "ok"
      ? "text-primary"
      : tone === "warn"
        ? "text-yellow-500 dark:text-yellow-400"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
        {extra && <span className="ml-auto">{extra}</span>}
      </div>
      <div className={`mt-0.5 font-mono text-2xl font-semibold ${toneClass}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
