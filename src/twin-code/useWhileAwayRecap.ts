/**
 * Twin Code — "while-away" recap.
 *
 * When the operator switches tabs and comes back, surface a single sonner
 * toast summarising what changed (printed delta, miss delta, run state).
 * Pure presentation — reads from existing hooks, no business logic.
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCatalog } from "../useCatalog";
import { useProductionRun } from "../useProductionRun";
import { fmtInt, fmtDuration } from "../format";

const MIN_AWAY_MS = 8_000; // ignore quick alt-tabs

export function useWhileAwayRecap() {
  const cat = useCatalog();
  const run = useProductionRun();

  const snapshotRef = useRef({
    consumed: cat.consumedCount,
    miss: cat.missCount,
    runActive: !!run.active,
    runId: run.active?.id ?? null,
  });
  const hiddenAtRef = useRef<number | null>(null);

  // Keep snapshot fresh while visible
  useEffect(() => {
    if (document.visibilityState === "visible") {
      snapshotRef.current = {
        consumed: cat.consumedCount,
        miss: cat.missCount,
        runActive: !!run.active,
        runId: run.active?.id ?? null,
      };
    }
  }, [cat.consumedCount, cat.missCount, run.active]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      // Returned to visible
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (!hiddenAt) return;
      const awayMs = Date.now() - hiddenAt;
      if (awayMs < MIN_AWAY_MS) return;

      const prev = snapshotRef.current;
      const printedDelta = (cat.consumedCount - cat.missCount) - (prev.consumed - prev.miss);
      const missDelta = cat.missCount - prev.miss;
      const runChanged = (!!run.active) !== prev.runActive
        || (run.active?.id ?? null) !== prev.runId;

      if (printedDelta <= 0 && missDelta <= 0 && !runChanged) return;

      const parts: string[] = [];
      if (printedDelta > 0) parts.push(`${fmtInt(printedDelta)} printed`);
      if (missDelta > 0) parts.push(`${fmtInt(missDelta)} miss-print${missDelta === 1 ? "" : "s"}`);
      if (runChanged) {
        if (run.active && !prev.runActive) parts.push("run started");
        if (!run.active && prev.runActive) parts.push("run completed");
      }

      const desc = parts.join(" · ") || "no activity";
      const fn = missDelta > 0 ? toast.warning : toast;
      fn(`While away · ${fmtDuration(awayMs / 1000)}`, { description: desc });
    };

    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [cat.consumedCount, cat.missCount, run.active]);
}
