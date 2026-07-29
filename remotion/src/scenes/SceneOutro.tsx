import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, display } from "../theme";
import { useEnter } from "../components/Ui";
import { DotText } from "../components/DotText";

const STEPS = ["Name", "Template", "Font", "Save"];

export const SceneOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const e = useEnter(6);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40 }}>
      <div
        style={{
          opacity: e,
          transform: `scale(${interpolate(e, [0, 1], [0.9, 1])})`,
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: body, letterSpacing: 10, color: C.emerald, fontSize: 19 }}>
          THAT'S THE WHOLE FLOW
        </div>
        <h1
          style={{
            fontFamily: display,
            fontWeight: 700,
            fontSize: 92,
            margin: "22px 0 0",
            color: C.ink,
          }}
        >
          Four steps to print
        </h1>
      </div>

      <div style={{ display: "flex", gap: 18 }}>
        {STEPS.map((s, i) => {
          const o = interpolate(frame, [16 + i * 8, 34 + i * 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={s}
              style={{
                opacity: o,
                transform: `translateY(${interpolate(o, [0, 1], [26, 0])}px)`,
                padding: "16px 32px",
                borderRadius: 999,
                border: `1px solid ${C.stroke}`,
                background: "rgba(59,130,246,0.10)",
                fontFamily: body,
                fontWeight: 700,
                fontSize: 22,
                color: C.ink,
              }}
            >
              {`0${i + 1} ${s}`}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 26,
          opacity: interpolate(frame, [48, 70], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translateY(${Math.sin(frame / 24) * 5}px)`,
        }}
      >
        <DotText size={54} dot={4} color="#9FE8FF">
          CODESYNC
        </DotText>
      </div>
    </AbsoluteFill>
  );
};
