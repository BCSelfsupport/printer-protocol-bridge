import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, mono } from "../../theme";
import { Headline, Panel, PanelHeader, StepBadge, Sub, useEnter } from "../../components/Ui";
import { Cursor } from "../../components/Cursor";

const PRINTERS = [
  "Printer 1 · LINE A",
  "Printer 2 · LINE B",
  "Printer 3 · LINE C",
  "Printer 4 · LINE D",
  "Printer 5 · LINE E",
  "Printer 6 · LINE F",
];

export const A6Multi: React.FC = () => {
  const frame = useCurrentFrame();
  const checkedCount = Math.max(0, Math.min(PRINTERS.length, Math.floor((frame - 26) / 7)));
  const applied = frame > 96;

  return (
    <AbsoluteFill style={{ padding: "0 100px", flexDirection: "row", alignItems: "center", gap: 54 }}>
      <div style={{ width: 590, display: "flex", flexDirection: "column", gap: 22 }}>
        <StepBadge n="05" label="Apply across the fleet" />
        <Headline delay={8} size={54}>
          Tick the printers, send it once
        </Headline>
        <Sub delay={16}>
          Select all, or just the heads you want. CodeSync writes the message and
          each printer&apos;s own adjust values in parallel — a 13-printer fleet lands
          in seconds, not minutes.
        </Sub>
        <div
          style={{
            fontFamily: mono,
            fontSize: 18,
            lineHeight: 1.9,
            color: C.dim,
            border: `1px solid ${C.stroke}`,
            borderRadius: 16,
            padding: "16px 20px",
            background: "rgba(0,0,0,0.28)",
          }}
        >
          {["^NM  write message", "^SV  save to flash", "^SM  select on printer"].map((l, i) => (
            <div
              key={l}
              style={{
                opacity: interpolate(frame, [98 + i * 9, 110 + i * 9], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                color: i === 1 ? C.emerald : C.dim,
              }}
            >
              {l}
            </div>
          ))}
        </div>
      </div>

      <Panel delay={6} style={{ flex: 1, position: "relative" }}>
        <PanelHeader
          title="Apply to printers"
          right={applied ? "SENT" : `${checkedCount} SELECTED`}
        />
        <div
          style={{
            padding: 22,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {PRINTERS.map((p, i) => (
            <Row key={p} label={p} checked={i < checkedCount} sent={applied} delay={10 + i * 4} />
          ))}
        </div>
        <div
          style={{
            margin: "6px 22px 22px",
            padding: "16px 0",
            borderRadius: 14,
            textAlign: "center",
            fontFamily: body,
            fontSize: 21,
            letterSpacing: 1,
            color: "#fff",
            background: applied
              ? `linear-gradient(100deg, ${C.emerald}, #0E9C74)`
              : `linear-gradient(100deg, ${C.blue}, ${C.blueDeep})`,
            boxShadow: `0 16px 44px ${applied ? C.emerald : C.blue}44`,
          }}
        >
          {applied ? "Applied to 6 printers ✓" : "Apply to selected"}
        </div>
        <Cursor from={[520, 90]} to={[300, 470]} start={68} travel={28} />
      </Panel>
    </AbsoluteFill>
  );
};

const Row: React.FC<{ label: string; checked: boolean; sent: boolean; delay: number }> = ({
  label,
  checked,
  sent,
  delay,
}) => {
  const e = useEnter(delay, 20);
  return (
    <div
      style={{
        opacity: e,
        transform: `translateY(${interpolate(e, [0, 1], [22, 0])}px)`,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 13,
        border: `1px solid ${checked ? C.emerald : C.stroke}`,
        background: checked ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.02)",
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          border: `2px solid ${checked ? C.emerald : C.dim}`,
          background: checked ? C.emerald : "transparent",
          color: "#04140E",
          fontSize: 17,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? "✓" : ""}
      </div>
      <div style={{ fontFamily: body, fontSize: 19, color: checked ? C.ink : C.dim }}>
        {label}
      </div>
      {sent && checked ? (
        <div style={{ marginLeft: "auto", fontFamily: mono, fontSize: 14, color: C.emerald }}>
          OK
        </div>
      ) : null}
    </div>
  );
};
