import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, display } from "../../theme";
import { useEnter } from "../../components/Ui";
import { DotText } from "../../components/DotText";

export const A1Title: React.FC = () => {
  const frame = useCurrentFrame();
  const e = useEnter(4, 200);
  const e2 = useEnter(16, 200);
  const e3 = useEnter(30, 200);
  const line = useEnter(24, 200);

  return (
    <AbsoluteFill
      style={{
        padding: "0 130px",
        justifyContent: "center",
        alignItems: "flex-start",
        gap: 26,
      }}
    >
      <div
        style={{
          fontFamily: body,
          letterSpacing: 10,
          fontSize: 19,
          color: C.emerald,
          textTransform: "uppercase",
          opacity: e,
          transform: `translateX(${interpolate(e, [0, 1], [-30, 0])}px)`,
        }}
      >
        CodeSync · Training
      </div>

      <h1
        style={{
          fontFamily: display,
          fontWeight: 700,
          fontSize: 104,
          lineHeight: 1.02,
          margin: 0,
          color: C.ink,
          opacity: e2,
          transform: `translateY(${interpolate(e2, [0, 1], [56, 0])}px)`,
          filter: `blur(${interpolate(e2, [0, 1], [16, 0])}px)`,
        }}
      >
        Message Adjust
        <br />
        <span
          style={{
            background: `linear-gradient(100deg, ${C.blue}, ${C.emerald})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          per Printer
        </span>
      </h1>

      <div
        style={{
          height: 3,
          width: interpolate(line, [0, 1], [0, 460]),
          background: `linear-gradient(90deg, ${C.blue}, transparent)`,
        }}
      />

      <div
        style={{
          fontFamily: body,
          fontSize: 28,
          color: C.dim,
          opacity: e3,
          maxWidth: 780,
        }}
      >
        Width · Delay · Bold · Gap · Speed — tuned for every head on the line.
      </div>

      <div
        style={{
          position: "absolute",
          right: 130,
          bottom: 150,
          opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${Math.sin(frame / 24) * 6}px)`,
        }}
      >
        <DotText size={64} dot={5} color="#9BE7C4">
          EGG-4501
        </DotText>
      </div>
    </AbsoluteFill>
  );
};
