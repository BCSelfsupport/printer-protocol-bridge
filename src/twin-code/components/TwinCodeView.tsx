/**
 * TwinCodeView — the body of the TwinCode workspace, rendered both as the full
 * standalone page (`/twin-code`) and embedded inside the PrintersScreen right
 * pane when the operator selects a Bound Pair on a TwinCode-licensed system.
 *
 * Encapsulates all state (samples, generator config, view mode, bind dialog)
 * so the parent only decides whether to wrap it in a full-screen shell or a
 * bordered panel.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Upload,
  RotateCcw,
  Link2,
  Gauge,
  Wrench,
} from "lucide-react";
import { TwinPairBindDialog } from "@/twin-code/components/TwinPairBindDialog";
import { useTwinPair } from "@/twin-code/twinPairStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useProfilerSamples } from "@/twin-code/useProfilerSamples";
import { profilerBus } from "@/twin-code/profilerBus";
import { syntheticGenerator, DEFAULT_GENERATOR_CONFIG } from "@/twin-code/syntheticGenerator";
import { exportSessionCSV, exportSessionJSON, importSessionJSON } from "@/twin-code/sessionExport";
import { WaterfallStrip } from "@/twin-code/components/WaterfallStrip";
import { StageHistogram } from "@/twin-code/components/StageHistogram";
import { RollingCycleChart } from "@/twin-code/components/RollingCycleChart";
import { SkewScatter } from "@/twin-code/components/SkewScatter";
import { ThroughputGauge } from "@/twin-code/components/ThroughputGauge";
import { BottleneckCallout } from "@/twin-code/components/BottleneckCallout";
import { StageHeatmap } from "@/twin-code/components/StageHeatmap";
import { ConveyorPanel } from "@/twin-code/components/ConveyorPanel";
import { OperatorHUD } from "@/twin-code/components/OperatorHUD";
import { ProductionRunBar } from "@/twin-code/components/ProductionRunBar";
import { CatalogStripBar } from "@/twin-code/components/CatalogStripBar";
import { LineControlsBar } from "@/twin-code/components/LineControlsBar";
import { StatusRibbon } from "@/twin-code/components/StatusRibbon";
import { ShortcutHelpOverlay, useTwinCodeShortcuts } from "@/twin-code/components/ShortcutHelp";
import { useWhileAwayRecap } from "@/twin-code/useWhileAwayRecap";
import { TrainingProvider } from "@/twin-code/training/TrainingProvider";
import { TrainingOverlay } from "@/twin-code/training/TrainingOverlay";
import {
  TrainingLauncherButton,
  FirstLaunchBanner,
} from "@/twin-code/training/TrainingLauncher";

const VIEW_PREF_KEY = "twincode.view"; // "hud" | "debug"
const DEBUG_TAB_KEY = "twincode.debugTab"; // see DebugTab below
type DebugTab = "live" | "conveyor" | "generator" | "waterfall" | "distributions" | "heatmaps" | "tnt";

export interface TwinCodeViewProps {
  /**
   * When true, render in panel mode: no min-h-screen, no back-link, no max-w
   * gutter — assumes a parent border/scroll container (PrintersScreen right pane).
   */
  embedded?: boolean;
}

export function TwinCodeView({ embedded = false }: TwinCodeViewProps) {
  const samples = useProfilerSamples();
  const [running, setRunning] = useState(false);
  const [config, setConfig] = useState(DEFAULT_GENERATOR_CONFIG);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bindOpen, setBindOpen] = useState(false);
  const pair = useTwinPair();
  const isBound = !!(pair.a && pair.b);
  const [view, setView] = useState<"hud" | "debug">(() => {
    try {
      const v = localStorage.getItem(VIEW_PREF_KEY);
      return v === "debug" ? "debug" : "hud";
    } catch {
      return "hud";
    }
  });

  const [debugTab, setDebugTab] = useState<DebugTab>(() => {
    try {
      const v = localStorage.getItem(DEBUG_TAB_KEY) as DebugTab | null;
      const allowed: DebugTab[] = ["live", "conveyor", "generator", "waterfall", "distributions", "heatmaps", "tnt"];
      return v && allowed.includes(v) ? v : "live";
    } catch { return "live"; }
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_PREF_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => {
    try { localStorage.setItem(DEBUG_TAB_KEY, debugTab); } catch { /* ignore */ }
  }, [debugTab]);

  // Auto-start a session on mount so samples have a session to live in.
  useEffect(() => {
    if (!profilerBus.getSession()) profilerBus.startSession("Phase 1a — synthetic");
  }, []);

  const handleStart = () => {
    if (!profilerBus.getSession()) profilerBus.startSession("Phase 1a — synthetic");
    syntheticGenerator.start();
    setRunning(true);
  };
  const handleStop = () => {
    syntheticGenerator.stop();
    setRunning(false);
  };
  const handleClear = () => {
    syntheticGenerator.stop();
    profilerBus.startSession("Phase 1a — synthetic");
    setRunning(false);
  };
  const handleConfigChange = (patch: Partial<typeof config>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    syntheticGenerator.configure(patch);
  };
  const handleResetConfig = () => {
    setConfig(DEFAULT_GENERATOR_CONFIG);
    syntheticGenerator.configure(DEFAULT_GENERATOR_CONFIG);
  };
  const handleExportCSV = () => exportSessionCSV(samples, "twin-code");
  const handleExportJSON = () => {
    const session = profilerBus.endSession();
    if (session) exportSessionJSON(session);
  };
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      syntheticGenerator.stop();
      setRunning(false);
      const session = await importSessionJSON(file);
      profilerBus.loadReplay(session);
    } catch (err) {
      console.error("[twin-code] failed to load session", err);
    } finally {
      e.target.value = "";
    }
  };

  // ---- UX features (pure presentation) ----
  // While-away recap toast on tab refocus
  useWhileAwayRecap();
  // Keyboard shortcuts + help overlay (?, Space, H, D, 1-6)
  const debugTabIds: DebugTab[] = ["live", "conveyor", "generator", "waterfall", "distributions", "heatmaps", "tnt"];
  const { helpOpen, setHelpOpen } = useTwinCodeShortcuts({
    toggleGenerator: () => (running ? handleStop() : handleStart()),
    showHud: () => setView("hud"),
    showDebug: () => setView("debug"),
    pickDebugTab: (idx) => {
      const id = debugTabIds[idx];
      if (id) setDebugTab(id);
    },
    inDebug: view === "debug",
  });

  const shellClass = embedded
    ? "flex h-full flex-col bg-background text-foreground"
    : "min-h-screen bg-background text-foreground";

  const containerClass = embedded
    ? "flex items-center gap-3 px-4 py-2"
    : "mx-auto flex max-w-[1600px] items-center gap-4 px-6 py-3";

  const mainClass = embedded
    ? "flex-1 overflow-y-auto space-y-4 px-4 py-4"
    : "mx-auto max-w-[1600px] space-y-4 px-6 py-6";

  return (
    <TrainingProvider>
      <TrainingOverlay />
      <div className={shellClass}>
        <header className="border-b border-border bg-card">
          <div className={containerClass}>
            {!embedded && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/">
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Link>
              </Button>
            )}
            <div className="flex flex-col">
              <h1 className="flex items-baseline leading-none">
                <span className={`${embedded ? "text-lg" : "text-2xl"} font-bold italic text-blue-500`}>Twin</span>
                <span className={`${embedded ? "text-lg" : "text-2xl"} font-bold italic text-emerald-500`}>Code</span>
                <span className="ml-0.5 text-[10px] font-normal text-slate-500">™</span>
              </h1>
              {!embedded && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Bonded 2-printer profiler harness · Phase 1a (synthetic data)
                </p>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <TrainingLauncherButton />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-xs font-bold"
                onClick={() => setHelpOpen(true)}
                title="Keyboard shortcuts (press ?)"
                aria-label="Keyboard shortcuts"
              >
                ?
              </Button>
              {/* HUD / Debug view switcher */}
              <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
                <Button
                  size="sm"
                  variant={view === "hud" ? "default" : "ghost"}
                  className="h-7 gap-1 px-2.5 text-xs"
                  onClick={() => setView("hud")}
                  title="Operator HUD — shift-floor view"
                >
                  <Gauge className="h-3.5 w-3.5" /> HUD
                </Button>
                <Button
                  size="sm"
                  variant={view === "debug" ? "default" : "ghost"}
                  className="h-7 gap-1 px-2.5 text-xs"
                  onClick={() => setView("debug")}
                  title="Debug — full profiler & charts"
                >
                  <Wrench className="h-3.5 w-3.5" /> Debug
                </Button>
              </div>
              <Button
                size="sm"
                variant={isBound ? "outline" : "default"}
                onClick={() => setBindOpen(true)}
                className="gap-1"
                data-tour="bind-button"
              >
                <Link2 className="mr-1 h-4 w-4" />
                {isBound ? "Twin pair bound" : "Bind two printers"}
                {isBound && (
                  <Badge variant="secondary" className="ml-1 font-mono text-[10px]">
                    {pair.a?.ip} · {pair.b?.ip}
                  </Badge>
                )}
              </Button>
              {/* Synthetic generator buttons removed — real CSV upload + Auto Print Go
                  drives all production-run data now. */}
              <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={samples.length === 0}>
                <Download className="mr-1 h-4 w-4" /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={handleExportJSON} disabled={samples.length === 0}>
                <Download className="mr-1 h-4 w-4" /> JSON
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-1 h-4 w-4" /> Replay
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImport}
              />
            </div>
          </div>
        </header>

        {/* At-a-glance status ribbon — pinned beneath header in both views */}
        <StatusRibbon />

        <main className={mainClass}>
          <FirstLaunchBanner />
          {/* Production Run bar — visible in BOTH modes */}
          <ProductionRunBar />

          {view === "hud" && (
            <>
              <CatalogStripBar />
              {/* Line conditions live up top during bench-test phase.
                  Once real bottles + photocell drive the line this can be
                  removed — speed/pitch will come from the encoder. */}
              <LineControlsBar />
              <OperatorHUD />
            </>
          )}

          {view === "debug" && (
            <>
              {/* Always-visible diagnostic header — bottleneck callout + gauge.
                  These two answer the only question that matters at a glance:
                  "is the line healthy and where is it choking?" */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
                <BottleneckCallout samples={samples} />
                <div className="lg:w-64">
                  <ThroughputGauge samples={samples} />
                </div>
              </div>

              {/* Tabbed sub-views — one viewport-height panel at a time
                  instead of a single mega-scroll dump. */}
              <div className="rounded-md border border-border bg-card">
                <div role="tablist" className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/20 px-2">
                  {([
                    { id: "live", label: "Live" },
                    { id: "conveyor", label: "Conveyor" },
                    { id: "generator", label: "Generator" },
                    { id: "waterfall", label: "Waterfall" },
                    { id: "distributions", label: "Distributions" },
                    { id: "heatmaps", label: "Heatmaps" },
                    { id: "tnt", label: "TnT Uplink" },
                  ] as { id: DebugTab; label: string }[]).map((t) => {
                    const active = debugTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setDebugTab(t.id)}
                        className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                          active
                            ? "border-b-2 border-primary text-primary"
                            : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                <div className="p-4">
                  {debugTab === "live" && (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <RollingCycleChart samples={samples} />
                      <SkewScatter samples={samples} />
                    </div>
                  )}

                  {debugTab === "conveyor" && <ConveyorPanel />}

                  {debugTab === "generator" && (
                    <section>
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Synthetic generator</h3>
                        <Button size="sm" variant="ghost" onClick={handleResetConfig}>
                          <RotateCcw className="mr-1 h-3 w-3" /> Reset
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <SliderControl
                          label={`Rate: ${config.ratePerMin} bpm`}
                          value={config.ratePerMin}
                          min={20} max={400} step={10}
                          onChange={(v) => handleConfigChange({ ratePerMin: v })}
                        />
                        <SliderControl
                          label={`Wire A mean: ${config.wireAMean.toFixed(1)} ms`}
                          value={config.wireAMean}
                          min={1} max={40} step={0.5}
                          onChange={(v) => handleConfigChange({ wireAMean: v })}
                        />
                        <SliderControl
                          label={`Wire B mean: ${config.wireBMean.toFixed(1)} ms`}
                          value={config.wireBMean}
                          min={1} max={40} step={0.5}
                          onChange={(v) => handleConfigChange({ wireBMean: v })}
                        />
                        <SliderControl
                          label={`Jitter: ${(config.jitter * 100).toFixed(0)}%`}
                          value={config.jitter * 100}
                          min={0} max={80} step={2}
                          onChange={(v) => handleConfigChange({ jitter: v / 100 })}
                        />
                        <SliderControl
                          label={`Stall rate: ${(config.stallRate * 100).toFixed(1)}%`}
                          value={config.stallRate * 100}
                          min={0} max={10} step={0.1}
                          onChange={(v) => handleConfigChange({ stallRate: v / 100 })}
                        />
                        <SliderControl
                          label={`Miss-print rate: ${(config.missRate * 100).toFixed(2)}%`}
                          value={config.missRate * 100}
                          min={0} max={5} step={0.05}
                          onChange={(v) => handleConfigChange({ missRate: v / 100 })}
                        />
                      </div>
                    </section>
                  )}

                  {debugTab === "waterfall" && (
                    <section>
                      <h2 className="mb-2 text-sm font-semibold">Live waterfall — last 50 bottles</h2>
                      <WaterfallStrip samples={samples} />
                    </section>
                  )}

                  {debugTab === "distributions" && (
                    <section>
                      <h2 className="mb-2 text-sm font-semibold">Stage histograms</h2>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <StageHistogram samples={samples} stage="cycleMs" label="Full cycle (ms)" />
                        <StageHistogram samples={samples} stage="wireAMs" label="Wire A (ms)" />
                        <StageHistogram samples={samples} stage="wireBMs" label="Wire B (ms)" />
                        <StageHistogram samples={samples} stage="skewMs" label="A↔B skew (ms)" />
                        <StageHistogram samples={samples} stage="ingressMs" label="Ingress (ms)" />
                        <StageHistogram samples={samples} stage="dispatchMs" label="Dispatch (ms)" />
                      </div>
                    </section>
                  )}

                  {debugTab === "heatmaps" && (
                    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <StageHeatmap samples={samples} stage="cycleMs" label="Full cycle" />
                      <StageHeatmap samples={samples} stage="skewMs" label="A↔B skew" />
                    </section>
                  )}
                </div>
              </div>

              {!embedded && (
                <p className="pb-8 pt-4 text-center text-[11px] text-muted-foreground">
                  Phase 1a · Profiler validated against synthetic data. Phase 1b will swap in a real Datajet/CSV ingress + dual <code>^FD</code> hot path.
                </p>
              )}
            </>
          )}
        </main>

        <TwinPairBindDialog open={bindOpen} onOpenChange={setBindOpen} />
        <ShortcutHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    </TrainingProvider>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
