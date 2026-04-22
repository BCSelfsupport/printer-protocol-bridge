import { useEffect, useMemo, useRef } from "react";
import type { BottleSample } from "../types";

interface Props {
  samples: BottleSample[];
  /** Which derived stage to plot. */
  stage: "cycleMs" | "wireAMs" | "wireBMs" | "ingressMs" | "dispatchMs" | "skewMs";
  label: string;
}

/**
 * 2D density heatmap: bottle index (x) × stage duration (y).
 * Surfaces periodic stalls (firmware GC, polling collisions) as
 * vertical bands that no other view exposes well.
 */
export function StageHeatmap({ samples, stage, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const data = useMemo(() => samples.slice(-2000).map((s) => s[stage]), [samples, stage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // bg
    ctx.fillStyle = "hsl(var(--muted) / 0.15)";
    ctx.fillRect(0, 0, cssW, cssH);

    if (data.length === 0) return;

    const xBins = Math.min(120, Math.max(20, Math.floor(cssW / 4)));
    const yBins = Math.min(40, Math.max(8, Math.floor(cssH / 6)));
    const min = Math.min(...data);
    const max = Math.max(...data);
    const yspan = max - min || 1;

    const grid: number[][] = Array.from({ length: xBins }, () => new Array(yBins).fill(0));
    const perX = data.length / xBins;
    for (let i = 0; i < data.length; i++) {
      const xi = Math.min(xBins - 1, Math.floor(i / perX));
      const yi = Math.min(yBins - 1, Math.floor(((data[i] - min) / yspan) * yBins));
      grid[xi][yBins - 1 - yi]++;
    }
    let peak = 0;
    for (const col of grid) for (const v of col) if (v > peak) peak = v;
    if (peak === 0) return;

    const cellW = cssW / xBins;
    const cellH = cssH / yBins;
    for (let x = 0; x < xBins; x++) {
      for (let y = 0; y < yBins; y++) {
        const v = grid[x][y];
        if (v === 0) continue;
        const t = v / peak;
        // primary hue with alpha = density
        ctx.fillStyle = `hsl(var(--primary) / ${(0.15 + t * 0.85).toFixed(2)})`;
        ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
  }, [data]);

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{label} — density heatmap</h4>
        <span className="font-mono text-[10px] text-muted-foreground">
          time → · y = stage duration · brightness = density
        </span>
      </div>
      <canvas ref={canvasRef} className="h-32 w-full rounded" />
    </div>
  );
}
