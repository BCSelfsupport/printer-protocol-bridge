/**
 * Twin Code — At-a-Glance Status Ribbon.
 *
 * A thin, sticky strip pinned beneath the page header. Visible in BOTH HUD
 * and Debug modes. Operators standing 6ft away can read the line health at
 * a glance without entering any specific view.
 *
 * Pure presentation — derives everything from existing hooks; no side effects.
 */

import { useEffect, useState } from "react";
import { Activity, Cpu, Target, Clock } from "lucide-react";
import { useConveyor } from "../useConveyor";
import { useCatalog } from "../useCatalog";
import { useTwinPair } from "../twinPairStore";
import { useLiveMetrics } from "../useLiveMetrics";
import { useLiveRunSummary, useProductionRun } from "../useProductionRun";
import { twinDispatcher } from "../twinDispatcher";
import { fmtInt, fmtRate, fmtEta, fmtDuration } from "../format";

type Tone = "ok" | "warn" | "bad" | "muted";

function toneClasses(tone: Tone) {
  switch (tone) {
    case "ok": return "bg-primary shadow-[0_0_8px_hsl(var(--primary))]";
    case "warn": return "bg-amber-500 shadow-[0_0_8px_rgb(245_158_11_/_0.7)]";
    case "bad": return "bg-destructive shadow-[0_0_8px_hsl(var(--destructive))]";
    default: return "bg-muted-foreground/40";
  }
}

export function StatusRibbon() {
  const conv = useConveyor();
  const cat = useCatalog();
  const pair = useTwinPair();
  const live = useLiveMetrics();
  const run = useProductionRun();
  const summary = useLiveRunSummary();

  // Tick once per second so elapsed/ETA stay live.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!run.active) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [run.active]);

  const isLive = twinDispatcher.isBound();
  const pairBound = !!(pair.a && pair.b);
  const bpm = Math.round(live.hasLiveData ? live.bpm : conv.bpm);
  const lineToneA: Tone = !pairBound ? "muted" : isLive ? "ok" : "warn";
  const lineToneB: Tone = lineToneA;

  // Run progress
  const target = run.active?.targetCount || cat.total;
  const done = summary ? summary.printed + summary.missed : 0;
  const remaining = Math.max(0, target - done);
  const eta = run.active && bpm > 0 ? fmtEta(remaining, bpm) : "—";
  const elapsed = run.active ? fmtDuration((Date.now() - run.active.startedAt) / 1000) : null;

  return (
    <div
      className="sticky top-0 z-40 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border bg-background/85 px-4 py-1.5 text-[11px] font-mono backdrop-blur supports-[backdrop-filter]:bg-background/60"
      aria-label="At-a-glance status ribbon"
    >
      {/* Line A */}
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${toneClasses(lineToneA)}`} />
        <span className="font-bold text-foreground">A</span>
        <span className="text-muted-foreground">
          {pairBound ? (isLive ? "LIVE" : "SYNTH") : "—"}
        </span>
      </div>
      {/* Line B */}
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${toneClasses(lineToneB)}`} />
        <span className="font-bold text-foreground">B</span>
        <span className="text-muted-foreground">
          {pairBound ? (isLive ? "LIVE" : "SYNTH") : "—"}
        </span>
      </div>

      <Divider />

      {/* Throughput */}
      <div className="flex items-center gap-1.5" title="Bottles per minute">
        <Activity className="h-3 w-3 text-muted-foreground" />
        <span className="font-bold tabular-nums text-foreground">{bpm}</span>
        <span className="text-muted-foreground">bpm</span>
      </div>

      <Divider />

      {/* Run progress */}
      {run.active && summary ? (
        <>
          <div className="flex items-center gap-1.5" title="Run progress">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="tabular-nums text-foreground">
              <span className="font-bold">{fmtInt(done)}</span>
              <span className="text-muted-foreground"> / {fmtInt(target)}</span>
            </span>
            {summary.missed > 0 && (
              <span className="text-destructive">· {fmtInt(summary.missed)} miss</span>
            )}
          </div>
          <div className="flex items-center gap-1.5" title="Elapsed · ETA to completion">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="tabular-nums text-muted-foreground">
              {elapsed} · ETA <span className="text-foreground">{eta}</span>
            </span>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-1.5 italic text-muted-foreground">
          <Cpu className="h-3 w-3" />
          <span>idle — no production run active</span>
        </div>
      )}

      {/* Right-aligned ledger fp */}
      <div className="ml-auto flex items-center gap-2 text-muted-foreground">
        {cat.total > 0 && (
          <>
            <span>catalog {fmtInt(cat.total)}</span>
            <span className="opacity-60">· fp {cat.fingerprint ?? "—"}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <span className="hidden h-3 w-px bg-border md:inline-block" aria-hidden />;
}
