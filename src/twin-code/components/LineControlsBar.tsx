/**
 * Twin Code — HUD Line Controls Bar.
 *
 * Compact one-row strip exposing the three knobs the operator needs to dial
 * throughput between test runs WITHOUT flipping into the Debug view:
 *   - Line speed (ft/min)
 *   - Pitch (mm, centre-to-centre)
 *   - BPM (computed; editable — recomputes ft/min from pitch)
 *   - Batch limit (optional stop after N items)
 *
 * Mirrors the conveyorSim config and stays in sync via a 200ms poll (cheap
 * and matches ConveyorPanel's existing pattern). Disabled while the conveyor
 * is running so we don't hot-swap pitch mid-stream.
 */

import { useEffect, useState } from "react";
import { Gauge, Play, Square, Zap, Factory, FlaskConical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  conveyorSim,
  computeBpm,
  ftPerMinFromBpm,
  DEFAULT_CONVEYOR_CONFIG,
} from "../conveyorSim";
import { useProductionMode } from "../printGoMode";

export function LineControlsBar() {
  const [cfg, setCfg] = useState(() => conveyorSim.getConfig() ?? DEFAULT_CONVEYOR_CONFIG);
  const [running, setRunning] = useState(() => conveyorSim.isRunning());
  const [productionMode, setProductionMode] = useProductionMode();

  // Keep in sync if Debug panel changes things or conveyor state flips.
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = conveyorSim.getConfig();
      const r = conveyorSim.isRunning();
      setCfg((prev) =>
        prev.ftPerMin === next.ftPerMin && prev.pitchMm === next.pitchMm ? prev : next
      );
      setRunning((prev) => (prev === r ? prev : r));
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const bpm = computeBpm(cfg.ftPerMin, cfg.pitchMm);

  const update = (patch: Partial<typeof cfg>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    conveyorSim.configure(patch);
  };

  const setBpm = (newBpm: number) => {
    if (!Number.isFinite(newBpm) || newBpm <= 0) return;
    const newFt = ftPerMinFromBpm(cfg.pitchMm, newBpm);
    update({ ftPerMin: newFt });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Gauge className="h-3.5 w-3.5" />
        Line conditions
      </div>

      <Field label="Line speed" suffix="ft/min" disabled={running}>
        <Input
          type="number"
          min={1}
          step={1}
          value={Math.round(cfg.ftPerMin)}
          onChange={(e) => update({ ftPerMin: Number(e.target.value) || 0 })}
          onFocus={(e) => e.currentTarget.select()}
          disabled={running}
          className="h-7 w-20 px-2 text-sm font-mono"
        />
      </Field>

      <Field label="Pitch" suffix="mm" disabled={running}>
        <Input
          type="number"
          min={1}
          step={0.5}
          value={cfg.pitchMm}
          onChange={(e) => update({ pitchMm: Number(e.target.value) || 0 })}
          onFocus={(e) => e.currentTarget.select()}
          disabled={running}
          className="h-7 w-20 px-2 text-sm font-mono"
        />
      </Field>

      <Field label="BPM" suffix="bpm" disabled={running} accent>
        <Input
          type="number"
          min={1}
          step={1}
          value={Math.round(bpm)}
          onChange={(e) => setBpm(Number(e.target.value) || 0)}
          onFocus={(e) => e.currentTarget.select()}
          disabled={running}
          className="h-7 w-20 px-2 text-sm font-mono"
        />
      </Field>



      <div className="flex items-center gap-1.5 ml-1">
        {running ? (
          <Button
            size="sm"
            variant="destructive"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => conveyorSim.stop()}
            title="Stop the bottle generator (Auto Print Go)"
          >
            <Square className="mr-1 h-3 w-3" />
            Stop Auto Print Go
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => conveyorSim.start()}
            title="Start the bottle generator — bottles cross the photocell at the configured BPM and trigger Print Go automatically"
          >
            <Play className="mr-1 h-3 w-3" />
            Start Auto Print Go
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={() => conveyorSim.manualFire()}
          title="Manually fire the photocell on the closest bottle"
        >
          <Zap className="mr-1 h-3 w-3" />
          Fire 1
        </Button>
      </div>

      {running && (
        <span className="text-[11px] text-emerald-500">
          ● auto-firing at {Math.round(bpm)} bpm
        </span>
      )}

      <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>
          Bottle Ø assumed{" "}
          <span className="font-mono text-foreground">
            {Math.max(0, cfg.pitchMm - 12.7).toFixed(1)} mm
          </span>{" "}
          (pitch − 0.5″ gap)
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  suffix,
  disabled,
  accent,
  icon,
  children,
}: {
  label: string;
  suffix: string;
  disabled?: boolean;
  accent?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex items-center gap-1.5 ${disabled ? "opacity-60" : ""}`}
      title={`${label} (${suffix})`}
    >
      <span
        className={`flex items-center gap-1 text-[10px] uppercase tracking-wider ${
          accent ? "text-primary font-semibold" : "text-muted-foreground"
        }`}
      >
        {icon}
        {label}
      </span>
      {children}
      <span className="text-[10px] text-muted-foreground">{suffix}</span>
    </label>
  );
}
