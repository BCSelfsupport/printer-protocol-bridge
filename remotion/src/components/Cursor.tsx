import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";

/** Animated pointer that travels between two points and "clicks". */
export const Cursor: React.FC<{
  from: [number, number];
  to: [number, number];
  start: number;
  travel?: number;
}> = ({ from, to, start, travel = 26 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - start,
    fps,
    config: { damping: 200 },
    durationInFrames: travel,
  });
  const x = interpolate(s, [0, 1], [from[0], to[0]]);
  const y = interpolate(s, [0, 1], [from[1], to[1]]);
  const clickT = frame - (start + travel);
  const ring = clickT >= 0 && clickT < 20 ? clickT / 20 : -1;
  const appear = interpolate(frame, [start - 8, start], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity: appear,
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      {ring >= 0 ? (
        <div
          style={{
            position: "absolute",
            left: -30,
            top: -30,
            width: 60,
            height: 60,
            borderRadius: 99,
            border: `2px solid ${C.emerald}`,
            opacity: 1 - ring,
            transform: `scale(${0.3 + ring * 1.1})`,
          }}
        />
      ) : null}
      <svg width="30" height="34" viewBox="0 0 24 28">
        <path
          d="M3 2 L20 14 L12.5 15.2 L16.5 24 L13 25.6 L9 16.8 L3 21 Z"
          fill="#FFFFFF"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth="1.4"
        />
      </svg>
    </div>
  );
};
