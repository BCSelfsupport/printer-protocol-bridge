import { useEffect, useRef, useState } from "react";
import { Upload, Play, Square, RotateCcw, Zap, FileSpreadsheet, Trash2, Radio, Loader2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { ConveyorView } from "./ConveyorView";
import { CsvColumnPickerDialog } from "./CsvColumnPickerDialog";
import { LedgerResumeBanner } from "./LedgerResumeBanner";
import { conveyorSim, computeBpm, pitchFromBpm, ftPerMinFromBpm, DEFAULT_CONVEYOR_CONFIG } from "../conveyorSim";
import { catalog } from "../catalog";
import { useCatalog } from "../useCatalog";
import { useTwinPair } from "../twinPairStore";
import { twinDispatcher, type TwinDryRunResult } from "../twinDispatcher";
import { usePrinterStorage } from "@/hooks/usePrinterStorage";

export function ConveyorPanel() {
  const catalogState = useCatalog();
  const pair = useTwinPair();
  const { printers } = usePrinterStorage();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [dryBusy, setDryBusy] = useState(false);
  const [lastDryRun, setLastDryRun] = useState<TwinDryRunResult | null>(null);

  // Mirror the conveyor config locally for the controls (simple & responsive).
  const [cfg, setCfg] = useState(DEFAULT_CONVEYOR_CONFIG);
  const bpm = computeBpm(cfg.ftPerMin, cfg.pitchMm);

  const updateCfg = (patch: Partial<typeof cfg>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    conveyorSim.configure(patch);
  };

  /** Edit one of {ftPerMin, pitch, bpm} → recompute the other two. */
  const setSpeed = (mode: "ft" | "pitch" | "bpm", value: number) => {
    if (mode === "ft") {
      updateCfg({ ftPerMin: value });
    } else if (mode === "pitch") {
      updateCfg({ pitchMm: value });
    } else {
      // bpm change → keep current pitch, recompute ftPerMin
      const newFt = ftPerMinFromBpm(cfg.pitchMm, value);
      updateCfg({ ftPerMin: newFt });
    }
  };

  const pairBound = !!(pair.a && pair.b);

  // ---- LIVE bonded dispatch wiring ----
  const enableLive = async () => {
    if (!pairBound) {
      toast({ title: 'Bind a twin pair first', variant: 'destructive' });
      return;
    }
    setLiveBusy(true);
    const res = await twinDispatcher.bind(pair, printers);
    setLiveBusy(false);
    if (!res.ok) {
      toast({ title: 'Could not enter LIVE mode', description: res.error, variant: 'destructive' });
      return;
    }
    conveyorSim.setLiveDispatcher((serial) => twinDispatcher.dispatch(serial));
    setLiveMode(true);
    toast({ title: 'LIVE bonded mode active', description: `Printer A id=${res.aId}, B id=${res.bId}` });
  };

  const disableLive = async () => {
    setLiveBusy(true);
    conveyorSim.setLiveDispatcher(null);
    await twinDispatcher.unbind();
    setLiveBusy(false);
    setLiveMode(false);
    toast({ title: 'Reverted to synthetic mode' });
  };

  // ---- Pre-flight dry run: 5 real dispatches, no conveyor ----
  const runDryRun = async () => {
    setDryBusy(true);
    setLastDryRun(null);
    // Use the next catalog serial if available so the printers physically print
    // a real (scannable) code; otherwise the dispatcher synthesises DRYRUNxxxx.
    const seed = catalog.peek() ?? undefined;
    const result = await twinDispatcher.dryRun(5, seed);
    setLastDryRun(result);
    setDryBusy(false);

    if (result.ok) {
      const a = result.aStats;
      const b = result.bStats;
      const skew = result.skewStats;
      toast({
        title: `Dry run passed (${result.passed}/${result.count})`,
        description:
          `A mean ${a?.mean.toFixed(1)}ms · B mean ${b?.mean.toFixed(1)}ms · ` +
          `skew mean ${skew?.mean.toFixed(1)}ms (max ${skew?.max.toFixed(1)})`,
      });
    } else {
      toast({
        title: `Dry run failed (${result.failed}/${result.count})`,
        description: result.reason || 'See per-side reasons',
        variant: 'destructive',
      });
    }
  };

  // Tear down on unmount
  useEffect(() => {
    return () => {
      if (twinDispatcher.isBound()) {
        conveyorSim.setLiveDispatcher(null);
        twinDispatcher.unbind().catch(() => {});
      }
    };
  }, []);

  const handleStart = () => {
    if (catalogState.total === 0 && !confirm("No catalog loaded — every bottle will be a miss-print. Start anyway?")) return;
    conveyorSim.start();
    setRunning(true);
  };
  const handleStop = () => {
    conveyorSim.stop();
    setRunning(false);
  };
  const handleReset = () => {
    conveyorSim.reset();
    catalog.reset();
    setRunning(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setPickerOpen(true);
    e.target.value = "";
  };

  const handleConfirmCsv = (serials: string[]) => {
    const { matchesPersisted } = catalog.load(serials);
    setPickerOpen(false);
    setCsvText(null);
    if (matchesPersisted) {
      toast({
        title: 'Same catalog detected',
        description: 'Use the resume banner to pick up where the previous run left off.',
      });
    }
  };

  return (
    <section className="space-y-3">
      <LedgerResumeBanner />
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Conveyor simulator</h2>
        <span className="text-[11px] text-muted-foreground">
          Photocell-triggered bonded twin printer station
        </span>

        {/* LIVE / SYNTHETIC mode toggle */}
        <div
          className={`ml-2 flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] ${
            liveMode
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border bg-muted/40 text-muted-foreground'
          }`}
          title={pairBound ? 'Toggle real bonded dispatch via 1-1 mode' : 'Bind a twin pair to enable LIVE mode'}
        >
          {liveBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Radio className={`h-3.5 w-3.5 ${liveMode ? 'text-primary' : ''}`} />
          )}
          <span className="font-mono uppercase tracking-wider">
            {liveMode ? 'LIVE' : 'SYNTH'}
          </span>
          <Switch
            checked={liveMode}
            disabled={liveBusy || !pairBound || running}
            onCheckedChange={(v) => (v ? enableLive() : disableLive())}
          />
        </div>

        {/* Pre-flight dry run — only meaningful when LIVE is engaged + conveyor stopped */}
        <Button
          size="sm"
          variant="outline"
          onClick={runDryRun}
          disabled={!liveMode || running || dryBusy || liveBusy}
          title="Fire 5 real bonded dispatches and report timings — use BEFORE starting the conveyor"
        >
          {dryBusy ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <FlaskConical className="mr-1 h-4 w-4" />
          )}
          Dry run ×5
        </Button>

        {/* Last dry-run result chip */}
        {lastDryRun && (
          <div
            className={`rounded-md border px-2 py-1 text-[11px] font-mono ${
              lastDryRun.ok
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-destructive/40 bg-destructive/10 text-destructive'
            }`}
            title={lastDryRun.reason || 'All shots completed cleanly'}
          >
            {lastDryRun.ok
              ? `✓ ${lastDryRun.passed}/${lastDryRun.count}` +
                (lastDryRun.cycleStats
                  ? ` · cycle ${lastDryRun.cycleStats.mean.toFixed(0)}ms`
                  : '') +
                (lastDryRun.skewStats
                  ? ` · skew ${lastDryRun.skewStats.mean.toFixed(1)}ms`
                  : '')
              : `✗ ${lastDryRun.failed}/${lastDryRun.count} failed`}
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFile}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> Load CSV catalog
          </Button>
          {!running ? (
            <Button size="sm" onClick={handleStart}>
              <Play className="mr-1 h-4 w-4" /> Start conveyor
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={handleStop}>
              <Square className="mr-1 h-4 w-4" /> Stop
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => conveyorSim.manualFire()} disabled={!running}>
            <Zap className="mr-1 h-4 w-4" /> Fire photocell
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="mr-1 h-4 w-4" /> Reset
          </Button>
        </div>
      </div>

      {/* Catalog + counters */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Counter
          icon={<FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
          label="Catalog total"
          value={catalogState.total}
        />
        <Counter
          label="Remaining"
          value={catalogState.total - catalogState.nextIndex}
          tone={catalogState.total - catalogState.nextIndex === 0 && catalogState.total > 0 ? "warn" : "default"}
        />
        <Counter
          label="Printed"
          value={catalogState.consumedCount - catalogState.missCount}
          tone="ok"
        />
        <Counter
          label="Miss-prints"
          value={catalogState.missCount}
          tone={catalogState.missCount > 0 ? "bad" : "default"}
          extra={
            catalogState.missCount > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px]"
                onClick={() => { catalog.reset(); }}
              >
                <Trash2 className="mr-1 h-3 w-3" /> reset
              </Button>
            ) : undefined
          }
        />
      </div>

      {/* Speed controls — all three editable, cross-recomputed */}
      <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-3">
        <SpeedControl
          label="Line speed (ft/min)"
          value={cfg.ftPerMin}
          min={20} max={500} step={5}
          onChange={(v) => setSpeed("ft", v)}
          display={`${cfg.ftPerMin.toFixed(0)} ft/min`}
        />
        <SpeedControl
          label="Pitch (mm)"
          value={cfg.pitchMm}
          min={20} max={400} step={1}
          onChange={(v) => setSpeed("pitch", v)}
          display={`${cfg.pitchMm.toFixed(0)} mm`}
        />
        <SpeedControl
          label="Bottles per minute (computed)"
          value={bpm}
          min={5} max={1500} step={1}
          onChange={(v) => setSpeed("bpm", v)}
          display={`${bpm.toFixed(0)} bpm`}
        />
        <div className="space-y-1.5 md:col-span-1">
          <Label className="text-xs text-muted-foreground">Bottle Ø (mm)</Label>
          <Input
            type="number"
            value={cfg.bottleDiameterMm}
            min={10} max={200}
            onChange={(e) => updateCfg({ bottleDiameterMm: Number(e.target.value) })}
            className="h-8 text-xs"
          />
        </div>
        <SpeedControl
          label="Wire A mean (ms)"
          value={cfg.wireAMean}
          min={1} max={40} step={0.5}
          onChange={(v) => updateCfg({ wireAMean: v })}
          display={`${cfg.wireAMean.toFixed(1)} ms`}
        />
        <SpeedControl
          label="Wire B mean (ms)"
          value={cfg.wireBMean}
          min={1} max={40} step={0.5}
          onChange={(v) => updateCfg({ wireBMean: v })}
          display={`${cfg.wireBMean.toFixed(1)} ms`}
        />
      </div>

      <ConveyorView />

      <CsvColumnPickerDialog
        open={pickerOpen}
        rawText={csvText}
        onCancel={() => { setPickerOpen(false); setCsvText(null); }}
        onConfirm={handleConfirmCsv}
      />
    </section>
  );
}

function Counter({
  icon, label, value, tone = "default", extra,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  tone?: "default" | "ok" | "warn" | "bad";
  extra?: React.ReactNode;
}) {
  const toneClass =
    tone === "ok"   ? "text-primary" :
    tone === "warn" ? "text-yellow-500 dark:text-yellow-400" :
    tone === "bad"  ? "text-destructive" :
    "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
        {extra && <span className="ml-auto">{extra}</span>}
      </div>
      <div className={`mt-0.5 font-mono text-xl font-semibold ${toneClass}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function SpeedControl({
  label, value, min, max, step, onChange, display,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; display: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="font-mono text-xs text-foreground">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min} max={max} step={step}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
