import { useEffect, useState } from "react";
import { liveMetrics, type LiveMetricsSnapshot } from "./liveMetrics";

export function useLiveMetrics(): LiveMetricsSnapshot {
  const [snap, setSnap] = useState<LiveMetricsSnapshot>(() => liveMetrics.getSnapshot());
  useEffect(() => liveMetrics.subscribe(setSnap), []);
  return snap;
}
