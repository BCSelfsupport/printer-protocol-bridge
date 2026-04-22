import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceDot } from "recharts";
import type { BottleSample } from "../types";

interface Props {
  samples: BottleSample[];
  count?: number;
}

export function RollingCycleChart({ samples, count = 1000 }: Props) {
  const data = useMemo(() => {
    const recent = samples.slice(-count);
    return recent.map((s) => ({
      index: s.index,
      cycleMs: s.cycleMs,
      missed: s.outcome === "missed",
    }));
  }, [samples, count]);

  const misses = useMemo(() => data.filter((d) => d.missed), [data]);

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Rolling cycle time (ms)</h4>
        <span className="font-mono text-[10px] text-muted-foreground">
          last {data.length} bottles · {misses.length} miss-print{misses.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="index" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 11,
              }}
              formatter={(v: number) => [`${v.toFixed(2)} ms`, "cycle"]}
              labelFormatter={(v: number) => `bottle #${v}`}
            />
            <Line
              type="monotone"
              dataKey="cycleMs"
              stroke="hsl(var(--primary))"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            {misses.map((m) => (
              <ReferenceDot key={m.index} x={m.index} y={0} r={3} fill="hsl(var(--destructive))" stroke="none" />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
