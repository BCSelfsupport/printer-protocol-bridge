import React from "react";
import { useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";
import { C, body, display } from "../theme";

export const useEnter = (delay: number, damping = 200) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
};

export const StepBadge: React.FC<{ n: string; label: string; delay?: number }> =
  ({ n, label, delay = 0 }) => {
    const e = useEnter(delay);
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          opacity: e,
          transform: `translateX(${interpolate(e, [0, 1], [-40, 0])}px)`,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: `linear-gradient(140deg, ${C.blue}, ${C.blueDeep})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: display,
            fontWeight: 700,
            fontSize: 24,
            color: "#fff",
            boxShadow: `0 12px 40px ${C.blue}55`,
          }}
        >
          {n}
        </div>
        <div
          style={{
            fontFamily: body,
            fontWeight: 700,
            letterSpacing: 6,
            fontSize: 20,
            textTransform: "uppercase",
            color: C.emerald,
          }}
        >
          {label}
        </div>
      </div>
    );
  };

export const Headline: React.FC<{ children: React.ReactNode; delay?: number; size?: number }> =
  ({ children, delay = 0, size = 74 }) => {
    const e = useEnter(delay);
    return (
      <h1
        style={{
          fontFamily: display,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.05,
          margin: 0,
          color: C.ink,
          opacity: e,
          transform: `translateY(${interpolate(e, [0, 1], [46, 0])}px)`,
          filter: `blur(${interpolate(e, [0, 1], [12, 0])}px)`,
          maxWidth: 900,
        }}
      >
        {children}
      </h1>
    );
  };

export const Sub: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => {
  const e = useEnter(delay);
  return (
    <p
      style={{
        fontFamily: body,
        fontSize: 27,
        lineHeight: 1.45,
        color: C.dim,
        margin: 0,
        maxWidth: 720,
        opacity: e,
        transform: `translateY(${interpolate(e, [0, 1], [24, 0])}px)`,
      }}
    >
      {children}
    </p>
  );
};

export const Panel: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, style }) => {
  const e = useEnter(delay, 22);
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.stroke}`,
        borderRadius: 26,
        boxShadow: "0 40px 90px rgba(0,0,0,0.5)",
        overflow: "hidden",
        opacity: Math.min(1, e * 1.2),
        transform: `translateY(${interpolate(e, [0, 1], [60, 0])}px) scale(${interpolate(
          e,
          [0, 1],
          [0.94, 1]
        )})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const PanelHeader: React.FC<{ title: string; right?: string }> = ({
  title,
  right,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "16px 22px",
      borderBottom: `1px solid ${C.stroke}`,
      background: "rgba(255,255,255,0.03)",
    }}
  >
    <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
      <Dot c="#F87171" />
      <Dot c="#FBBF24" />
      <Dot c={C.emerald} />
      <span
        style={{
          fontFamily: body,
          color: C.dim,
          fontSize: 17,
          marginLeft: 14,
          letterSpacing: 1,
        }}
      >
        {title}
      </span>
    </div>
    {right ? (
      <span style={{ fontFamily: body, color: C.emerald, fontSize: 15, letterSpacing: 2 }}>
        {right}
      </span>
    ) : null}
  </div>
);

const Dot: React.FC<{ c: string }> = ({ c }) => (
  <div style={{ width: 11, height: 11, borderRadius: 99, background: c, opacity: 0.85 }} />
);
