import { loadFont as loadSora } from "@remotion/google-fonts/Sora";
import { loadFont as loadManrope } from "@remotion/google-fonts/Manrope";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const display = loadSora("normal", {
  weights: ["600", "700"],
  subsets: ["latin"],
}).fontFamily;

export const body = loadManrope("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin"],
}).fontFamily;

export const mono = loadMono("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
}).fontFamily;

export const C = {
  bg: "#070B14",
  bg2: "#0D1524",
  panel: "rgba(18,28,46,0.72)",
  stroke: "rgba(120,160,220,0.18)",
  blue: "#3B82F6",
  blueDeep: "#1D4ED8",
  emerald: "#10B981",
  ink: "#E8EFFA",
  dim: "#8FA3C0",
};
