import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, mono } from "../theme";
import { Headline, Panel, PanelHeader, StepBadge, Sub, useEnter } from "../components/Ui";
import { DotText } from "../components/DotText";

const FONTS = [
  { name: "Standard 5 High", size: 34, dot: 3, gap: 1 },
  { name: "Standard 7 High", size: 48, dot: 4, gap: 1 },
  { name: "Bold 16 High", size: 74, dot: 5, gap: 2 },
];

export const SceneFont: React.FC = () => {
  const frame = useCurrentFrame();
  const idx = frame < 50 ? 0 : frame < 98 ? 1 : 2;
  const f = FONTS[idx];

  return (
    <AbsoluteFill
      style={{ padding: "0 110px", flexDirection: "row", alignItems: "center", gap: 62 }}
    >
      <Panel delay={12} style={{ width: 470 }}>
        <PanelHeader title="Font" right="FIELD 1" />
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          {FONTS.map((ff, i) => (
            <Row key={ff.name} label={ff.name} active={idx === i} delay={18 + i * 6} />
          ))}
          <div
            style={{
              marginTop: 12,
              paddingTop: 16,
              borderTop: `1px solid ${C.stroke}`,
              display: "flex",
              justifyContent: "space-between",
              fontFamily: mono,
              fontSize: 16,
              color: C.dim,
            }}
          >
            <span>BOLD {f.dot - 2}</span>
            <span>GAP {f.gap}</span>
            <span>HEIGHT {f.size > 60 ? 16 : f.size > 40 ? 7 : 5}</span>
          </div>
        </div>
      </Panel>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
        <StepBadge n="03" label="Choose a font" />
        <Headline delay={8} size={58}>
          Type size must fit the template
        </Headline>
        <Sub delay={16}>
          CodeSync previews exactly what the head prints. If a font is taller
          than the template, it is capped — the message stays anchored to the
          bottom of the canvas, just like the HMI.
        </Sub>

        <Panel delay={22} style={{ marginTop: 8 }}>
          <div
            style={{
              height: 190,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(180deg, rgba(6,10,20,0.92), rgba(10,18,32,0.65))",
              transform: `translateY(${Math.sin(frame / 26) * 4}px)`,
            }}
          >
            <DotText size={f.size} dot={f.dot} color="#B7F0D6">
              EGG-4501
            </DotText>
          </div>
        </Panel>
      </div>
    </AbsoluteFill>
  );
};

const Row: React.FC<{ label: string; active: boolean; delay: number }> = ({
  label,
  active,
  delay,
}) => {
  const e = useEnter(delay, 20);
  return (
    <div
      style={{
        opacity: e,
        transform: `translateX(${interpolate(e, [0, 1], [-26, 0])}px)`,
        padding: "16px 18px",
        borderRadius: 14,
        border: `1px solid ${active ? C.emerald : C.stroke}`,
        background: active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.02)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: body,
        fontSize: 21,
        color: active ? C.ink : C.dim,
      }}
    >
      {label}
      <span style={{ color: C.emerald, opacity: active ? 1 : 0 }}>✓</span>
    </div>
  );
};
