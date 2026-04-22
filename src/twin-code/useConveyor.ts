import { useEffect, useState } from "react";
import { conveyorSim, type ConveyorSnapshot } from "./conveyorSim";

export function useConveyor(): ConveyorSnapshot {
  const [snap, setSnap] = useState<ConveyorSnapshot>(() => ({
    bottles: [],
    conveyorLengthMm: 1200,
    lineSpeedMmPerSec: 0,
    bpm: 0,
  }));
  useEffect(() => conveyorSim.subscribe(setSnap), []);
  return snap;
}
