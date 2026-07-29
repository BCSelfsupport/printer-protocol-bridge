import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { C, body, mono } from "../theme";
import { Headline, Panel, PanelHeader, StepBadge, Sub } from "../components/Ui";

const LOG = [
  { at: 20, t: "^NM EGG-4501  · writing message to printer" },
  { at: 40, t: "^SV          · saving to flash" },
  { at: 60, t: "^SM EGG-4501 · message selected" },
  { at: 78, t: "Width 2 · Delay 500 · Ultra Fast applied" },
];

export const SceneSave: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const press = spring({ frame: frame - 14, fps, config: { damping: 9, stiffness: 180 } });
  const done = frame > 86;
  const check = spring({ frame: frame - 88, fps, config: { damping: 10 } });

  return (
    <AbsoluteFill
      style={{ padding: "0 110px", flexDirection: "row", alignItems: "center", gap: 64 }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
        <StepBadge n="04" label="Save" />
        <Headline delay={8} size={60}>
          Save writes it to the printer
        </Headline>
        <Sub delay={16}>
          CodeSync sends the message, then saves it to flash so the HMI Save
          light clears and the code survives a power cycle.
        </Sub>

        <div
          style={{
            marginTop: 12,
            alignSelf: "flex-start",
            padding: "20px 44px",
            borderRadius: 16,
            fontFamily: body,
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: 2,
            color: "#fff",
            background: done
              ? `linear-gradient(140deg, ${C.emerald}, #0E9F76)`
              : `linear-gradient(140deg, ${C.blue}, ${C.blueDeep})`,
            boxShadow: `0 18px 50px ${done ? C.emerald : C.blue}55`,
            transform: `scale(${interpolate(press, [0, 1], [1, 0.94])}) scale(${interpolate(
              check,
              [0, 1],
              [1, 1.06]
            )})`,
          }}
        >
          {done ? "SAVED ✓" : "SAVE MESSAGE"}
        </div>
      </div>

      <Panel delay={10} style={{ width: 700 }}>
        <PanelHeader title="Printer link" right="PORT 23" />
        <div style={{ padding: 30, display: "flex", flexDirection: "column", gap: 18, minHeight: 300 }}>
          {LOG.map((l) => {
            const o = interpolate(frame, [l.at, l.at + 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={l.t}
                style={{
                  opacity: o,
                  transform: `translateY(${interpolate(o, [0, 1], [16, 0])}px)`,
                  fontFamily: mono,
                  fontSize: 20,
                  color: l.t.startsWith("^") ? C.ink : C.emerald,
                  display: "flex",
                  gap: 14,
                }}
              >
                <span style={{ color: C.emerald }}>›</span>
                {l.t}
              </div>
            );
          })}
        </div>
      </Panel>
    </AbsoluteFill>
  );
};
