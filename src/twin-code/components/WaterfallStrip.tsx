import { useMemo } from "react";
import type { BottleSample } from "../types";

interface Props {
  samples: BottleSample[];
  /** How many recent bottles to render. */
  count?: number;
}

const STAGE_COLORS = {
  ingress: "hsl(var(--chart-1))",
  dispatch: "hsl(var(--chart-2))",
  wireA: "hsl(var(--chart-3))",
  wireB: "hsl(var(--chart-4))",
} as const;

/**
 * Live waterfall — last N bottles as horizontal stacked bars.
 * Canvas-rendered for smooth 60Hz updates at 200+ bottles/min.
 */
export function WaterfallStrip({ samples, count = 50 }: Props) {
  const recent = useMemo(() => samples.slice(-count), [samples, count]);
  const maxCycle = useMemo(
    () => Math.max(1, ...recent.map((s) => s.cycleMs)),
    [recent],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <LegendDot color={STAGE_COLORS.ingress} label="Ingress" />
        <LegendDot color={STAGE_COLORS.dispatch} label="Dispatch" />
        <LegendDot color={STAGE_COLORS.wireA} label="Wire A" />
        <LegendDot color={STAGE_COLORS.wireB} label="Wire B" />
        <span className="ml-auto">last {recent.length} bottles · max {maxCycle.toFixed(1)}ms</span>
      </div>
      <div className="space-y-px rounded-md border border-border bg-card p-2">
        {recent.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No samples yet — start the generator to see live data.
          </div>
        )}
        {recent.map((s) => {
          const ingressPct = (s.ingressMs / maxCycle) * 100;
          const dispatchPct = (s.dispatchMs / maxCycle) * 100;
          const wireAPct = (s.wireAMs / maxCycle) * 100;
          const wireBPct = (s.wireBMs / maxCycle) * 100;
          // wire A and B start at the same time after dispatch; render the longer one as the
          // background and the shorter overlaid so skew is visible.
          const longerWire = Math.max(wireAPct, wireBPct);
          const shorterWire = Math.min(wireAPct, wireBPct);
          const longerColor = wireAPct >= wireBPct ? STAGE_COLORS.wireA : STAGE_COLORS.wireB;
          const shorterColor = wireAPct >= wireBPct ? STAGE_COLORS.wireB : STAGE_COLORS.wireA;
          return (
            <div key={s.index} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                #{s.index}
              </span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted/40">
                <div
                  className="absolute top-0 h-full"
                  style={{ left: 0, width: `${ingressPct}%`, background: STAGE_COLORS.ingress }}
                />
                <div
                  className="absolute top-0 h-full"
                  style={{ left: `${ingressPct}%`, width: `${dispatchPct}%`, background: STAGE_COLORS.dispatch }}
                />
                <div
                  className="absolute top-0 h-full opacity-70"
                  style={{ left: `${ingressPct + dispatchPct}%`, width: `${longerWire}%`, background: longerColor }}
                />
                <div
                  className="absolute top-0 h-full"
                  style={{ left: `${ingressPct + dispatchPct}%`, width: `${shorterWire}%`, background: shorterColor }}
                />
                {s.outcome === "missed" && (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-destructive-foreground bg-destructive/80">
                    MISS
                  </div>
                )}
              </div>
              <span className="w-14 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                {s.cycleMs.toFixed(1)}ms
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
    </span>
  );
}
