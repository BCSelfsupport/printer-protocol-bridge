/**
 * Twin Code — Keyboard Shortcuts.
 *
 * Global hotkeys for the TwinCode workspace + a "?" help overlay.
 * Pure presentation — fires events the parent already exposes.
 */

import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";

export interface ShortcutHandlers {
  /** Space — toggle Start/Stop on the synthetic generator. */
  toggleGenerator: () => void;
  /** D — switch to Debug view. */
  showDebug: () => void;
  /** H — switch to HUD view. */
  showHud: () => void;
  /** 1-6 — pick a Debug tab when in Debug view. */
  pickDebugTab: (idx: number) => void;
  /** Whether we're currently in the Debug view (controls 1-6 binding). */
  inDebug: boolean;
}

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Space", action: "Start / Stop synthetic generator" },
  { keys: "H", action: "Switch to HUD view" },
  { keys: "D", action: "Switch to Debug view" },
  { keys: "1 – 6", action: "Pick Debug sub-tab (Live, Conveyor, Generator, Waterfall, Distributions, Heatmaps)" },
  { keys: "?", action: "Show this shortcut overlay" },
  { keys: "Esc", action: "Close dialogs / overlay" },
];

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}

export function useTwinCodeShortcuts(h: ShortcutHandlers) {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      // "?" — toggle help overlay
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && helpOpen) {
        setHelpOpen(false);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        h.toggleGenerator();
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "h") { e.preventDefault(); h.showHud(); return; }
      if (key === "d") { e.preventDefault(); h.showDebug(); return; }
      if (h.inDebug && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        h.pickDebugTab(parseInt(e.key, 10) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h, helpOpen]);

  return { helpOpen, setHelpOpen };
}

export function ShortcutHelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="relative w-full max-w-md rounded-lg border-2 border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close shortcuts"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-4 flex items-center gap-2">
          <Keyboard className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold uppercase tracking-wider">Keyboard shortcuts</h2>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{s.action}</span>
              <kbd className="shrink-0 rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Hotkeys are disabled while typing in inputs.
        </p>
      </div>
    </div>
  );
}
