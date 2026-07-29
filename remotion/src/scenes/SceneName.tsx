import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, mono } from "../theme";
import { Headline, Panel, PanelHeader, StepBadge, Sub, useEnter } from "../components/Ui";

const NAME = "EGG-4501";

export const SceneName: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = Math.max(
    0,
    Math.min(NAME.length, Math.floor(interpolate(frame, [34, 82], [0, NAME.length])))
  );
  const caret = Math.floor(frame / 8) % 2 === 0 ? 1 : 0;
  const rules = ["UPPERCASE", "MAX 20 CHARS", "DASHES OK"];

  return (
    <AbsoluteFill
      style={{
        padding: "0 110px",
        flexDirection: "row",
        alignItems: "center",
        gap: 70,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 26 }}>
        <StepBadge n="01" label="Name it" />
        <Headline delay={8} size={62}>
          Start a new message
        </Headline>
        <Sub delay={18}>
          Messages screen → New. Give it the part number or product code the line
          runs — this is the name the printer stores in flash.
        </Sub>
        <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
          {rules.map((r, i) => (
            <Chip key={r} label={r} delay={30 + i * 7} />
          ))}
        </div>
      </div>

      <Panel delay={14} style={{ width: 640 }}>
        <PanelHeader title="New Message" right="PRINTER 1" />
        <div style={{ padding: 34 }}>
          <div
            style={{
              fontFamily: body,
              fontSize: 15,
              letterSpacing: 3,
              color: C.dim,
              marginBottom: 12,
            }}
          >
            MESSAGE NAME
          </div>
          <div
            style={{
              border: `1px solid ${C.blue}`,
              boxShadow: `0 0 0 4px ${C.blue}22`,
              borderRadius: 14,
              padding: "20px 22px",
              background: "rgba(8,14,26,0.7)",
              fontFamily: mono,
              fontSize: 38,
              color: C.ink,
              letterSpacing: 3,
            }}
          >
            {NAME.slice(0, typed)}
            <span style={{ opacity: caret, color: C.emerald }}>▌</span>
          </div>
          <div
            style={{
              marginTop: 26,
              display: "flex",
              justifyContent: "space-between",
              fontFamily: body,
              fontSize: 17,
              color: C.dim,
            }}
          >
            <span>{typed}/20 characters</span>
            <span style={{ color: typed > 0 ? C.emerald : C.dim }}>
              {typed > 0 ? "Valid name" : "Waiting…"}
            </span>
          </div>
        </div>
      </Panel>
    </AbsoluteFill>
  );
};

const Chip: React.FC<{ label: string; delay: number }> = ({ label, delay }) => {
  const e = useEnter(delay, 18);
  return (
    <div
      style={{
        opacity: e,
        transform: `translateY(${interpolate(e, [0, 1], [18, 0])}px)`,
        padding: "10px 18px",
        borderRadius: 999,
        border: `1px solid ${C.stroke}`,
        background: "rgba(16,185,129,0.09)",
        color: C.emerald,
        fontFamily: body,
        fontWeight: 700,
        fontSize: 15,
        letterSpacing: 2,
      }}
    >
      {label}
    </div>
  );
};
