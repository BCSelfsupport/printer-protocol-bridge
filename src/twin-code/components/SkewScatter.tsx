import { useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from "recharts";
import type { BottleSample } from "../types";

interface Props {
  samples: BottleSample[];
  count?: number;
}

export function SkewScatter({ samples, count = 500 }: Props) {
  const data = useMemo(() => {
    return samples.slice(-count).map((s) => ({
      a: s.wireAMs,
      b: s.wireBMs,
    }));
  }, [samples, count]);

  const max = useMemo(
    () => Math.max(1, ...data.flatMap((d) => [d.a, d.b])),
    [data],
  );

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Printer A vs B round-trip (ms)</h4>
        <span className="font-mono text-[10px] text-muted-foreground">
          diagonal = bonded · drift = bottleneck
        </span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 4, right: 8, bottom: 16, left: 0 }}>
            <XAxis
              type="number"
              dataKey="a"
              name="Printer A"
              domain={[0, max]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              label={{ value: "Printer A (ms)", position: "insideBottom", offset: -4, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              type="number"
              dataKey="b"
              name="Printer B"
              domain={[0, max]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 11,
              }}
              formatter={(v: number) => `${v.toFixed(2)} ms`}
            />
            <ReferenceLine
              segment={[{ x: 0, y: 0 }, { x: max, y: max }]}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
            />
            <Scatter data={data} fill="hsl(var(--primary))" fillOpacity={0.5} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
