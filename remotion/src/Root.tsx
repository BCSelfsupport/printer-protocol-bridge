import React from "react";
import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// 100+130+160+155+130+110 = 785 minus 5 transitions x 18 = 695
export const RemotionRoot: React.FC = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={695}
    fps={30}
    width={1920}
    height={1080}
  />
);
