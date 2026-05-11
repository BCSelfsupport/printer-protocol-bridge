/**
 * Twin Code — HUD Line Controls Bar.
 *
 * Two modes (driven by the shared `printGoMode` toggle):
 *
 *  AUTO (test):       Operator dials line speed / pitch / BPM. The conveyor
 *                     sim auto-fires the photocell at that target rate so
 *                     prints happen without external hardware.
 *
 *  PRODUCTION:        The real photocell wired to the printer triggers
 *                     prints. The bar STOPS asking for target inputs and
 *                     instead displays LIVE measurements derived from the
 *                     stream of completed prints (rolling BPM + interval),
 *                     so the operator can see what the actual line is doing.
 *
 * Live BPM is derived from the last N successful samples on `profilerBus`,
 * using the wall-clock delta between sample arrivals (Date.now at push
 * time) — t0/t4 are sim-relative and reset between sessions, so we can't
 * use them as wall-clock reference.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Gauge, Play, Square, Zap, Radio } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  conveyorSim,
  computeBpm,
  ftPerMinFromBpm,
  DEFAULT_CONVEYOR_CONFIG,
} from "../conveyorSim";
import { useProductionMode } from "../printGoMode";
import { profilerBus } from "../profilerBus";

const FT_TO_MM = 304.8;
/** Window size for rolling-BPM in production. Big enough to smooth out
 *  manual hand-feeds, small enough to react in <10s on a slow line. */
const LIVE_WINDOW = 12;
/** If no print arrives within this many ms, show the rate as stale. */
const STALE_AFTER_MS = 8000;

export function LineControlsBar() {
  const [cfg, setCfg] = useState(() => conveyorSim.getConfig() ?? DEFAULT_CONVEYOR_CONFIG);
  const [running, setRunning] = useState(() => conveyorSim.isRunning());
  const [productionMode] = useProductionMode();

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

  // ---- Live photocell-derived metrics (Production mode) ----
  // Track wall-clock arrival time of each successful print. profilerBus only
  // gives us sim-relative timestamps, so we record Date.now() ourselves on
  // each notification and diff between consecutive arrivals.
  const tripsRef = useRef<number[]>([]);
  const lastSeenIndexRef = useRef<number>(-1);
  const [, force] = useState(0);
  useEffect(() => {
    return profilerBus.subscribe((samples) => {
      const now = Date.now();
      let appended = false;
      for (let i = samples.length - 1; i >= 0; i--) {
        const s = samples[i];
        if (s.index <= lastSeenIndexRef.current) break;
        if (s.outcome === "printed") {
          // Newest-first iteration; we'll reverse on push so order stays chronological.
          tripsRef.current.push(now);
          appended = true;
        }
      }
      if (samples.length > 0) lastSeenIndexRef.current = samples[samples.length - 1].index;
      // Cap the window
      if (tripsRef.current.length > LIVE_WINDOW * 2) {
        tripsRef.current.splice(0, tripsRef.current.length - LIVE_WINDOW * 2);
      }
      if (appended) force((n) => n + 1);
    });
  }, []);

  // Re-render once a second so "stale" / "awaiting first print" flips on its own.
  useEffect(() => {
    if (!productionMode) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [productionMode]);

  const live = useMemo(() => {
    const trips = tripsRef.current;
    if (trips.length < 2) return { bpm: 0, intervalMs: 0, count: trips.length, stale: true };
    const window = trips.slice(-LIVE_WINDOW);
    const intervals: number[] = [];
    for (let i = 1; i < window.length; i++) intervals.push(window[i] - window[i - 1]);
    const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = meanInterval > 0 ? 60_000 / meanInterval : 0;
    const stale = Date.now() - window[window.length - 1] > STALE_AFTER_MS;
    return { bpm, intervalMs: meanInterval, count: trips.length, stale };
    // tripsRef is mutable; force-render bumps trigger recompute via state dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripsRef.current.length, productionMode]);

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

  // Estimate live ft/min from measured BPM + the last-known pitch (operator's
  // configured bottle pitch is still the only sane way to derive belt speed
  // from a photocell-only signal — no encoder yet).
  const liveFtPerMin = live.bpm > 0 && cfg.pitchMm > 0
    ? (live.bpm * cfg.pitchMm * 60) / (FT_TO_MM * 60)
    : 0;

  return (
    <div data-tour="line-conditions" className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {productionMode ? <Radio className="h-3.5 w-3.5 text-amber-500" /> : <Gauge className="h-3.5 w-3.5" />}
        {productionMode ? 'Live photocell' : 'Line conditions'}
      </div>

      {productionMode ? (
        <>
          {/* Read-only LIVE measurements derived from real photocell trips. */}
          <ReadOnlyField label="Line speed" suffix="ft/min" value={liveFtPerMin > 0 ? liveFtPerMin.toFixed(0) : '—'} />
          <ReadOnlyField label="Pitch" suffix="mm" value={cfg.pitchMm.toFixed(0)} hint="(operator-set)" />
          <ReadOnlyField
            label="BPM"
            suffix="bpm"
            value={live.bpm > 0 ? live.bpm.toFixed(0) : '—'}
            accent
            stale={live.stale && live.count > 0}
          />
          <ReadOnlyField
            label="Interval"
            suffix="ms"
            value={live.intervalMs > 0 ? live.intervalMs.toFixed(0) : '—'}
          />
          <span className="text-[10px] text-muted-foreground">
            n={Math.min(live.count, LIVE_WINDOW)} trips
          </span>
        </>
      ) : (
        <>
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
        </>
      )}

      {/* Print Go source toggle (Auto/Production) lives next to the LIVE
          toggle in CatalogStripBar so it's in the operator's primary sightline. */}

      {/* Simulator-only controls. In PRODUCTION mode the real photocell drives
          every print and the operator starts a run via "Start production run"
          in the catalog strip — so we hide these to avoid duplicate buttons. */}
      {!productionMode && (
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
      )}

      {running && !productionMode && (
        <span className="text-[11px] text-emerald-500">
          ● auto-firing at {Math.round(bpm)} bpm
        </span>
      )}
      {productionMode && (
        <span className={`text-[11px] ${live.bpm > 0 && !live.stale ? 'text-emerald-500' : 'text-amber-500'}`}>
          {live.bpm > 0 && !live.stale
            ? `● live ${live.bpm.toFixed(0)} bpm from photocell`
            : live.count === 0
              ? '● awaiting first photocell trip'
              : '● photocell idle'}
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

function ReadOnlyField({
  label, suffix, value, accent, stale, hint,
}: {
  label: string; suffix: string; value: string;
  accent?: boolean; stale?: boolean; hint?: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      title={hint ? `${label} (${suffix}) ${hint}` : `${label} (${suffix})`}
    >
      <span
        className={`text-[10px] uppercase tracking-wider ${
          accent ? "text-primary font-semibold" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
      <span
        className={`inline-flex h-7 min-w-[3.5rem] items-center justify-end rounded-md border bg-muted/40 px-2 font-mono text-sm ${
          stale ? 'border-amber-500/50 text-amber-500' : accent ? 'border-primary/40 text-primary' : 'border-border text-foreground'
        }`}
      >
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground">{suffix}</span>
      {hint && <span className="text-[9px] text-muted-foreground/70">{hint}</span>}
    </div>
  );
}
