import { useEffect, useRef, useState } from "react";
import { useConveyor } from "../useConveyor";
import { conveyorSim } from "../conveyorSim";

const BOTTLE_COLOR_BY_STATE = {
  pending:  "hsl(var(--muted-foreground) / 0.5)",
  printing: "hsl(var(--chart-2))",
  printed:  "hsl(var(--primary))",
  missed:   "hsl(var(--destructive))",
  stale:    "hsl(var(--muted-foreground) / 0.3)",
} as const;

/**
 * SVG conveyor view. Renders bottles as circles moving left→right, with the
 * photocell beam and a "lid printer A" + "side printer B" indicated above
 * and below the belt.
 */
export function ConveyorView() {
  const snap = useConveyor();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 240 });

  // Track container width → tell the sim how long the belt is in mm.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      const w = r.width;
      const h = Math.max(360, Math.min(460, r.width * 0.32));
      setSize({ w, h });
      // 1 px == 1 mm at default scale; conveyor mm length tracks pixel width
      // for an intuitive 1:1 visual mapping.
      conveyorSim.setConveyorLength(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const beltY = size.h * 0.66;
  // Larger bottles so 13-digit serials are readable. Scales with width.
  const bottleR = Math.max(28, Math.min(48, size.w * 0.028));
  const bottleH = bottleR * 2.4; // taller body for a bottle silhouette
  const beamX = conveyorSim.getConfig().photocellPos * size.w;

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <h4 className="font-semibold text-foreground">Conveyor — bonded twin printer station</h4>
        <span className="font-mono text-muted-foreground">
          {snap.bpm.toFixed(0)} bpm · {(snap.lineSpeedMmPerSec / 1000 * 60).toFixed(1)} m/min
        </span>
      </div>
      <div ref={containerRef} className="w-full">
        <svg width={size.w} height={size.h} className="block">
          {/* Printer A label (top) */}
          <g>
            <rect
              x={beamX - 80} y={8} width={160} height={32}
              rx={4}
              fill="hsl(var(--muted))"
              stroke="hsl(var(--border))"
            />
            <text
              x={beamX} y={28}
              textAnchor="middle"
              fontSize={13}
              fontFamily="monospace"
              fill="hsl(var(--foreground))"
            >
              Printer A · DM 16×16
            </text>
            <line
              x1={beamX} y1={40} x2={beamX} y2={beltY - bottleH - 4}
              stroke="hsl(var(--chart-3))"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          </g>

          {/* Belt */}
          <rect
            x={0} y={beltY - 2}
            width={size.w} height={4}
            fill="hsl(var(--border))"
          />
          <rect
            x={0} y={beltY + 2}
            width={size.w} height={8}
            fill="hsl(var(--muted))"
          />

          {/* Photocell beam */}
          <line
            x1={beamX} y1={size.h - 34} x2={beamX} y2={beltY - 4}
            stroke="hsl(var(--destructive))"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            opacity={0.8}
          />
          <circle cx={beamX} cy={size.h - 24} r={7} fill="hsl(var(--destructive))" />
          <text
            x={beamX} y={size.h - 6}
            textAnchor="middle"
            fontSize={11}
            fontFamily="monospace"
            fill="hsl(var(--muted-foreground))"
          >
            photocell
          </text>

          {/* Printer B label (bottom side) */}
          <g>
            <rect
              x={beamX + 18} y={size.h - 38}
              width={140} height={24}
              rx={3}
              fill="hsl(var(--muted))"
              stroke="hsl(var(--border))"
            />
            <text
              x={beamX + 88} y={size.h - 22}
              textAnchor="middle"
              fontSize={12}
              fontFamily="monospace"
              fill="hsl(var(--foreground))"
            >
              Printer B · text
            </text>
          </g>

          {/* Bottles — drawn as a silhouette (neck + shoulders + body) */}
          {snap.bottles.map((b) => {
            const fill = BOTTLE_COLOR_BY_STATE[b.state];
            const showLabel = b.state === "printed" || b.state === "missed";
            const cx = b.xMm;
            const bodyTop = beltY - bottleH;
            const neckW = bottleR * 0.55;
            const neckH = bottleR * 0.55;
            const shoulderH = bottleR * 0.5;
            // Path: bottle silhouette
            const path = [
              `M ${cx - neckW} ${bodyTop}`,
              `L ${cx - neckW} ${bodyTop + neckH}`,
              `Q ${cx - bottleR} ${bodyTop + neckH} ${cx - bottleR} ${bodyTop + neckH + shoulderH}`,
              `L ${cx - bottleR} ${beltY - 2}`,
              `L ${cx + bottleR} ${beltY - 2}`,
              `L ${cx + bottleR} ${bodyTop + neckH + shoulderH}`,
              `Q ${cx + bottleR} ${bodyTop + neckH} ${cx + neckW} ${bodyTop + neckH}`,
              `L ${cx + neckW} ${bodyTop}`,
              `Z`,
            ].join(" ");
            // Cap on top
            const capY = bodyTop - bottleR * 0.18;
            const capH = bottleR * 0.22;
            return (
              <g key={b.id}>
                {/* Cap */}
                <rect
                  x={cx - neckW - 2}
                  y={capY}
                  width={(neckW + 2) * 2}
                  height={capH}
                  rx={2}
                  fill="hsl(var(--muted-foreground) / 0.6)"
                />
                {/* Bottle body */}
                <path
                  d={path}
                  fill={fill}
                  fillOpacity={b.state === "pending" ? 0.55 : 0.9}
                  stroke={b.state === "missed" ? "hsl(var(--destructive))" : "hsl(var(--border))"}
                  strokeWidth={b.state === "missed" ? 2 : 1}
                />
                {/* Printed serial — full 13 digits, readable */}
                {b.state === "printed" && b.serial && (
                  <text
                    x={cx}
                    y={beltY - bottleH * 0.45}
                    textAnchor="middle"
                    fontSize={Math.max(10, bottleR * 0.34)}
                    fontFamily="monospace"
                    fontWeight={600}
                    fill="hsl(var(--primary-foreground))"
                  >
                    {b.serial}
                  </text>
                )}
                {/* MISS overlay */}
                {b.state === "missed" && (
                  <text
                    x={cx}
                    y={beltY - bottleH * 0.45}
                    textAnchor="middle"
                    fontSize={Math.max(11, bottleR * 0.4)}
                    fontFamily="monospace"
                    fontWeight={700}
                    fill="hsl(var(--destructive-foreground))"
                  >
                    MISS
                  </text>
                )}
                {/* Cycle ms above bottle */}
                {showLabel && b.cycleMs !== null && (
                  <text
                    x={cx}
                    y={bodyTop - capH - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontFamily="monospace"
                    fill={b.state === "missed" ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))"}
                  >
                    {b.state === "missed" ? "miss" : `${b.cycleMs.toFixed(0)}ms`}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
        <Legend color={BOTTLE_COLOR_BY_STATE.pending}  label="pending" />
        <Legend color={BOTTLE_COLOR_BY_STATE.printing} label="printing" />
        <Legend color={BOTTLE_COLOR_BY_STATE.printed}  label="printed" />
        <Legend color={BOTTLE_COLOR_BY_STATE.missed}   label="miss-print" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </span>
  );
}
