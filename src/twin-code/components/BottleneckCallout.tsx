import { useMemo } from "react";
import { computeStats } from "../stats";
import type { BottleSample } from "../types";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface Props {
  samples: BottleSample[];
  count?: number;
}

interface StageContribution {
  key: string;
  label: string;
  meanMs: number;
  pctOfCycle: number;
}

/**
 * Auto-identifies the slowest stage in the last N bottles so the operator
 * doesn't have to read the histograms to know where to look.
 */
export function BottleneckCallout({ samples, count = 100 }: Props) {
  const recent = useMemo(() => samples.slice(-count), [samples, count]);

  const result = useMemo(() => {
    if (recent.length < 10) return null;
    const cycleStats = computeStats(recent.map((s) => s.cycleMs));
    const stages: StageContribution[] = [
      { key: "ingress",  label: "Ingress",     meanMs: computeStats(recent.map((s) => s.ingressMs)).mean,  pctOfCycle: 0 },
      { key: "dispatch", label: "Dispatch",    meanMs: computeStats(recent.map((s) => s.dispatchMs)).mean, pctOfCycle: 0 },
      { key: "wireA",    label: "Printer A wire", meanMs: computeStats(recent.map((s) => s.wireAMs)).mean,    pctOfCycle: 0 },
      { key: "wireB",    label: "Printer B wire", meanMs: computeStats(recent.map((s) => s.wireBMs)).mean,    pctOfCycle: 0 },
    ];
    const denom = cycleStats.mean || 1;
    stages.forEach((s) => { s.pctOfCycle = (s.meanMs / denom) * 100; });
    stages.sort((a, b) => b.meanMs - a.meanMs);
    return { worst: stages[0], cycleStats, stages };
  }, [recent]);

  if (!result) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-card/50 p-3 text-xs text-muted-foreground">
        Collecting samples — bottleneck analysis will appear after 10 bottles.
      </div>
    );
  }

  const { worst, cycleStats } = result;
  const isHealthy = worst.pctOfCycle < 50;

  return (
    <div
      className={`flex items-start gap-3 rounded-md border p-3 ${
        isHealthy
          ? "border-border bg-card"
          : "border-destructive/40 bg-destructive/5"
      }`}
    >
      {isHealthy ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      ) : (
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {isHealthy ? "Balanced pipeline" : `Bottleneck: ${worst.label}`}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{worst.label}</span> averages{" "}
          <span className="font-mono">{worst.meanMs.toFixed(1)}ms</span> ({worst.pctOfCycle.toFixed(0)}% of cycle).
          Mean cycle <span className="font-mono">{cycleStats.mean.toFixed(1)}ms</span>, p95{" "}
          <span className="font-mono">{cycleStats.p95.toFixed(1)}ms</span>.
        </p>
      </div>
    </div>
  );
}
