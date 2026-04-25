/**
 * Twin Code — Training overlay (spotlight + tooltip)
 * --------------------------------------------------
 * Renders a fixed-position scrim that punches a "spotlight" hole around the
 * targeted element via four absolutely-positioned semi-transparent rectangles
 * (top/bottom/left/right of the cutout). This avoids needing CSS clip-path
 * or `mix-blend-mode` quirks across browsers.
 *
 * The tooltip card renders next to the cutout, clamped to the viewport so
 * it can never spill off-screen on small displays.
 *
 * If the targeted element is not in the DOM (because the operator hasn't
 * opened the dialog the step references yet), the overlay falls back to a
 * centered modal asking the operator to take the prerequisite action first.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import { useTraining } from './TrainingProvider';

// Padding around the spotlight cutout so the highlighted element has air.
const SPOTLIGHT_PAD = 8;
// Tooltip dimensions used to clamp positioning.
const TOOLTIP_W = 360;
const TOOLTIP_H = 220;
const VIEWPORT_PAD = 16;

interface Rect { top: number; left: number; width: number; height: number }

export function TrainingOverlay() {
  const { stage, step, stepIndex, stepCount, next, prev, exit } = useTraining();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  // Re-measure the targeted element on every step change AND on resize/scroll
  // so the spotlight follows layout shifts (e.g. when a dialog opens behind it).
  useEffect(() => {
    if (!step) {
      setTargetRect(null);
      return;
    }
    if (!step.target) {
      setTargetRect(null);
      return;
    }

    let raf = 0;
    let cancelled = false;

    const measure = () => {
      if (cancelled || !step.target) return;
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el) {
        setTargetRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      // Bring it into view (no-op if already visible).
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    };

    // First measurement after a paint so dialog mount transitions settle.
    raf = requestAnimationFrame(measure);
    const interval = window.setInterval(measure, 250); // catches reflows
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearInterval(interval);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  if (!stage || !step) return null;

  const hasTarget = step.target !== null && targetRect !== null;
  const tooltipPos = hasTarget && targetRect
    ? clampTooltip(targetRect, step.placement ?? 'bottom')
    : null;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none" aria-live="polite">
      {/* Scrim — four rectangles around the spotlight (or one full-screen if no target). */}
      {hasTarget && targetRect ? (
        <SpotlightScrim rect={targetRect} />
      ) : (
        <div className="absolute inset-0 bg-background/85 backdrop-blur-sm pointer-events-auto" />
      )}

      {/* Highlight ring around the spotlight target. */}
      {hasTarget && targetRect && (
        <div
          className="absolute rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background pointer-events-none transition-all"
          style={{
            top: targetRect.top - SPOTLIGHT_PAD,
            left: targetRect.left - SPOTLIGHT_PAD,
            width: targetRect.width + SPOTLIGHT_PAD * 2,
            height: targetRect.height + SPOTLIGHT_PAD * 2,
          }}
        />
      )}

      {/* Tooltip card — centered if no target, anchored otherwise. */}
      <div
        className="absolute pointer-events-auto"
        style={
          tooltipPos
            ? { top: tooltipPos.top, left: tooltipPos.left, width: TOOLTIP_W }
            : {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: TOOLTIP_W,
              }
        }
      >
        <div className="rounded-lg border border-primary/40 bg-card shadow-2xl">
          {/* Header — stage + progress + close */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                {stage.title}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground">
                {stepIndex + 1} / {stepCount}
              </span>
              <button
                type="button"
                onClick={exit}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Exit training"
                title="Exit training (Esc)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="space-y-3 px-4 py-3">
            <h4 className="text-base font-semibold text-foreground">{step.title}</h4>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {step.body}
            </p>
            {step.action && (
              <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent-foreground">
                <span className="font-semibold uppercase tracking-wider opacity-80">
                  Try it ·{' '}
                </span>
                {step.action}
              </div>
            )}
            {!hasTarget && step.target && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Looking for <code className="font-mono">{step.target}</code>… open the
                relevant panel/dialog and the spotlight will follow.
              </div>
            )}
          </div>

          {/* Footer — nav controls */}
          <div className="flex items-center justify-between border-t border-border px-3 py-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={prev}
              disabled={stepIndex === 0}
              className="h-7 gap-1 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <Button size="sm" variant="ghost" onClick={exit} className="h-7 text-xs">
              Skip tour
            </Button>
            <Button size="sm" onClick={next} className="h-7 gap-1 text-xs">
              {stepIndex + 1 === stepCount ? 'Finish' : 'Next'}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders a 4-piece dimmed scrim around the spotlight rect. Each piece is
 * pointer-events-auto so clicks elsewhere on the page are blocked while the
 * tour runs (prevents accidental UI changes mid-step). The spotlight cutout
 * itself is NOT covered, so the operator can still interact with the
 * highlighted element if the step asks them to.
 */
function SpotlightScrim({ rect }: { rect: Rect }) {
  const top = rect.top - SPOTLIGHT_PAD;
  const left = rect.left - SPOTLIGHT_PAD;
  const right = rect.left + rect.width + SPOTLIGHT_PAD;
  const bottom = rect.top + rect.height + SPOTLIGHT_PAD;
  const scrim = 'absolute bg-background/80 backdrop-blur-[2px] pointer-events-auto';
  return (
    <>
      <div className={scrim} style={{ top: 0, left: 0, right: 0, height: top }} />
      <div className={scrim} style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div className={scrim} style={{ top, left: 0, width: left, height: bottom - top }} />
      <div
        className={scrim}
        style={{ top, left: right, right: 0, height: bottom - top }}
      />
    </>
  );
}

/**
 * Pick a tooltip position that respects the requested placement but stays
 * inside the viewport. Falls back to "below" when the requested side has no
 * room — operators on smaller displays should never see a clipped card.
 */
function clampTooltip(
  rect: Rect,
  preferred: 'top' | 'bottom' | 'left' | 'right' | 'center',
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const candidates: Array<{ side: typeof preferred; top: number; left: number }> = [
    {
      side: 'bottom',
      top: rect.top + rect.height + SPOTLIGHT_PAD + 8,
      left: rect.left + rect.width / 2 - TOOLTIP_W / 2,
    },
    {
      side: 'top',
      top: rect.top - TOOLTIP_H - SPOTLIGHT_PAD - 8,
      left: rect.left + rect.width / 2 - TOOLTIP_W / 2,
    },
    {
      side: 'right',
      top: rect.top + rect.height / 2 - TOOLTIP_H / 2,
      left: rect.left + rect.width + SPOTLIGHT_PAD + 8,
    },
    {
      side: 'left',
      top: rect.top + rect.height / 2 - TOOLTIP_H / 2,
      left: rect.left - TOOLTIP_W - SPOTLIGHT_PAD - 8,
    },
  ];
  const fits = (c: { top: number; left: number }) =>
    c.top >= VIEWPORT_PAD &&
    c.left >= VIEWPORT_PAD &&
    c.top + TOOLTIP_H <= vh - VIEWPORT_PAD &&
    c.left + TOOLTIP_W <= vw - VIEWPORT_PAD;

  // Honor preferred side first if it fits.
  const preferredCandidate = candidates.find((c) => c.side === preferred);
  if (preferredCandidate && fits(preferredCandidate)) {
    return { top: preferredCandidate.top, left: preferredCandidate.left };
  }
  const fallback = candidates.find((c) => fits(c)) ?? candidates[0];
  // Final clamp so we don't return negative coords on tiny viewports.
  return {
    top: Math.max(VIEWPORT_PAD, Math.min(fallback.top, vh - TOOLTIP_H - VIEWPORT_PAD)),
    left: Math.max(VIEWPORT_PAD, Math.min(fallback.left, vw - TOOLTIP_W - VIEWPORT_PAD)),
  };
}
