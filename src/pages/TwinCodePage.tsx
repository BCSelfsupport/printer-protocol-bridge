import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, Square, Download, Upload, Trash2, RotateCcw, Link2 } from "lucide-react";
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

const PAGE_TITLE = "Twin Code — Profiler Harness (Phase 1a)";

export default function TwinCodePage() {
  const samples = useProfilerSamples();
  const [running, setRunning] = useState(false);
  const [config, setConfig] = useState(DEFAULT_GENERATOR_CONFIG);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bindOpen, setBindOpen] = useState(false);
  const pair = useTwinPair();
  const isBound = !!(pair.a && pair.b);

  // Set page title (SEO)
  useEffect(() => {
    const prev = document.title;
    document.title = PAGE_TITLE;
    return () => { document.title = prev; };
  }, []);

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-6 py-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Link>
          </Button>
          <div className="flex flex-col">
            <h1 className="text-base font-semibold">Twin Code</h1>
            <p className="text-[11px] text-muted-foreground">
              Bonded 2-printer profiler harness · Phase 1a (synthetic data)
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant={isBound ? "outline" : "default"}
              onClick={() => setBindOpen(true)}
              className="gap-1"
            >
              <Link2 className="mr-1 h-4 w-4" />
              {isBound ? "Twin pair bound" : "Bind two printers"}
              {isBound && (
                <Badge variant="secondary" className="ml-1 font-mono text-[10px]">
                  {pair.a?.ip} · {pair.b?.ip}
                </Badge>
              )}
            </Button>
            {!running ? (
              <Button size="sm" onClick={handleStart}>
                <Play className="mr-1 h-4 w-4" /> Start generator
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={handleStop}>
                <Square className="mr-1 h-4 w-4" /> Stop
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleClear}>
              <Trash2 className="mr-1 h-4 w-4" /> Clear
            </Button>
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

      <main className="mx-auto max-w-[1600px] space-y-4 px-6 py-6">
        {/* Top row: bottleneck callout + throughput */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
          <BottleneckCallout samples={samples} />
          <div className="lg:w-64">
            <ThroughputGauge samples={samples} />
          </div>
        </div>

        {/* Conveyor simulator (real ingress path: catalog → photocell → bonded print) */}
        <ConveyorPanel />

        {/* Generator controls */}
        <section className="rounded-md border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Synthetic generator</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfig(DEFAULT_GENERATOR_CONFIG);
                syntheticGenerator.configure(DEFAULT_GENERATOR_CONFIG);
              }}
            >
              <RotateCcw className="mr-1 h-3 w-3" /> Reset
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
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

        {/* Live waterfall */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">Live waterfall — last 50 bottles</h2>
          <WaterfallStrip samples={samples} />
        </section>

        {/* Rolling cycle + skew */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RollingCycleChart samples={samples} />
          <SkewScatter samples={samples} />
        </section>

        {/* Histograms */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">Stage histograms</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <StageHistogram samples={samples} stage="cycleMs"    label="Full cycle (ms)" />
            <StageHistogram samples={samples} stage="ingressMs"  label="Ingress (ms)" />
            <StageHistogram samples={samples} stage="dispatchMs" label="Dispatch (ms)" />
            <StageHistogram samples={samples} stage="wireAMs"    label="Wire A (ms)" />
            <StageHistogram samples={samples} stage="wireBMs"    label="Wire B (ms)" />
            <StageHistogram samples={samples} stage="skewMs"     label="A↔B skew (ms)" />
          </div>
        </section>

        {/* Heatmaps */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StageHeatmap samples={samples} stage="cycleMs" label="Full cycle" />
          <StageHeatmap samples={samples} stage="skewMs"  label="A↔B skew" />
        </section>

        <p className="pb-8 pt-4 text-center text-[11px] text-muted-foreground">
          Phase 1a · Profiler validated against synthetic data. Phase 1b will swap in a real Datajet/CSV ingress + dual <code>^FD</code> hot path.
        </p>
      </main>
    </div>
  );
}

function SliderControl({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
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
