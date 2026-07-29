import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, display } from "../theme";
import { useEnter } from "../components/Ui";
import { DotText } from "../components/DotText";

export const SceneTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const e1 = useEnter(4);
  const e2 = useEnter(16);
  const e3 = useEnter(30);
  const line = interpolate(frame, [10, 46], [0, 1], {
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  return (
    <AbsoluteFill style={{ padding: "0 120px", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: body,
          letterSpacing: 12,
          fontSize: 20,
          color: C.emerald,
          textTransform: "uppercase",
          opacity: e1,
          transform: `translateY(${interpolate(e1, [0, 1], [20, 0])}px)`,
        }}
      >
        CodeSync · Operator Training
      </div>

      <h1
        style={{
          fontFamily: display,
          fontWeight: 700,
          fontSize: 118,
          lineHeight: 0.98,
          margin: "26px 0 0",
          color: C.ink,
          opacity: e2,
          transform: `translateY(${interpolate(e2, [0, 1], [60, 0])}px)`,
          filter: `blur(${interpolate(e2, [0, 1], [16, 0])}px)`,
        }}
      >
        Create a
        <br />
        <span
          style={{
            background: `linear-gradient(100deg, ${C.blue}, ${C.emerald})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Message
        </span>
      </h1>

      <div
        style={{
          height: 3,
          marginTop: 40,
          width: `${line * 62}%`,
          background: `linear-gradient(90deg, ${C.blue}, ${C.emerald}, transparent)`,
        }}
      />

      <div
        style={{
          marginTop: 34,
          display: "flex",
          gap: 26,
          alignItems: "center",
          opacity: e3,
          transform: `translateY(${interpolate(e3, [0, 1], [24, 0])}px)`,
        }}
      >
        <span style={{ fontFamily: body, fontSize: 26, color: C.dim }}>
          Templates · Fonts · Save
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          right: 110,
          top: 250,
          transform: `translateY(${Math.sin(frame / 30) * 10}px)`,
          opacity: interpolate(frame, [24, 54], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <DotText size={74} dot={5} color="#9FE8FF">
          EGG-4501
        </DotText>
      </div>
    </AbsoluteFill>
  );
};
