/**
 * Twin Code — Fault Recovery Banner.
 *
 * Renders a high-visibility banner whenever `faultGuard` has an active fault.
 * Lives directly above the conveyor visualization so the operator cannot miss
 * it. Provides:
 *
 *   - Plain-English fault description + side (A/B/both)
 *   - "Resume from bottle N" — clears the fault and restarts the conveyor
 *   - "End run" — leaves the conveyor stopped so the operator can act
 *
 * Design intent: when this is showing, every other control on the page is
 * subordinate. The conveyor has been auto-stopped by the guard.
 */

import { AlertOctagon, RotateCw, X, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFaultGuard } from "../useFaultGuard";
import { faultGuard, type FaultEvent } from "../faultGuard";
import { conveyorSim } from "../conveyorSim";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const SIDE_LABEL: Record<FaultEvent["side"], string> = {
  A: "Printer A (lid)",
  B: "Printer B (side)",
  both: "Both printers",
  unknown: "Unknown side",
};

const CODE_LABEL: Record<FaultEvent["code"], string> = {
  "jet-stop": "JET STOP",
  disconnect: "Printer disconnected",
  "partner-loop": "Partner-failed cascade",
  "miss-streak": "Consecutive miss-prints",
  "high-miss-rate": "High miss-rate",
};

export function FaultRecoveryBanner() {
  const guard = useFaultGuard();
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!guard.active) {
    // When there's no active fault but recent history exists, show a tiny
    // info chip so the operator knows the guard caught something earlier.
    if (guard.recent.length === 0) return null;
    return <PassiveHistoryChip count={guard.recent.length} recent={guard.recent} />;
  }

  const f = guard.active;

  const handleResume = () => {
    faultGuard.acknowledge();
    // Kick the conveyor back on — anti-duplicate is enforced by the catalog
    // ledger, so even if the operator hits resume on a phantom fault, no
    // already-printed serial can be re-issued.
    if (!conveyorSim.isRunning()) conveyorSim.start();
  };

  const handleStandDown = () => {
    faultGuard.acknowledge();
    // Leave conveyor stopped — operator wants to inspect.
  };

  return (
    <div className="rounded-md border-2 border-destructive/60 bg-destructive/10 p-3 shadow-lg">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex items-center gap-2 rounded-full bg-destructive/15 px-2.5 py-1">
          <AlertOctagon className="h-4 w-4 text-destructive" />
          <span className="text-xs font-bold uppercase tracking-wider text-destructive">
            Line auto-paused
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {CODE_LABEL[f.code]}
            <Badge variant="outline" className="text-[10px]">{SIDE_LABEL[f.side]}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">{f.message}</div>
          {f.lastBottleIndex != null && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Last bottle attempted: <span className="font-mono text-foreground">#{f.lastBottleIndex}</span>
              {" · "}
              <span title="Anti-duplicate guard prevents already-printed serials from being re-issued">
                ledger anti-duplicate active
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <HistoryPopover
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            recent={guard.recent}
          />
          <Button size="sm" variant="outline" onClick={handleStandDown}>
            <X className="mr-1 h-4 w-4" /> Acknowledge (stay paused)
          </Button>
          <Button size="sm" onClick={handleResume} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            <RotateCw className="mr-1 h-4 w-4" />
            {f.lastBottleIndex != null
              ? `Resume from bottle #${f.lastBottleIndex + 1}`
              : "Resume conveyor"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ----- Passive chip (no active fault, but recent history exists) -----

function PassiveHistoryChip({ count, recent }: { count: number; recent: FaultEvent[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-end">
      <HistoryPopover open={open} onOpenChange={setOpen} recent={recent} compactLabel={`${count} recent fault${count === 1 ? "" : "s"}`} />
    </div>
  );
}

function HistoryPopover({
  open, onOpenChange, recent, compactLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recent: FaultEvent[];
  compactLabel?: string;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]">
          <History className="h-3.5 w-3.5" /> {compactLabel ?? "History"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-xs font-semibold">
          Recent fault events
        </div>
        <ScrollArea className="max-h-72">
          {recent.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">No faults recorded.</div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((f, i) => (
                <li key={i} className="px-3 py-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{CODE_LABEL[f.code]}</span>
                    <span className="font-mono text-muted-foreground">{formatTime(f.at)}</span>
                  </div>
                  <div className="text-muted-foreground">{SIDE_LABEL[f.side]}</div>
                  <div className="mt-0.5 text-muted-foreground">{f.message}</div>
                  {f.recentReasons.length > 0 && (
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={f.recentReasons.join(" · ")}>
                      {f.recentReasons.join(" · ")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString();
}
