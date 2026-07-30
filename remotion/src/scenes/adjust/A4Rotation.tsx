import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, mono } from "../../theme";
import { Headline, Panel, PanelHeader, StepBadge, Sub } from "../../components/Ui";
import { DotText } from "../../components/DotText";

const MODES = [
  { name: "Normal", scaleX: 1, scaleY: 1 },
  { name: "Flip", scaleX: 1, scaleY: -1 },
  { name: "Mirror Flip", scaleX: -1, scaleY: -1 },
];

export const A4Rotation: React.FC = () => {
  const frame = useCurrentFrame();
  const idx = frame < 46 ? 0 : frame < 88 ? 1 : 2;

  return (
    <AbsoluteFill style={{ padding: "0 110px", justifyContent: "center", gap: 30 }}>
      <StepBadge n="03" label="The one exception" />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 60 }}>
        <div style={{ width: 680 }}>
          <Headline delay={8} size={54}>
            Rotation always comes from the printer
          </Headline>
          <div style={{ height: 18 }} />
          <Sub delay={16}>
            A message can be built anywhere in the fleet, but Flip and Mirror are
            physical — they depend on how the head is mounted. CodeSync ignores the
            rotation stored in the message and uses the target printer&apos;s setup card.
          </Sub>
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 19,
            color: C.emerald,
            border: `1px solid ${C.emerald}55`,
            borderRadius: 14,
            padding: "14px 20px",
            background: "rgba(16,185,129,0.10)",
          }}
        >
          SETUP CARD WINS
        </div>
      </div>

      <div style={{ display: "flex", gap: 30 }}>
        {MODES.map((m, i) => {
          const active = idx === i;
          return (
            <Panel key={m.name} delay={20 + i * 8} style={{ flex: 1 }}>
              <PanelHeader title={`Printer ${i + 1}`} right={active ? "LIVE" : undefined} />
              <div
                style={{
                  height: 210,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: active
                    ? "linear-gradient(180deg, rgba(16,185,129,0.10), rgba(6,10,20,0.9))"
                    : "linear-gradient(180deg, rgba(6,10,20,0.94), rgba(10,18,32,0.6))",
                  transform: `scale(${active ? 1 : 0.97})`,
                  opacity: active ? 1 : 0.55,
                }}
              >
                <div style={{ transform: `scale(${m.scaleX}, ${m.scaleY})` }}>
                  <DotText size={52} dot={4.4} color={active ? "#B7F0D6" : "#7FA0BE"}>
                    EGG-4501
                  </DotText>
                </div>
              </div>
              <div
                style={{
                  padding: "14px 20px",
                  borderTop: `1px solid ${C.stroke}`,
                  fontFamily: body,
                  fontSize: 21,
                  color: active ? C.ink : C.dim,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{m.name}</span>
                <span
                  style={{
                    color: C.emerald,
                    opacity: interpolate(frame, [i * 42 + 8, i * 42 + 20], [0, active ? 1 : 0.25], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                >
                  ✓ from setup card
                </span>
              </div>
            </Panel>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
