/**
 * Twin Code — Training tour engine
 * --------------------------------
 * Provides a context that any Twin Code component can read (`useTraining`) to
 * (a) launch a stage, (b) check whether a step is currently active so it can
 * highlight itself, or (c) advance/exit the tour from a custom button.
 *
 * Rendering model:
 *   - A single `<TrainingOverlay />` is mounted at the page root.
 *   - When a step is active it queries `[data-tour="<target>"]`, draws a
 *     spotlight cutout around that element, and floats a tooltip card next
 *     to it with title/body/action plus Prev/Next/Skip controls.
 *   - When `target` is null the engine renders a centered "stage card" used
 *     for intros/outros — useful for explaining what's about to happen
 *     without pointing at any one element.
 *
 * Why not a third-party tour lib (intro.js, shepherd, driver.js)?
 *   - They all ship their own theming + DOM cutout strategy that fights with
 *     our design tokens. We need 100% theme parity (HSL semantic tokens) and
 *     pixel-perfect alignment with our existing dialog stack — easier to own
 *     ~150 lines than to override their CSS.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TRAINING_STAGES, getStage } from './stages';
import type { TrainingStage, TrainingStageId, TrainingStep } from './types';

const FIRST_LAUNCH_KEY = 'twincode.training.firstLaunchSeen';
const COMPLETED_STAGES_KEY = 'twincode.training.completedStages';

interface TrainingContextValue {
  /** Active stage, if a tour is running. */
  stage: TrainingStage | null;
  /** Active step within the current stage. */
  step: TrainingStep | null;
  /** 0-based step index within the stage. */
  stepIndex: number;
  /** Total steps in the active stage (or 0 if no tour running). */
  stepCount: number;
  /** Set of stage IDs the operator has finished at least once. */
  completed: Set<TrainingStageId>;
  /** Whether this is the operator's first ever Twin Code visit. */
  isFirstLaunch: boolean;
  /** When true, the spotlight/scrim is hidden so the operator can freely try the step. */
  paused: boolean;
  startStage: (id: TrainingStageId) => void;
  startFullTour: () => void;
  next: () => void;
  prev: () => void;
  exit: () => void;
  /** Pause the tour — overlay hides, a floating "Resume" pill is shown by the overlay. */
  pause: () => void;
  /** Resume a paused tour at the same step. */
  resume: () => void;
}

const TrainingContext = createContext<TrainingContextValue | null>(null);

export function useTraining(): TrainingContextValue {
  const ctx = useContext(TrainingContext);
  if (!ctx) throw new Error('useTraining must be used inside <TrainingProvider>');
  return ctx;
}

export function TrainingProvider({ children }: { children: ReactNode }) {
  const [activeStageId, setActiveStageId] = useState<TrainingStageId | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  /** Stage queue — populated when the operator runs the full tour, drained on each stage finish. */
  const queueRef = useRef<TrainingStageId[]>([]);

  const [completed, setCompleted] = useState<Set<TrainingStageId>>(() => {
    try {
      const raw = localStorage.getItem(COMPLETED_STAGES_KEY);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw) as TrainingStageId[]);
    } catch {
      return new Set();
    }
  });

  const isFirstLaunch = useMemo(() => {
    try {
      return localStorage.getItem(FIRST_LAUNCH_KEY) !== '1';
    } catch {
      return false;
    }
  }, []);

  // Mark first-launch consumed the moment any tour runs OR the operator
  // explicitly dismisses — the dismiss path is wired in by callers.
  const consumeFirstLaunch = useCallback(() => {
    try { localStorage.setItem(FIRST_LAUNCH_KEY, '1'); } catch { /* ignore */ }
  }, []);

  const persistCompleted = useCallback((next: Set<TrainingStageId>) => {
    try {
      localStorage.setItem(COMPLETED_STAGES_KEY, JSON.stringify([...next]));
    } catch { /* ignore */ }
  }, []);

  const startStage = useCallback((id: TrainingStageId) => {
    consumeFirstLaunch();
    queueRef.current = []; // single-stage run, no queue
    setActiveStageId(id);
    setStepIndex(0);
  }, [consumeFirstLaunch]);

  const startFullTour = useCallback(() => {
    consumeFirstLaunch();
    const order: TrainingStageId[] = ['bind', 'preview', 'preflight', 'live'];
    queueRef.current = order.slice(1); // first stage runs immediately
    setActiveStageId(order[0]);
    setStepIndex(0);
  }, [consumeFirstLaunch]);

  const finishCurrentStage = useCallback(() => {
    if (activeStageId) {
      const next = new Set(completed);
      next.add(activeStageId);
      setCompleted(next);
      persistCompleted(next);
    }
    // Advance to the next stage in the full-tour queue, if any.
    const nextStageId = queueRef.current.shift();
    if (nextStageId) {
      setActiveStageId(nextStageId);
      setStepIndex(0);
    } else {
      setActiveStageId(null);
      setStepIndex(0);
    }
  }, [activeStageId, completed, persistCompleted]);

  const stage = activeStageId ? getStage(activeStageId) : null;
  const stepCount = stage?.steps.length ?? 0;
  const step = stage?.steps[stepIndex] ?? null;

  // Fire onEnter side-effects whenever the active step changes.
  useEffect(() => {
    if (step?.onEnter) {
      try { step.onEnter(); } catch (err) { console.warn('[training] onEnter failed', err); }
    }
  }, [step]);

  const next = useCallback(() => {
    if (!stage) return;
    if (stepIndex + 1 < stage.steps.length) {
      setStepIndex((i) => i + 1);
    } else {
      finishCurrentStage();
    }
  }, [stage, stepIndex, finishCurrentStage]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const exit = useCallback(() => {
    queueRef.current = [];
    setActiveStageId(null);
    setStepIndex(0);
  }, []);

  // Esc to exit any active tour — operators must always be able to bail.
  useEffect(() => {
    if (!stage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exit();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, exit, next, prev]);

  const value: TrainingContextValue = {
    stage,
    step,
    stepIndex,
    stepCount,
    completed,
    isFirstLaunch,
    startStage,
    startFullTour,
    next,
    prev,
    exit,
  };

  return (
    <TrainingContext.Provider value={value}>
      {children}
    </TrainingContext.Provider>
  );
}

export const TRAINING_STAGE_LIST = TRAINING_STAGES;
