/**
 * Twin Code — Operator Training types
 * ------------------------------------
 * The training mode is a guided overlay tour that walks operators end-to-end
 * through bonded-pair production: bind → preview cross-check → preflight →
 * live run + fault recovery.
 *
 * Each `TrainingStage` is a self-contained playbook (one section of the SOW).
 * Each `TrainingStep` inside a stage anchors a spotlight + tooltip on a real
 * DOM element identified by `data-tour` so the operator learns on the actual
 * UI they will use, not a screenshot.
 *
 * Why a `data-tour` attribute and not refs?
 *   - Tour steps need to survive component remounts and lazy renders (e.g.
 *     dialogs that open after Step N fires an action). Querying by attribute
 *     means the engine doesn't need any imperative wiring from the components
 *     it points at.
 *   - The attribute is a contract — once a component declares `data-tour="X"`
 *     it can be referenced from any tour stage without prop drilling.
 */

export type TrainingStageId =
  | 'bind'
  | 'preview'
  | 'preflight'
  | 'live';

export interface TrainingStep {
  /** Stable id for analytics + resume. */
  id: string;
  /** Headline shown in the tooltip card. */
  title: string;
  /** Long-form explanation. May contain inline highlights via simple markdown-ish spans. */
  body: string;
  /**
   * `data-tour` attribute value of the element to spotlight. If null, the step
   * renders as a centered modal (e.g. stage intro / outro screens).
   */
  target: string | null;
  /**
   * Optional action the operator should take before "Next" advances. The engine
   * only uses this for the descriptive label — it does NOT enforce that the
   * action ran, because operators must be able to skip ahead in any tour.
   */
  action?: string;
  /** When set, the engine will fire this side-effect right before the step renders. */
  onEnter?: () => void;
  /**
   * Tooltip placement relative to the target. Engine clamps to viewport, so
   * this is a *preferred* side, not absolute.
   */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export interface TrainingStage {
  id: TrainingStageId;
  title: string;
  /** One-liner shown in the stage menu. */
  blurb: string;
  /** Estimated minutes — sets operator expectations before they begin. */
  estimateMin: number;
  steps: TrainingStep[];
}
