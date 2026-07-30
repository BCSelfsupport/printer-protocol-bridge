import React from "react";
import { mono } from "../theme";

/** Simulates a CIJ dot-matrix print by clipping a dot pattern to the glyphs. */
export const DotText: React.FC<{
  children: React.ReactNode;
  size: number;
  color?: string;
  dot?: number;
  bold?: boolean;
  letterSpacing?: number;
  opacity?: number;
}> = ({
  children,
  size,
  color = "#EAFBFF",
  dot = 4,
  bold = true,
  letterSpacing = 2,
  opacity = 1,
}) => {

  return (
    <span
      style={{
        fontFamily: mono,
        fontWeight: bold ? 700 : 400,
        fontSize: size,
        lineHeight: 1,
        letterSpacing,
        opacity,
        color: "transparent",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        backgroundImage: `radial-gradient(${color} 42%, transparent 46%)`,
        backgroundSize: `${dot}px ${dot}px`,
        filter: `drop-shadow(0 0 ${dot * 2}px ${color}55)`,
        whiteSpace: "pre",
      }}
    >
      {children}
    </span>
  );
};
