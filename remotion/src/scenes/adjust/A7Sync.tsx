import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, mono } from "../../theme";
import { Headline, Panel, PanelHeader, StepBadge, Sub } from "../../components/Ui";

export const A7Sync: React.FC = () => {
  const frame = useCurrentFrame();
  const pulled = frame > 62;
  const flow = interpolate(frame, [46, 66], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ padding: "0 110px", justifyContent: "center", gap: 30 }}>
      <StepBadge n="06" label="Changes made at the HMI" />
      <Headline delay={8} size={54}>
        Sync Adjust pulls the printer&apos;s values back
      </Headline>
      <Sub delay={14}>
        If an operator tweaks Width or Delay on the printer and saves, hit Sync
        Adjust — CodeSync reads the live values back so the next send doesn&apos;t
        undo their work.
      </Sub>

      <div style={{ display: "flex", alignItems: "center", gap: 34, marginTop: 12 }}>
        <Panel delay={18} style={{ flex: 1 }}>
          <PanelHeader title="Printer HMI" right="EDITED" />
          <div style={{ padding: 26, fontFamily: mono, fontSize: 25, color: C.ink }}>
            <Line k="WIDTH" v="4" hot />
            <Line k="DELAY" v="620" hot />
            <Line k="BOLD" v="1" />
            <Line k="GAP" v="1" />
          </div>
        </Panel>

        <div style={{ width: 260, position: "relative", height: 90 }}>
          <div
            style={{
              position: "absolute",
              top: 44,
              left: 0,
              right: 0,
              height: 2,
              background: C.stroke,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 42,
              right: 0,
              width: interpolate(flow, [0, 1], [0, 260]),
              height: 6,
              borderRadius: 99,
              background: `linear-gradient(270deg, ${C.emerald}, transparent)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              width: "100%",
              textAlign: "center",
              fontFamily: body,
              fontSize: 19,
              letterSpacing: 3,
              color: pulled ? C.emerald : C.dim,
            }}
          >
            SYNC ADJUST
          </div>
        </div>

        <Panel delay={24} style={{ flex: 1 }}>
          <PanelHeader title="CodeSync — Setup Card" right={pulled ? "UPDATED" : "STALE"} />
          <div style={{ padding: 26, fontFamily: mono, fontSize: 25, color: C.ink }}>
            <Line k="WIDTH" v={pulled ? "4" : "2"} hot={pulled} />
            <Line k="DELAY" v={pulled ? "620" : "500"} hot={pulled} />
            <Line k="BOLD" v="1" />
            <Line k="GAP" v="1" />
          </div>
        </Panel>
      </div>
    </AbsoluteFill>
  );
};

const Line: React.FC<{ k: string; v: string; hot?: boolean }> = ({ k, v, hot }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "11px 0",
      borderBottom: `1px solid ${C.stroke}`,
      color: hot ? C.emerald : C.dim,
    }}
  >
    <span>{k}</span>
    <span style={{ color: hot ? C.emerald : C.ink, fontWeight: 700 }}>{v}</span>
  </div>
);
