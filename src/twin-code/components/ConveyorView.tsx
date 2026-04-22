import { useEffect, useRef, useState } from "react";
import { useConveyor } from "../useConveyor";
import { conveyorSim } from "../conveyorSim";
import { getDmGrid } from "../dmCache";

const BOTTLE_COLOR_BY_STATE = {
  pending:  "hsl(var(--muted-foreground) / 0.45)",
  printing: "hsl(var(--chart-2))",
  printed:  "hsl(var(--primary))",
  missed:   "hsl(var(--destructive))",
  stale:    "hsl(var(--muted-foreground) / 0.3)",
} as const;

/**
 * Conveyor view rendered in oblique projection (camera looking down + sideways)
 * so we can see BOTH the bottle lid (where the 16×16 Data Matrix is printed)
 * and the bottle side wall (where the 13-digit human-readable code is printed).
 *
 * Projection model:
 *   screenX = worldX + depthOffsetX
 *   screenY = beltY  + depthOffsetY     (depthOffset > 0 means "further away")
 * Bottle = capsule: an ellipse top (lid) + a vertical body whose front face is
 * the side wall.
 */
export function ConveyorView() {
  const snap = useConveyor();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 380 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      const w = r.width;
      const h = Math.max(380, Math.min(500, r.width * 0.34));
      setSize({ w, h });
      conveyorSim.setConveyorLength(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Layout
  const beltFrontY = size.h * 0.78;          // belt front edge (closest to camera)
  const depthDx = -28;                        // x shift for "back" (camera at right-front)
  const depthDy = -36;                        // y shift for "back" (negative = up)
  const beltBackY = beltFrontY + depthDy;
  const bottleR = Math.max(26, Math.min(44, size.w * 0.026));
  const bottleH = bottleR * 2.6;
  const lidEllipseRy = bottleR * 0.42;        // ellipse vertical radius (perspective)
  const beamX = conveyorSim.getConfig().photocellPos * size.w;

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <h4 className="font-semibold text-foreground">Conveyor — bonded twin printer station (oblique view)</h4>
        <span className="font-mono text-muted-foreground">
          {snap.bpm.toFixed(0)} bpm · {(snap.lineSpeedMmPerSec / 1000 * 60).toFixed(1)} m/min · pitch {conveyorSim.getConfig().pitchMm.toFixed(0)} mm
        </span>
      </div>
      <div ref={containerRef} className="w-full">
        <svg width={size.w} height={size.h} className="block">
          {/* === Belt as a parallelogram (oblique) === */}
          <polygon
            points={`
              0,${beltFrontY}
              ${size.w},${beltFrontY}
              ${size.w + depthDx},${beltBackY}
              ${depthDx},${beltBackY}
            `}
            fill="hsl(var(--muted))"
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
          {/* Belt front edge highlight */}
          <line
            x1={0} y1={beltFrontY}
            x2={size.w} y2={beltFrontY}
            stroke="hsl(var(--border))"
            strokeWidth={2}
          />
          {/* Belt rollers (subtle stripes along travel direction, on the back edge) */}
          {Array.from({ length: 18 }).map((_, i) => {
            const fx = (i / 18) * size.w;
            const bx = fx + depthDx;
            return (
              <line
                key={i}
                x1={fx} y1={beltFrontY}
                x2={bx} y2={beltBackY}
                stroke="hsl(var(--border))"
                strokeOpacity={0.35}
                strokeWidth={1}
              />
            );
          })}

          {/* === Printer A — overhead lid printer (mounted above belt, prints DM down) === */}
          <g>
            <rect
              x={beamX - 90} y={10} width={180} height={36}
              rx={4}
              fill="hsl(var(--card))"
              stroke="hsl(var(--border))"
            />
            <text
              x={beamX} y={26}
              textAnchor="middle"
              fontSize={12}
              fontFamily="monospace"
              fill="hsl(var(--foreground))"
              fontWeight={600}
            >
              Printer A · DM 16×16 (lid)
            </text>
            <text
              x={beamX} y={40}
              textAnchor="middle"
              fontSize={10}
              fontFamily="monospace"
              fill="hsl(var(--muted-foreground))"
            >
              prints down
            </text>
            {/* Print head bracket */}
            <line
              x1={beamX} y1={46} x2={beamX} y2={beltBackY - bottleH - 8}
              stroke="hsl(var(--chart-3))"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <polygon
              points={`${beamX - 6},${beltBackY - bottleH - 8} ${beamX + 6},${beltBackY - bottleH - 8} ${beamX},${beltBackY - bottleH - 2}`}
              fill="hsl(var(--chart-3))"
            />
          </g>

          {/* === Photocell beam — crosses belt at beamX === */}
          <line
            x1={beamX} y1={beltFrontY}
            x2={beamX + depthDx} y2={beltBackY}
            stroke="hsl(var(--destructive))"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            opacity={0.9}
          />
          <circle cx={beamX + depthDx - 2} cy={beltBackY - 4} r={5} fill="hsl(var(--destructive))" />
          <text
            x={beamX + depthDx - 14} y={beltBackY - 12}
            textAnchor="end"
            fontSize={10}
            fontFamily="monospace"
            fill="hsl(var(--muted-foreground))"
          >
            photocell
          </text>

          {/* === Printer B — side printer (mounted on far side, prints HR onto side wall) === */}
          <g>
            <rect
              x={beamX + 30} y={beltBackY - bottleH - 30}
              width={150} height={26}
              rx={3}
              fill="hsl(var(--card))"
              stroke="hsl(var(--border))"
            />
            <text
              x={beamX + 105} y={beltBackY - bottleH - 12}
              textAnchor="middle"
              fontSize={11}
              fontFamily="monospace"
              fill="hsl(var(--foreground))"
              fontWeight={600}
            >
              Printer B · text (side)
            </text>
          </g>

          {/* === Bottles === */}
          {snap.bottles
            // sort so back bottles render before front bottles (painter's algo).
            // Since we only have one row, sort by xMm so leftmost draws first.
            .slice()
            .sort((a, b) => a.xMm - b.xMm)
            .map((b) => {
              const fill = BOTTLE_COLOR_BY_STATE[b.state];
              const cx = b.xMm;
              // Bottle sits on belt; "base" follows the belt's depth at this x.
              // We park bottles on the BACK lane so the front face is fully visible.
              const baseX = cx + depthDx * 0.5;
              const baseY = beltFrontY + depthDy * 0.5;
              const topY = baseY - bottleH;
              const grid = (b.state === "printed" && b.serial) ? getDmGrid(b.serial) : null;

              return (
                <g key={b.id}>
                  {/* Side wall (front face of cylinder) */}
                  <rect
                    x={baseX - bottleR}
                    y={topY + lidEllipseRy * 0.4}
                    width={bottleR * 2}
                    height={bottleH - lidEllipseRy * 0.4}
                    fill={fill}
                    fillOpacity={b.state === "pending" ? 0.55 : 0.92}
                    stroke="hsl(var(--border))"
                    strokeWidth={1}
                  />
                  {/* Side wall shading (right side darker for round look) */}
                  <rect
                    x={baseX + bottleR * 0.3}
                    y={topY + lidEllipseRy * 0.4}
                    width={bottleR * 0.7}
                    height={bottleH - lidEllipseRy * 0.4}
                    fill="hsl(0 0% 0% / 0.18)"
                  />
                  {/* Bottom ellipse (where bottle meets belt) */}
                  <ellipse
                    cx={baseX} cy={baseY}
                    rx={bottleR} ry={lidEllipseRy * 0.7}
                    fill="hsl(0 0% 0% / 0.25)"
                  />
                  {/* Lid (top ellipse) */}
                  <ellipse
                    cx={baseX} cy={topY + lidEllipseRy * 0.4}
                    rx={bottleR} ry={lidEllipseRy}
                    fill={b.state === "printed" ? "hsl(0 0% 96%)" : "hsl(var(--muted-foreground) / 0.7)"}
                    stroke="hsl(var(--border))"
                    strokeWidth={1}
                  />

                  {/* === Lid: 16×16 Data Matrix === */}
                  {b.state === "printed" && grid && (() => {
                    const dmW = bottleR * 1.3;        // DM width on the lid
                    const dmH = lidEllipseRy * 1.45;  // squashed by perspective
                    const cellW = dmW / 16;
                    const cellH = dmH / 16;
                    const dmX = baseX - dmW / 2;
                    const dmY = topY + lidEllipseRy * 0.4 - dmH / 2;
                    return (
                      <g>
                        {/* quiet zone */}
                        <ellipse
                          cx={baseX} cy={topY + lidEllipseRy * 0.4}
                          rx={dmW / 2 + cellW * 1.2}
                          ry={dmH / 2 + cellH * 1.2}
                          fill="hsl(0 0% 100%)"
                        />
                        {grid.map((row, ry) =>
                          row.map((on, rx) =>
                            on ? (
                              <rect
                                key={`${ry}-${rx}`}
                                x={dmX + rx * cellW}
                                y={dmY + ry * cellH}
                                width={cellW + 0.4}
                                height={cellH + 0.4}
                                fill="hsl(0 0% 8%)"
                              />
                            ) : null
                          )
                        )}
                      </g>
                    );
                  })()}

                  {/* === Side wall: 13-digit human-readable === */}
                  {b.state === "printed" && b.serial && (
                    <text
                      x={baseX}
                      y={topY + bottleH * 0.55}
                      textAnchor="middle"
                      fontFamily="monospace"
                      fontWeight={700}
                      fontSize={Math.max(9, bottleR * 0.28)}
                      textLength={bottleR * 1.7}
                      lengthAdjust="spacingAndGlyphs"
                      fill="hsl(var(--primary-foreground))"
                    >
                      {b.serial}
                    </text>
                  )}

                  {/* MISS overlay */}
                  {b.state === "missed" && (
                    <text
                      x={baseX}
                      y={topY + bottleH * 0.55}
                      textAnchor="middle"
                      fontSize={Math.max(11, bottleR * 0.42)}
                      fontFamily="monospace"
                      fontWeight={800}
                      fill="hsl(var(--destructive-foreground))"
                    >
                      MISS
                    </text>
                  )}

                  {/* Cycle ms label, floating above bottle */}
                  {(b.state === "printed" || b.state === "missed") && b.cycleMs !== null && (
                    <text
                      x={baseX}
                      y={topY - 8}
                      textAnchor="middle"
                      fontSize={10}
                      fontFamily="monospace"
                      fill={b.state === "missed" ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))"}
                    >
                      {b.state === "missed" ? "miss" : `${b.cycleMs.toFixed(0)} ms`}
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
