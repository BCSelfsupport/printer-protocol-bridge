/**
 * Twin Code — Training launcher (Help button + first-launch banner)
 * -----------------------------------------------------------------
 * Two entry points to the training tour:
 *
 *   1. Help button in the page header — always available, opens a small menu
 *      with "Run full tour" + per-stage replay links + completion checkmarks.
 *   2. First-launch banner — auto-shows on the operator's first ever Twin
 *      Code visit (`localStorage.twincode.training.firstLaunchSeen` flag),
 *      offering one-click into the full tour or a clean dismiss.
 *
 * The provider in TrainingProvider owns the actual tour state — these
 * components only call into it.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GraduationCap, CheckCircle2, Circle, Sparkles, X } from 'lucide-react';
import { useTraining } from './TrainingProvider';
import { TRAINING_STAGES } from './stages';

export function TrainingLauncherButton() {
  const { startStage, startFullTour, completed } = useTraining();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          title="Operator training — guided walkthrough"
          data-tour="training-launcher"
        >
          <GraduationCap className="h-4 w-4" />
          Training
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Operator training
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => startFullTour()}
          className="cursor-pointer font-semibold"
        >
          Run full end-to-end tour
          <span className="ml-auto text-[10px] text-muted-foreground">~11 min</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Replay a stage
        </DropdownMenuLabel>
        {TRAINING_STAGES.map((stage) => {
          const done = completed.has(stage.id);
          return (
            <DropdownMenuItem
              key={stage.id}
              onSelect={() => startStage(stage.id)}
              className="cursor-pointer"
            >
              {done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div className="flex flex-col">
                <span className="text-sm">{stage.title}</span>
                <span className="text-[10px] text-muted-foreground">{stage.blurb}</span>
              </div>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {stage.estimateMin}m
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One-time banner that nudges first-time operators into the full tour.
 * Dismissed by either starting the tour or clicking the close button.
 */
export function FirstLaunchBanner() {
  const { isFirstLaunch, startFullTour } = useTraining();
  const [dismissed, setDismissed] = useState(false);

  if (!isFirstLaunch || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem('twincode.training.firstLaunchSeen', '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
      <Sparkles className="h-5 w-5 shrink-0 text-primary" />
      <div className="flex-1">
        <div className="font-semibold text-primary">First time here?</div>
        <div className="text-xs text-muted-foreground">
          Twin Code bonds two printers as one logical unit. The 11-minute end-to-end tour walks you through binding, preview cross-check, preflight, and live operation — using a safe simulated pair so you don\'t need real hardware.
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => {
          startFullTour();
          setDismissed(true);
        }}
      >
        Start tour
      </Button>
      <button
        type="button"
        onClick={dismiss}
        className="rounded p-1 text-muted-foreground hover:bg-background/50"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
