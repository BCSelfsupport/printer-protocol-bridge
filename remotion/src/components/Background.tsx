import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { C } from "../theme";

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 40;
  const drift2 = Math.cos(frame / 120) * 60;
  const grid = interpolate(frame, [0, 60], [0, 0.5], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 700px at ${18 + drift / 8}% ${
            22 + drift2 / 20
          }%, rgba(29,78,216,0.38), transparent 60%),
            radial-gradient(900px 640px at ${86 - drift / 10}% ${
            80 + drift2 / 24
          }%, rgba(16,185,129,0.20), transparent 62%),
            linear-gradient(160deg, ${C.bg} 0%, ${C.bg2} 55%, #060A11 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: grid,
          backgroundImage:
            "linear-gradient(rgba(120,160,220,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(120,160,220,0.09) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          transform: `translateY(${(frame % 72) * -0.25}px)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(closest-side, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
