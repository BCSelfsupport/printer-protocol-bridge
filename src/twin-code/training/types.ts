/**
 * Twin Code — Operator Training types
 * ------------------------------------
 * The training mode is a guided overlay tour that walks operators end-to-end
 * through bonded-pair production:
 *   catalog → bind → preview cross-check → preflight → live + production run.
 *
 * Each `TrainingStage` is a self-contained playbook. Each `TrainingStep`
 * inside a stage anchors a spotlight + tooltip on a real DOM element
 * identified by `data-tour` so the operator learns on the actual UI they
 * will use, not a screenshot.
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
  | 'catalog'
  | 'bind'
  | 'preview'
  | 'preflight'
  | 'live';

export interface TrainingStep {
  id: string;
  title: string;
  body: string;
  /**
   * `data-tour` attribute value of the element to spotlight. If null, the step
   * renders as a centered modal (e.g. stage intro / outro screens).
   */
  target: string | null;
  action?: string;
  onEnter?: () => void;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export interface TrainingStage {
  id: TrainingStageId;
  title: string;
  blurb: string;
  estimateMin: number;
  steps: TrainingStep[];
}
