import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, display, mono } from "../../theme";
import { Headline, StepBadge, Sub, useEnter } from "../../components/Ui";

const TIERS = [
  { n: "1", title: "Message Override", desc: "Set on this message only — highest priority", color: "#F59E0B" },
  { n: "2", title: "Printer Setup Card", desc: "This printer's own Width / Delay / Rotation", color: "#3B82F6" },
  { n: "3", title: "Fleet Default", desc: "Width 2 · Delay 500 · Ultra Fast", color: "#10B981" },
  { n: "4", title: "Factory Value", desc: "Whatever the firmware ships with", color: "#64748B" },
];

export const A5Priority: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ padding: "0 110px", flexDirection: "row", alignItems: "center", gap: 70 }}>
      <div style={{ width: 560, display: "flex", flexDirection: "column", gap: 22 }}>
        <StepBadge n="04" label="Who wins" />
        <Headline delay={8} size={54}>
          One clear order of priority
        </Headline>
        <Sub delay={16}>
          CodeSync resolves every value top-down and stops at the first one it
          finds. That is why a printer with its own Width never gets stomped by
          another printer&apos;s message.
        </Sub>
        <div
          style={{
            fontFamily: mono,
            fontSize: 17,
            color: C.dim,
            border: `1px solid ${C.stroke}`,
            borderRadius: 14,
            padding: "16px 18px",
            background: "rgba(255,255,255,0.02)",
            opacity: interpolate(frame, [90, 108], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          override ?? setupCard ?? fleetDefault ?? factory
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {TIERS.map((t, i) => (
          <Tier key={t.n} {...t} delay={12 + i * 12} index={i} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Tier: React.FC<{
  n: string;
  title: string;
  desc: string;
  color: string;
  delay: number;
  index: number;
}> = ({ n, title, desc, color, delay, index }) => {
  const e = useEnter(delay, 18);
  return (
    <div
      style={{
        opacity: e,
        transform: `translateX(${interpolate(e, [0, 1], [60, index * 26])}px)`,
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "20px 24px",
        borderRadius: 18,
        border: `1px solid ${color}55`,
        background: `linear-gradient(100deg, ${color}1F, rgba(255,255,255,0.02))`,
        width: 700 - index * 26,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: color,
          color: "#04070E",
          fontFamily: display,
          fontWeight: 700,
          fontSize: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </div>
      <div>
        <div style={{ fontFamily: display, fontWeight: 600, fontSize: 25, color: C.ink }}>
          {title}
        </div>
        <div style={{ fontFamily: body, fontSize: 18, color: C.dim }}>{desc}</div>
      </div>
    </div>
  );
};
