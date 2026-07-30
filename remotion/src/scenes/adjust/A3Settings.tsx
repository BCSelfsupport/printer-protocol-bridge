import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, mono } from "../../theme";
import { Headline, Panel, PanelHeader, StepBadge, Sub, useEnter } from "../../components/Ui";
import { DotText } from "../../components/DotText";

const FIELDS = [
  { label: "Width", value: "2", note: "stroke pitch" },
  { label: "Delay", value: "500", note: "print delay" },
  { label: "Bold", value: "1", note: "repeat drops" },
  { label: "Gap", value: "1", note: "character space" },
  { label: "Speed", value: "ULTRA FAST", note: "line speed mode" },
];

export const A3Settings: React.FC = () => {
  const frame = useCurrentFrame();
  // width dials 15 -> 2, showing the code condensing
  const w = frame < 60 ? 15 : 2;
  const morph = interpolate(frame, [60, 82], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const spacing = interpolate(morph, [0, 1], [26, 3]);

  return (
    <AbsoluteFill style={{ padding: "0 100px", flexDirection: "row", alignItems: "center", gap: 52 }}>
      <Panel delay={6} style={{ width: 560 }}>
        <PanelHeader title="Setup Card — Printer 2" right="SAVED" />
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {FIELDS.map((f, i) => (
            <Field
              key={f.label}
              {...f}
              value={f.label === "Width" ? String(w) : f.value}
              hot={f.label === "Width" && frame > 56 && frame < 100}
              delay={14 + i * 6}
            />
          ))}
        </div>
      </Panel>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
        <StepBadge n="02" label="The five settings" />
        <Headline delay={8} size={54}>
          Message settings are the defaults
        </Headline>
        <Sub delay={16}>
          Width, Delay, Bold, Gap and Speed all travel with the message. Fleet
          defaults are <b style={{ color: C.ink }}>Width 2</b>,{" "}
          <b style={{ color: C.ink }}>Delay 500</b> and{" "}
          <b style={{ color: C.ink }}>Ultra Fast</b> — so every head prints the
          same code, at the same size, at line speed.
        </Sub>

        <Panel delay={24}>
          <div
            style={{
              height: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(180deg, rgba(6,10,20,0.94), rgba(10,18,32,0.6))",
            }}
          >
            <DotText size={62} dot={5} color="#B7F0D6" letterSpacing={spacing}>
              EGG-4501
            </DotText>
          </div>
          <div
            style={{
              padding: "13px 22px",
              borderTop: `1px solid ${C.stroke}`,
              fontFamily: mono,
              fontSize: 17,
              color: C.dim,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>WIDTH {w}</span>
            <span>DELAY 500</span>
            <span style={{ color: morph > 0.9 ? C.emerald : C.dim }}>
              {morph > 0.9 ? "MATCHES FLEET" : "TOO WIDE"}
            </span>
          </div>
        </Panel>
      </div>
    </AbsoluteFill>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  note: string;
  hot?: boolean;
  delay: number;
}> = ({ label, value, note, hot, delay }) => {
  const e = useEnter(delay, 20);
  return (
    <div
      style={{
        opacity: e,
        transform: `translateX(${interpolate(e, [0, 1], [-30, 0])}px)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "15px 18px",
        borderRadius: 14,
        border: `1px solid ${hot ? C.emerald : C.stroke}`,
        background: hot ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.02)",
      }}
    >
      <div>
        <div style={{ fontFamily: body, fontSize: 22, color: C.ink }}>{label}</div>
        <div style={{ fontFamily: body, fontSize: 15, color: C.dim }}>{note}</div>
      </div>
      <div
        style={{
          fontFamily: mono,
          fontWeight: 700,
          fontSize: 24,
          color: hot ? C.emerald : C.ink,
          padding: "6px 14px",
          borderRadius: 10,
          background: "rgba(59,130,246,0.14)",
        }}
      >
        {value}
      </div>
    </div>
  );
};
