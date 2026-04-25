/**
 * Twin Code — Operator Training stages
 * ------------------------------------
 * Authoritative content for the 4-stage end-to-end tour. Each stage maps to
 * one section of the SOW (mem://features/twin-code-sow):
 *
 *   1. bind      — TwinPairBindDialog: IP/port + per-side message + auto-create + ^LF
 *   2. preview   — TwinMessagePreview: HMI cross-check + scaling sliders
 *   3. preflight — PreflightDialog: 5-dispatch dry run + reading pass/fail
 *   4. live      — OperatorHUD + fault recovery: going LIVE, alarm, resume-from-N
 *
 * Step targets reference `data-tour` attributes declared in the components.
 * Where a step needs the operator to open a dialog/panel first, we DON'T try
 * to programmatically open it — we tell them to ("Try it · ...") and let the
 * spotlight wait for the element to appear. This keeps the tour honest:
 * operators learn the actual click sequence, not a scripted demo.
 */

import { startTrainingSimulation, stopTrainingSimulation } from './simulation';
import type { TrainingStage, TrainingStageId } from './types';

export const TRAINING_STAGES: TrainingStage[] = [
  // ---------------------------------------------------------------------------
  // Stage 1 — Bind & auto-create
  // ---------------------------------------------------------------------------
  {
    id: 'bind',
    title: 'Stage 1 · Bind & auto-create',
    blurb: 'Pair two printers as one logical unit (LID + SIDE).',
    estimateMin: 3,
    steps: [
      {
        id: 'bind-intro',
        title: 'What is a Twin Pair?',
        body:
          'Twin Code bonds two BestCode printers into a single logical unit. Side A prints a 16×16 DataMatrix on the lid, Side B prints the same 13-digit serial as readable text on the side of the bottle.\n\nEvery serial comes from the catalog and is consumed exactly once — the dispatcher fans out one ^MD command per side in parallel and only counts the cycle done when both printers acknowledge.',
        target: null,
        placement: 'center',
        onEnter: () => {
          // Spin up a safe simulated pair so the operator can practice without
          // touching real hardware. Cleaned up in the live-stage final step.
          startTrainingSimulation();
        },
      },
      {
        id: 'bind-button',
        title: 'Open the bind dialog',
        body:
          'The "Bind two printers" button is the single entry point. Once a pair is bound, the same button shows the two IPs and you can re-bind from there.',
        target: 'bind-button',
        action: 'Click "Bind two printers" to open the dialog.',
        placement: 'bottom',
      },
      {
        id: 'bind-ips',
        title: 'Side A (LID) and Side B (SIDE)',
        body:
          'Enter each printer\'s IP and port. Both must be reachable on TCP port 23 and have telnet enabled. Each printer only allows ONE telnet session at a time, so close any other CodeSync sessions to those IPs first.',
        target: 'bind-ip-fields',
        placement: 'right',
      },
      {
        id: 'bind-message-config',
        title: 'Per-side message config',
        body:
          'You pick which message name lives on each printer and which field index inside that message receives the serial.\n\nDefaults are LID/field 1 (^BD = barcode) and SIDE/field 1 (^TD = text). These map exactly to the canonical 16-dot DataMatrix and 7-dot text shapes the dispatcher fans out.',
        target: 'bind-message-config',
        placement: 'right',
      },
      {
        id: 'bind-auto-create',
        title: 'Auto-create on bind',
        body:
          'If the configured message name doesn\'t exist on the printer yet, the dispatcher will seed it with the canonical shape and ^SV (save) before selecting it. Leave this ON for fresh printers; turn it OFF if you want to fail fast on a missing message (useful for production parity audits).',
        target: 'bind-auto-create',
        placement: 'left',
      },
      {
        id: 'bind-lf-check',
        title: '^LF field-shape sanity check',
        body:
          'After ^SM selects the message, the dispatcher fetches its field list with ^LF and verifies the target field actually exists AND has the right type (text for ^TD, barcode for ^BD).\n\nIf the field is wrong type or missing, the bind aborts with a clear error — preventing a wasted batch of unscannable codes.',
        target: 'bind-confirm',
        placement: 'top',
      },
      {
        id: 'bind-finish',
        title: 'Bind confirmed',
        body:
          'Once both sides are bound, the button collapses to "Twin pair bound" with the two IPs as a badge. The dispatcher is now ready — but you still need to load a catalog and confirm the previews before going LIVE.',
        target: null,
        placement: 'center',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Stage 2 — Message preview cross-check
  // ---------------------------------------------------------------------------
  {
    id: 'preview',
    title: 'Stage 2 · Message preview cross-check',
    blurb: 'Confirm A and B are loaded with the right messages.',
    estimateMin: 2,
    steps: [
      {
        id: 'preview-intro',
        title: 'Why a visual preview?',
        body:
          'Even with the ^LF check, an operator can mistakenly bind to the wrong message name (e.g. "LID-A1" instead of "LID-B2"). The preview is your eyeball-confirmation that the messages currently selected on each printer match what you expect to print.',
        target: null,
        placement: 'center',
      },
      {
        id: 'preview-strip',
        title: 'Selected Messages strip',
        body:
          'Side A renders a real ECC200 16×16 DataMatrix of a placeholder serial (DRYRUN0000000). Side B renders the same 13 characters in dot-matrix text. Both must visually match what you see on the printer\'s HMI screen.',
        target: 'twin-message-preview',
        placement: 'bottom',
      },
      {
        id: 'preview-scale',
        title: 'Independent DM / TEXT scale sliders',
        body:
          'The two sides have very different aspect ratios (square DM vs. long text strip). Use the vertical sliders on the right to size each preview independently — drag higher to make it bigger, lower to shrink. Your preferred sizes persist across reloads.',
        target: 'twin-preview-sliders',
        placement: 'left',
      },
      {
        id: 'preview-shape-line',
        title: 'Shape line — your safety check',
        body:
          'Below each preview, the small "Shape:" line states what the dispatcher expects. If you ever see this disagree with the printer\'s HMI (e.g. it shows a QR instead of DM), STOP and re-bind — something is mismatched between the bind config and the live message.',
        target: 'twin-message-preview',
        placement: 'top',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Stage 3 — Preflight dry run
  // ---------------------------------------------------------------------------
  {
    id: 'preflight',
    title: 'Stage 3 · Preflight dry run',
    blurb: '5 real bonded dispatches before going LIVE.',
    estimateMin: 2,
    steps: [
      {
        id: 'preflight-intro',
        title: 'Preflight = 5 real dispatches, zero catalog effects',
        body:
          'The dry run sends 5 actual ^MD commands to both printers using throwaway placeholder serials. The catalog index is NOT advanced and the ledger is NOT written — you can run preflight as many times as you want without burning serials.\n\nWhat you\'re measuring: round-trip time per side, A↔B skew, and whether either printer faults out (jet not running, disconnect, timeout).',
        target: null,
        placement: 'center',
      },
      {
        id: 'preflight-button',
        title: 'Run preflight',
        body:
          'The "Dry run" button lives in the catalog/lot strip at the top of the HUD. Click it once the pair is bound — it disables itself if either side is unreachable.',
        target: 'preflight-button',
        action: 'Click "Dry run" to open the preflight dialog.',
        placement: 'bottom',
      },
      {
        id: 'preflight-pass-fail',
        title: 'Reading the verdict',
        body:
          'Each of the 5 dispatches gets a row showing wire A ms / wire B ms / skew / outcome. A green PASS means all 5 completed inside the timeout AND skew stayed within the safety band.\n\nCommon failures:\n  • JNR — jet not running (start jets on both printers, then retry)\n  • TIMEOUT — printer didn\'t ack within ~800ms (network or busy)\n  • SKEW > 50ms — wire to one side is much slower; check switch port',
        target: 'preflight-results',
        placement: 'top',
      },
      {
        id: 'preflight-finish',
        title: 'Pre-flight passed → go LIVE',
        body:
          'A passed pre-flight means the bonded pair is ready for production. Close the dialog and toggle LIVE on the catalog strip when you\'re ready.',
        target: null,
        placement: 'center',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Stage 4 — Live run + fault recovery
  // ---------------------------------------------------------------------------
  {
    id: 'live',
    title: 'Stage 4 · Live run + fault recovery',
    blurb: 'Go LIVE, watch the HUD, recover from faults.',
    estimateMin: 4,
    steps: [
      {
        id: 'live-intro',
        title: 'Going LIVE',
        body:
          'LIVE mode hands the conveyor over to the real bonded dispatcher. Every photocell trigger pulls the next serial from the catalog and fires ^MD to both printers in parallel. Once both ack, the catalog index advances and the ledger commits.',
        target: null,
        placement: 'center',
      },
      {
        id: 'live-bpm',
        title: 'BPM + line speed',
        body:
          'The big number is bottles-per-minute averaged over the last 60 seconds. The line-speed line below it is derived from your pitch + diameter + gap settings. Both pulse green during a healthy run.',
        target: 'hud-throughput',
        placement: 'right',
      },
      {
        id: 'live-last-printed',
        title: 'Last Printed serial',
        body:
          'The most recently confirmed serial is shown in huge mono so you can spot-check it against a sample bottle pulled from the line. The cycle/skew tag in the corner shows the timing of that exact print.',
        target: 'hud-last-printed',
        placement: 'left',
      },
      {
        id: 'live-status-lights',
        title: 'A/B + Mode + Yield lights',
        body:
          'Four glance-from-across-the-room lights:\n  • A · LID and B · SIDE — solid green = bound + LIVE + last cycle ok\n  • Mode — LIVE (real ^MD) vs SYNTH (simulated)\n  • Yield — printed / consumed; goes amber under 99.5%, red under 98%',
        target: 'hud-status-lights',
        placement: 'top',
      },
      {
        id: 'live-alarm',
        title: 'Audible miss-print alarm',
        body:
          'When a cycle fails (one or both sides didn\'t ack in time), the HUD flashes red and an audible alarm sounds. Toggle the alarm on/off from the top bar — but during production we strongly recommend leaving it ON.',
        target: 'hud-alarm-toggle',
        placement: 'bottom',
      },
      {
        id: 'live-fault-guard',
        title: 'Fault guard — automatic conveyor pause',
        body:
          'If the dispatcher detects a jet-stop, a disconnect, or 3+ misses in a row, the fault guard auto-pauses the conveyor. A banner appears explaining what happened and offering "Resume from bottle N" — so you don\'t double-print or skip serials when you re-engage.\n\nThe ledger persists every print, so even if the PC reboots mid-run, you can resume from exactly where you stopped.',
        target: null,
        placement: 'center',
      },
      {
        id: 'live-batch-progress',
        title: 'Batch progress + lot-locked exports',
        body:
          'The bottom strip shows printed / missed / remaining for the active batch. When you stop a production run, you get a signed CSV/JSON export with the full ledger — every serial, every outcome, every timestamp — ready for your QA records.',
        target: 'hud-batch-progress',
        placement: 'top',
      },
      {
        id: 'live-outro',
        title: 'You are trained ✓',
        body:
          'You now know the full Twin Code production flow: bind → preview → preflight → live → recover.\n\nReplay any stage from the Help button (top-right) at any time. The simulated pair we used for training has been stopped — you\'re back to the real binding.',
        target: null,
        placement: 'center',
        onEnter: () => {
          stopTrainingSimulation();
        },
      },
    ],
  },
];

export function getStage(id: TrainingStageId): TrainingStage | null {
  return TRAINING_STAGES.find((s) => s.id === id) ?? null;
}
