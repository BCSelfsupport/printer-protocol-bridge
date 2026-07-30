import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, body, display } from "../../theme";
import { Headline, Panel, PanelHeader, StepBadge, Sub, useEnter } from "../../components/Ui";
import { Cursor } from "../../components/Cursor";

const NAV = ["Dashboard", "Messages", "Printers", "Adjust", "Service"];

export const A2Open: React.FC = () => {
  const frame = useCurrentFrame();
  const opened = frame > 74;
  const card = useEnter(78, 22);

  return (
    <AbsoluteFill style={{ padding: "0 100px", flexDirection: "row", alignItems: "center", gap: 56 }}>
      <div style={{ width: 620, display: "flex", flexDirection: "column", gap: 22 }}>
        <StepBadge n="01" label="Where it lives" />
        <Headline delay={8} size={56}>
          Adjust opens the Printer Setup Card
        </Headline>
        <Sub delay={16}>
          Tap <b style={{ color: C.ink }}>Adjust</b> in the bottom bar and CodeSync
          takes you straight to the setup card of the printer you are working on —
          no hunting through global settings.
        </Sub>
      </div>

      <Panel delay={6} style={{ flex: 1, position: "relative" }}>
        <PanelHeader title="CodeSync — Printer 2 · LINE B" right="ONLINE" />
        <div style={{ height: 470, position: "relative", padding: 24 }}>
          {opened ? (
            <div
              style={{
                opacity: card,
                transform: `translateY(${interpolate(card, [0, 1], [40, 0])}px)`,
                border: `1px solid ${C.stroke}`,
                borderRadius: 18,
                padding: 24,
                background: "rgba(10,18,32,0.8)",
              }}
            >
              <div
                style={{
                  fontFamily: display,
                  fontWeight: 700,
                  fontSize: 26,
                  color: C.ink,
                  marginBottom: 6,
                }}
              >
                Printer Setup Card
              </div>
              <div style={{ fontFamily: body, color: C.dim, fontSize: 19, marginBottom: 20 }}>
                Per-printer print defaults
              </div>
              {["Width", "Delay", "Bold", "Gap", "Speed", "Rotation"].map((l, i) => (
                <div
                  key={l}
                  style={{
                    opacity: interpolate(frame, [86 + i * 5, 98 + i * 5], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "11px 2px",
                    borderBottom: `1px solid ${C.stroke}`,
                    fontFamily: body,
                    fontSize: 21,
                    color: C.dim,
                  }}
                >
                  <span>{l}</span>
                  <span style={{ color: C.emerald }}>●</span>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                height: "100%",
                borderRadius: 18,
                border: `1px dashed ${C.stroke}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: body,
                color: C.dim,
                fontSize: 22,
                background: "rgba(255,255,255,0.02)",
              }}
            >
              Printer 2 · EGG-4501 selected
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            borderTop: `1px solid ${C.stroke}`,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          {NAV.map((n) => {
            const active = n === "Adjust" && frame > 66;
            return (
              <div
                key={n}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "18px 0",
                  fontFamily: body,
                  fontSize: 18,
                  letterSpacing: 1,
                  color: active ? "#fff" : C.dim,
                  background: active
                    ? `linear-gradient(180deg, ${C.blue}33, ${C.blue}11)`
                    : "transparent",
                  borderTop: `2px solid ${active ? C.blue : "transparent"}`,
                }}
              >
                {n}
              </div>
            );
          })}
        </div>

        <Cursor from={[520, 120]} to={[476, 545]} start={30} travel={36} />
      </Panel>
    </AbsoluteFill>
  );
};
