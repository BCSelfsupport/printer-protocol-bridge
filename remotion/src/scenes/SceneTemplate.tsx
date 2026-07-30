import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, mono } from "../theme";
import { Headline, Panel, PanelHeader, StepBadge, Sub } from "../components/Ui";
import { DotText } from "../components/DotText";

type T = { id: string; label: string; note: string; lines: string[]; size: number };

const TEMPLATES: T[] = [
  { id: "1L16", label: "1 Line × 16 dot", note: "Fast single-line code", lines: ["EGG-4501"], size: 62 },
  { id: "2L7", label: "2 Line × 7 dot", note: "1-dot gap between lines", lines: ["EGG-4501", "EXP 12/26"], size: 34 },
  { id: "1L25", label: "1 Line × 25 dot", note: "Tall, high-visibility", lines: ["EGG-4501"], size: 86 },
];

export const SceneTemplate: React.FC = () => {
  const frame = useCurrentFrame();
  const active = frame < 52 ? 0 : frame < 100 ? 1 : 2;

  return (
    <AbsoluteFill style={{ padding: "0 110px", justifyContent: "center", gap: 34 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <StepBadge n="02" label="Pick a template" />
          <Headline delay={8} size={58}>
            The template sets the print height
          </Headline>
        </div>
        <div style={{ width: 470, paddingBottom: 6 }}>
          <Sub delay={16}>
            Choose the line layout that matches the head — the printer's dot
            height caps how tall the message can be.
          </Sub>
        </div>
      </div>

      <div style={{ display: "flex", gap: 26 }}>
        {TEMPLATES.map((t, i) => (
          <Card key={t.id} t={t} active={active === i} delay={20 + i * 8} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Card: React.FC<{ t: T; active: boolean; delay: number }> = ({ t, active, delay }) => {
  const frame = useCurrentFrame();
  const glow = active ? 1 : 0.25;
  const lift = active ? -14 : 0;
  const sweep = interpolate(frame % 90, [0, 90], [-30, 130]);

  return (
    <Panel
      delay={delay}
      style={{
        flex: 1,
        transform: `translateY(${lift}px)`,
        border: `1px solid ${active ? C.blue : C.stroke}`,
        boxShadow: active
          ? `0 30px 80px ${C.blue}44, 0 0 0 4px ${C.blue}1f`
          : "0 20px 50px rgba(0,0,0,0.45)",
      }}
    >
      <PanelHeader title={t.label} right={active ? "SELECTED" : ""} />
      <div
        style={{
          height: 250,
          background:
            "linear-gradient(180deg, rgba(6,10,20,0.9), rgba(10,18,32,0.7))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: t.lines.length > 1 ? 10 : 0,
          position: "relative",
          opacity: 0.35 + glow * 0.65,
        }}
      >
        {active ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(100deg, transparent ${sweep - 18}%, ${C.emerald}22 ${sweep}%, transparent ${sweep + 18}%)`,
            }}
          />
        ) : null}
        {t.lines.map((l) => (
          <DotText key={l} size={t.size} dot={t.size > 60 ? 5 : 3}>
            {l}
          </DotText>
        ))}
      </div>
      <div style={{ padding: "18px 22px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: body, color: C.dim, fontSize: 17 }}>{t.note}</span>
        <span style={{ fontFamily: mono, color: active ? C.emerald : C.dim, fontSize: 16 }}>
          {t.id}
        </span>
      </div>
    </Panel>
  );
};
