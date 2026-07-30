import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { Background } from "./components/Background";
import { A1Title } from "./scenes/adjust/A1Title";
import { A2Open } from "./scenes/adjust/A2Open";
import { A3Settings } from "./scenes/adjust/A3Settings";
import { A4Rotation } from "./scenes/adjust/A4Rotation";
import { A5Priority } from "./scenes/adjust/A5Priority";
import { A6Multi } from "./scenes/adjust/A6Multi";
import { A7Sync } from "./scenes/adjust/A7Sync";
import { A8Outro } from "./scenes/adjust/A8Outro";

const timing = springTiming({ config: { damping: 200 }, durationInFrames: 18 });

export const AdjustVideo: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={100}>
        <A1Title />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={150}>
        <A2Open />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={155}>
        <A3Settings />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={145}>
        <A4Rotation />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={140}>
        <A5Priority />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={150}>
        <A6Multi />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={130}>
        <A7Sync />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={110}>
        <A8Outro />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
