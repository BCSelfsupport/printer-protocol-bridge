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
              x={beamX - 60} y={8} width={120} height={28}
              rx={4}
              fill="hsl(var(--muted))"
              stroke="hsl(var(--border))"
            />
            <text
              x={beamX} y={26}
              textAnchor="middle"
              fontSize={11}
              fontFamily="monospace"
              fill="hsl(var(--foreground))"
            >
              Printer A · DM 16×16
            </text>
            <line
              x1={beamX} y1={36} x2={beamX} y2={beltY - bottleR - 4}
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
            x={0} y={beltY + bottleR + 2}
            width={size.w} height={6}
            fill="hsl(var(--muted))"
          />

          {/* Photocell beam */}
          <line
            x1={beamX} y1={size.h - 30} x2={beamX} y2={beltY + bottleR + 4}
            stroke="hsl(var(--destructive))"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            opacity={0.8}
          />
          <circle cx={beamX} cy={size.h - 22} r={6} fill="hsl(var(--destructive))" />
          <text
            x={beamX} y={size.h - 6}
            textAnchor="middle"
            fontSize={10}
            fontFamily="monospace"
            fill="hsl(var(--muted-foreground))"
          >
            photocell
          </text>

          {/* Printer B label (bottom side) */}
          <g>
            <rect
              x={beamX + 16} y={beltY + bottleR + 12}
              width={120} height={22}
              rx={3}
              fill="hsl(var(--muted))"
              stroke="hsl(var(--border))"
            />
            <text
              x={beamX + 76} y={beltY + bottleR + 27}
              textAnchor="middle"
              fontSize={11}
              fontFamily="monospace"
              fill="hsl(var(--foreground))"
            >
              Printer B · text
            </text>
          </g>

          {/* Bottles */}
          {snap.bottles.map((b) => {
            const fill = BOTTLE_COLOR_BY_STATE[b.state];
            const showLabel = b.state === "printed" || b.state === "missed";
            return (
              <g key={b.id}>
                <circle
                  cx={b.xMm}
                  cy={beltY - bottleR - 1}
                  r={bottleR}
                  fill={fill}
                  fillOpacity={b.state === "pending" ? 0.5 : 0.85}
                  stroke={b.state === "missed" ? "hsl(var(--destructive))" : "hsl(var(--border))"}
                  strokeWidth={b.state === "missed" ? 2 : 1}
                />
                {b.state === "printed" && b.serial && (
                  <text
                    x={b.xMm}
                    y={beltY - bottleR + 4}
                    textAnchor="middle"
                    fontSize={Math.max(7, bottleR * 0.45)}
                    fontFamily="monospace"
                    fill="hsl(var(--primary-foreground))"
                  >
                    {b.serial.slice(-6)}
                  </text>
                )}
                {showLabel && b.cycleMs !== null && (
                  <text
                    x={b.xMm}
                    y={beltY - bottleR - bottleR - 6}
                    textAnchor="middle"
                    fontSize={9}
                    fontFamily="monospace"
                    fill={b.state === "missed" ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))"}
                  >
                    {b.state === "missed" ? "MISS" : `${b.cycleMs.toFixed(0)}ms`}
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
