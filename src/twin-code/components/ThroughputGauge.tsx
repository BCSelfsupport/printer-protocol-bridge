import { useEffect, useMemo, useState } from "react";
import type { BottleSample } from "../types";

interface Props {
  samples: BottleSample[];
}

/** Throughput gauge — bottles/min averaged over last 10s of wall-clock time. */
export function ThroughputGauge({ samples }: Props) {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const bpm = useMemo(() => {
    const windowMs = 10_000;
    const cutoff = now - windowMs;
    const inWindow = samples.filter((s) => s.t4 >= cutoff);
    if (inWindow.length < 2) return 0;
    const span = inWindow[inWindow.length - 1].t4 - inWindow[0].t4;
    if (span <= 0) return 0;
    return (inWindow.length / span) * 60_000;
  }, [samples, now]);

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <h4 className="text-sm font-semibold text-foreground">Throughput</h4>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold text-primary">{bpm.toFixed(0)}</span>
        <span className="text-xs text-muted-foreground">bottles / min</span>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">10-second rolling average</p>
    </div>
  );
}
