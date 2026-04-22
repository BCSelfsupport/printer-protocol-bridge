import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from "recharts";
import { computeStats, histogram } from "../stats";
import type { BottleSample } from "../types";

interface Props {
  samples: BottleSample[];
  stage: "ingressMs" | "dispatchMs" | "wireAMs" | "wireBMs" | "skewMs" | "cycleMs";
  label: string;
}

export function StageHistogram({ samples, stage, label }: Props) {
  const values = useMemo(() => samples.map((s) => s[stage]), [samples, stage]);
  const stats = useMemo(() => computeStats(values), [values]);
  const bins = useMemo(() => histogram(values, 24), [values]);

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{label}</h4>
        <span className="font-mono text-[10px] text-muted-foreground">
          n={stats.count} · p50 {stats.p50.toFixed(1)} · p95 {stats.p95.toFixed(1)} · p99 {stats.p99.toFixed(1)} ms
        </span>
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bins} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="x"
              tickFormatter={(v) => `${v.toFixed(0)}`}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 11,
              }}
              formatter={(v: number) => [v, "count"]}
              labelFormatter={(v: number) => `${v.toFixed(2)} ms`}
            />
            <ReferenceLine x={stats.p50} stroke="hsl(var(--chart-2))" strokeDasharray="2 2" />
            <ReferenceLine x={stats.p95} stroke="hsl(var(--chart-4))" strokeDasharray="2 2" />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
