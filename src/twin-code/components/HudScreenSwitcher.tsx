/**
 * Twin Code — HUD Screen Switcher.
 *
 * Splits the operator HUD into two named "screens" the operator can toggle
 * between, with a pop-out button so each screen can live on its own monitor
 * for dual-display production lines.
 *
 *   - "throughput" : OperatorHUD (BPM gauge, status lights, last printed,
 *                    production metrics, batch progress)
 *   - "conveyor"   : ConveyorPanel (live conveyor view, controls, dry run,
 *                    speed sliders, ledger banners)
 *
 * Pop-out opens /#/twin-code/screen?view={tab} in a new window. The popped
 * window shares localStorage and the in-memory profilerBus / catalog stores
 * via BroadcastChannel — they all subscribe to the same singletons.
 */

import { useEffect, useState } from "react";
import { ExternalLink, Gauge, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperatorHUD } from "./OperatorHUD";
import { ConveyorPanel } from "./ConveyorPanel";

export type HudScreen = "throughput" | "conveyor";
const TAB_PREF_KEY = "twincode.hud.screen";

interface HudScreenSwitcherProps {
  /** When true, render only the active screen with no chrome (used by /twin-code/screen popout). */
  embedded?: boolean;
  /** Force a specific screen (overrides persisted/local tab state). */
  forceScreen?: HudScreen;
}

export function HudScreenSwitcher({ embedded = false, forceScreen }: HudScreenSwitcherProps) {
  const [screen, setScreen] = useState<HudScreen>(() => {
    if (forceScreen) return forceScreen;
    try {
      const v = localStorage.getItem(TAB_PREF_KEY);
      return v === "conveyor" ? "conveyor" : "throughput";
    } catch {
      return "throughput";
    }
  });

  useEffect(() => {
    if (forceScreen) return;
    try { localStorage.setItem(TAB_PREF_KEY, screen); } catch { /* ignore */ }
  }, [screen, forceScreen]);

  const popOut = (target: HudScreen) => {
    const url = `${window.location.origin}${window.location.pathname}#/twin-code/screen?view=${target}`;
    window.open(url, `twincode-${target}`, "popup,width=1280,height=900");
  };

  // ---- Embedded mode: single screen, no tabs ----
  if (embedded) {
    const view = forceScreen ?? screen;
    return view === "throughput" ? <OperatorHUD /> : <ConveyorPanel />;
  }

  // ---- Normal mode: tab switcher + pop-out controls ----
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-1">
        <div className="flex items-center gap-1">
          <ScreenTab
            active={screen === "throughput"}
            onClick={() => setScreen("throughput")}
            icon={<Gauge className="h-4 w-4" />}
            label="Throughput"
            sub="Big gauge · status · last serial"
          />
          <ScreenTab
            active={screen === "conveyor"}
            onClick={() => setScreen("conveyor")}
            icon={<Workflow className="h-4 w-4" />}
            label="Conveyor"
            sub="Live bottle stream · controls"
          />
        </div>
        <div className="flex items-center gap-1 pr-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-xs"
            onClick={() => popOut(screen)}
            title={`Open '${screen}' in a new window — drag it to a second monitor`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Pop out
          </Button>
        </div>
      </div>

      {screen === "throughput" ? <OperatorHUD /> : <ConveyorPanel />}
    </div>
  );
}

function ScreenTab({
  active, onClick, icon, label, sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded px-3 py-1.5 text-left transition-colors ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-muted/50"
      }`}
      aria-pressed={active}
    >
      <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-[10px] opacity-70">{sub}</span>
      </span>
    </button>
  );
}
