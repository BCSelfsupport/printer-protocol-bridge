import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, display } from "../../theme";
import { useEnter } from "../../components/Ui";

const RECAP = [
  "Adjust opens the printer's own setup card",
  "Width · Delay · Bold · Gap · Speed follow the message",
  "Rotation always comes from the printer",
  "Apply to any selection of printers at once",
  "Sync Adjust pulls HMI edits back into CodeSync",
];

export const A8Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const t = useEnter(4, 200);

  return (
    <AbsoluteFill style={{ padding: "0 130px", justifyContent: "center", gap: 34 }}>
      <div
        style={{
          fontFamily: display,
          fontWeight: 700,
          fontSize: 62,
          color: C.ink,
          opacity: t,
          transform: `translateY(${interpolate(t, [0, 1], [40, 0])}px)`,
        }}
      >
        Message Adjust, in five moves
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {RECAP.map((r, i) => {
          const e = interpolate(frame, [14 + i * 9, 30 + i * 9], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={r}
              style={{
                opacity: e,
                transform: `translateX(${interpolate(e, [0, 1], [-34, 0])}px)`,
                display: "flex",
                alignItems: "center",
                gap: 16,
                fontFamily: body,
                fontSize: 27,
                color: C.dim,
              }}
            >
              <span style={{ color: C.emerald, fontSize: 22 }}>✓</span>
              {r}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 22,
          fontFamily: body,
          letterSpacing: 9,
          fontSize: 20,
          textTransform: "uppercase",
          background: `linear-gradient(100deg, ${C.blue}, ${C.emerald})`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          opacity: interpolate(frame, [66, 84], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        BestCode CodeSync
      </div>
    </AbsoluteFill>
  );
};
