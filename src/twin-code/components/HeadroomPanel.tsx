/**
 * Twin Code — Throughput Headroom panel.
 *
 * Single-row banner that translates the abstract cycle-p95 number into the
 * one question Bruce actually cares about: "given how this line is timing
 * right now, what BPM ceiling does it impose, and how much room do we have
 * before that ceiling matters?"
 *
 * Renders three big numbers (current BPM, ceiling BPM, headroom %), a
 * one-liner verdict, and a tiny reference table of cycle-time budgets at
 * common target BPMs so the conversation can pivot from "is 224ms good?"
 * to "what BPM do you actually need?".
 *
 * Pure read-side: subscribes to profilerBus + liveMetrics, no side effects.
 */

import { useMemo } from "react";
import { ArrowUpRight, ArrowDownRight, Gauge, Info } from "lucide-react";
import { useProfilerSamples } from "../useProfilerSamples";
import { useLiveMetrics } from "../useLiveMetrics";
import { computeHeadroom, cycleBudgetForBpm } from "../throughputHeadroom";

const REFERENCE_BPMS = [50, 100, 200, 300, 500];

export function HeadroomPanel({ compact = false }: { compact?: boolean }) {
  const samples = useProfilerSamples();
  const live = useLiveMetrics();

  const headroom = useMemo(
    () => computeHeadroom(samples, live.bpm),
    [samples, live.bpm],
  );

  const budgets = useMemo(
    () => REFERENCE_BPMS.map((bpm) => ({ bpm, ms: cycleBudgetForBpm(bpm) })),
    [],
  );

  const tone =
    headroom.verdict === "ok"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : headroom.verdict === "tight"
        ? "border-amber-500/40 bg-amber-500/5"
        : headroom.verdict === "over"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-muted/30";

  const accent =
    headroom.verdict === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : headroom.verdict === "tight"
        ? "text-amber-600 dark:text-amber-400"
        : headroom.verdict === "over"
          ? "text-destructive"
          : "text-muted-foreground";

  const Arrow =
    headroom.verdict === "over" ? ArrowDownRight : ArrowUpRight;

  if (headroom.verdict === "no-data") {
    return (
      <div className={`flex items-center gap-2 rounded-md border px-4 py-2 text-xs text-muted-foreground ${tone}`}>
        <Gauge className="h-4 w-4" />
        <span>Throughput headroom — no printed cycles yet. Start a run to populate.</span>
      </div>
    );
  }

  return (
    <div className={`rounded-md border px-4 py-3 ${tone}`}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <Gauge className={`h-4 w-4 ${accent}`} />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Throughput headroom
          </span>
        </div>

        <BigStat
          label="cycle p95"
          value={`${headroom.cycleP95Ms.toFixed(0)}ms`}
          sub={`n=${headroom.sampleCount}`}
        />

        <BigStat
          label="ceiling"
          value={`${Math.round(headroom.maxSustainableBpm)} BPM`}
          sub={`@ ${headroom.safetyFactor}× safety`}
          accent={accent}
        />

        <BigStat
          label="line BPM"
          value={`${Math.round(headroom.currentBpm)}`}
          sub="rolling 60s"
        />

        <div className="flex items-center gap-1">
          <Arrow className={`h-5 w-5 ${accent}`} />
          <span className={`font-mono text-2xl font-bold tabular-nums ${accent}`}>
            {headroom.headroomPct >= 0 ? "+" : ""}
            {headroom.headroomPct.toFixed(0)}%
          </span>
          <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            headroom
          </span>
        </div>
      </div>

      {!compact && (
        <>
          <p className="mt-2 text-xs text-foreground/80">{headroom.oneLiner}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 pt-2 text-[10px] font-mono text-muted-foreground">
            <span className="inline-flex items-center gap-1 uppercase tracking-wider">
              <Info className="h-3 w-3" /> cycle budgets
            </span>
            {budgets.map((b) => (
              <span key={b.bpm} className="tabular-nums">
                {b.bpm} BPM ≤ <span className="text-foreground">{b.ms.toFixed(0)}ms</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BigStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-mono text-xl font-bold tabular-nums ${accent ?? "text-foreground"}`}>
        {value}
      </span>
      {sub && <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70">{sub}</span>}
    </div>
  );
}
