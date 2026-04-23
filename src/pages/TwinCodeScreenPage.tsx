/**
 * Twin Code — Pop-out screen page.
 *
 * Renders a single HUD screen (throughput or conveyor) with no app chrome.
 * Designed to be opened in a separate browser window so the operator can
 * place each screen on its own monitor.
 *
 * URL: /#/twin-code/screen?view=throughput|conveyor
 */

import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { HudScreenSwitcher, type HudScreen } from "@/twin-code/components/HudScreenSwitcher";
import { ProductionRunBar } from "@/twin-code/components/ProductionRunBar";
import { profilerBus } from "@/twin-code/profilerBus";

export default function TwinCodeScreenPage() {
  const [params] = useSearchParams();
  const view = useMemo<HudScreen>(() => {
    return params.get("view") === "conveyor" ? "conveyor" : "throughput";
  }, [params]);

  useEffect(() => {
    const prev = document.title;
    document.title = `Twin Code — ${view === "conveyor" ? "Conveyor" : "Throughput"}`;
    return () => { document.title = prev; };
  }, [view]);

  // Make sure a profiler session exists in the popped-out window too.
  useEffect(() => {
    if (!profilerBus.getSession()) profilerBus.startSession("Phase 1a — popout");
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        <ProductionRunBar />
        <HudScreenSwitcher embedded forceScreen={view} />
      </main>
    </div>
  );
}
