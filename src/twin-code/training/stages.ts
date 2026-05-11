/**
 * Twin Code — Operator Training stages (final-build aligned)
 * ----------------------------------------------------------
 * Five stages mirroring the real production path in the shipping build:
 *
 *   1. catalog   — Load CSV, low-warning threshold, ledger persistence
 *   2. bind      — TwinPairBindDialog: IP/port + per-side message + auto-create + ^LF
 *   3. preview   — TwinMessagePreview (collapsible): HMI cross-check + scaling sliders
 *   4. preflight — PreflightDialog: 5-dispatch dry run + reading pass/fail
 *   5. live      — LIVE toggle, OperatorHUD, Production Run (lot/operator,
 *                  signed CSV/JSON/Envelope exports), fault recovery
 *
 * Step targets reference `data-tour` attributes declared in the components.
 * Where a step needs the operator to open a dialog/panel first, we DON'T try
 * to programmatically open it — we tell them to ("Try it · ...") and let the
 * spotlight wait for the element to appear.
 *
 * The training simulation loads the bundled 1000-serial sample CSV so every
 * artifact the operator generates during the tour (signed exports, envelope
 * report, ledger fingerprint) is real practice output.
 */

import { startTrainingSimulation, stopTrainingSimulation } from './simulation';
import type { TrainingStage, TrainingStageId } from './types';

export const TRAINING_STAGES: TrainingStage[] = [
  // ---------------------------------------------------------------------------
  // Stage 1 — Catalog
  // ---------------------------------------------------------------------------
  {
    id: 'catalog',
    title: 'Stage 1 · Load the catalog',
    blurb: 'CSV in, ledger armed, low-stock threshold set.',
    estimateMin: 3,
    steps: [
      {
        id: 'catalog-intro',
        title: 'Catalog = the source of truth',
        body:
          'Twin Code never invents serials. Every code printed comes from a CSV catalog you load up-front, and every dispense is written to a tamper-evident ledger so the same serial can NEVER print twice.\n\nFor this tour we\'ll load a bundled 1000-serial sample CSV so you can practice the full Catalog → Bind → Preview → Pre-flight → LIVE → Production Run path without touching real printers or burning real serials.',
        target: null,
        placement: 'center',
        onEnter: () => {
          // Loads /sample-data/twin-code-serials-1000.csv into the catalog
          // unless the operator already has a real CSV staged.
          void startTrainingSimulation();
        },
      },
      {
        id: 'catalog-strip',
        title: 'The catalog strip',
        body:
          'This is the single horizontal control row for everything pre-run: load CSV, LIVE toggle, low-stock warn threshold, Pre-flight, and Start production run all live here. Once you bind a pair and load a catalog, this is your entire pre-run cockpit.',
        target: 'catalog-strip',
        placement: 'bottom',
      },
      {
        id: 'catalog-upload',
        title: 'Load CSV catalog',
        body:
          'Click here (or drag-drop a CSV onto the strip) to open the column picker. The picker shows a preview of your rows so you can confirm which column holds the serial — it auto-detects 13-digit columns.\n\nThe sample CSV has been pre-loaded for this tour; in production you\'d drop your own here.',
        target: 'catalog-upload',
        placement: 'bottom',
      },
      {
        id: 'catalog-counters',
        title: 'Live counters + ledger fingerprint',
        body:
          'Catalog total / Remaining / Printed / Miss-prints update live as the line runs. Below the row, the ledger fingerprint and "auto-saved" timestamp confirm your audit trail is being persisted to disk every 250ms — survives PC reboot, Electron crash, accidental refresh.',
        target: 'catalog-counters',
        placement: 'top',
      },
      {
        id: 'catalog-finish',
        title: 'Catalog loaded ✓',
        body:
          'With a catalog loaded, the dispatcher knows what to print. Next we bind the pair so it knows where to print.',
        target: null,
        placement: 'center',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Stage 2 — Bind & auto-create
  // ---------------------------------------------------------------------------
  {
    id: 'bind',
    title: 'Stage 2 · Bind & auto-create',
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
          'Once both sides are bound, the button collapses to "Twin pair bound" with the two IPs as a badge. The dispatcher is now ready — but you still need to confirm the previews and pass pre-flight before going LIVE.',
        target: null,
        placement: 'center',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Stage 3 — Message preview cross-check
  // ---------------------------------------------------------------------------
  {
    id: 'preview',
    title: 'Stage 3 · Message preview cross-check',
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
        id: 'preview-expand',
        title: 'Expand "Selected messages"',
        body:
          'The preview lives inside a collapsible panel at the top of the HUD — collapsed by default to save vertical space on small monitors. Click the chevron row to expand it whenever you want to do a visual cross-check.',
        target: 'hud-preview-collapsible',
        action: 'Click the "Selected messages" row to expand the previews.',
        placement: 'bottom',
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
  // Stage 4 — Pre-flight dry run
  // ---------------------------------------------------------------------------
  {
    id: 'preflight',
    title: 'Stage 4 · Pre-flight dry run',
    blurb: '5 real bonded dispatches before going LIVE.',
    estimateMin: 2,
    steps: [
      {
        id: 'preflight-intro',
        title: 'Pre-flight = 5 real dispatches, zero catalog effects',
        body:
          'Pre-flight sends 5 actual ^MD commands to both printers using throwaway placeholder serials. The catalog index is NOT advanced and the ledger is NOT written — you can run pre-flight as many times as you want without burning serials.\n\nWhat you\'re measuring: round-trip time per side, A↔B skew, and whether either printer faults out (jet not running, disconnect, timeout).',
        target: null,
        placement: 'center',
      },
      {
        id: 'preflight-button',
        title: 'Run Pre-flight',
        body:
          'The "Pre-flight" button lives on the catalog strip, right next to "Start production run". It\'s also surfaced inside the Start Run dialog itself so you have a second chance to retest from the lot-naming step.\n\nIt disables itself if no catalog is loaded.',
        target: 'preflight-button',
        action: 'Click "Pre-flight" to open the dialog.',
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
        title: 'Pre-flight passed → ready for LIVE',
        body:
          'A passed pre-flight means the bonded pair is ready for production. Close the dialog and toggle LIVE on the catalog strip when you\'re ready.',
        target: null,
        placement: 'center',
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Stage 5 — LIVE + Production Run + fault recovery
  // ---------------------------------------------------------------------------
  {
    id: 'live',
    title: 'Stage 5 · LIVE + Production Run',
    blurb: 'Engage LIVE, start a lot, watch the HUD, recover from faults, export.',
    estimateMin: 5,
    steps: [
      {
        id: 'live-intro',
        title: 'LIVE = real bonded ^MD',
        body:
          'Flipping LIVE ON hands the line over to the real bonded dispatcher. Every Print Go (real photocell trip in PRODUCTION mode, or a software ^PT pulse in AUTO mode) pulls the next serial from the catalog and fires ^MD to both printers in parallel. Once both ack, the catalog index advances and the ledger commits.',
        target: null,
        placement: 'center',
      },
      {
        id: 'live-toggle',
        title: 'LIVE / SYNTH toggle',
        body:
          'The LIVE switch on the catalog strip is the line-engagement gate. SYNTH = synthetic timings (good for showing the HUD without printing), LIVE = real bonded ^MD to both printers.\n\nThe switch is disabled until a twin pair is bound — that\'s the safety interlock that prevents you from "going LIVE" with no actual printers attached.',
        target: 'live-toggle',
        placement: 'bottom',
      },
      {
        id: 'print-go-mode',
        title: 'Print Go source — AUTO (test) vs PRODUCTION',
        body:
          'Right next to LIVE is the Print Go source toggle. This is the single most important production switch on the page:\n\n  • AUTO (sky) — software fires Print Go (^PT) immediately after both sides ACK ^MD. Use this for bench testing, demos, training, and pre-flight where there is no bottle on the line.\n\n  • PRODUCTION (amber) — software pre-loads the next serial with ^MD but does NOT fire ^PT. The physical photocell wired into the printer\'s input fires the actual print, exactly when a real bottle crosses the beam.\n\nFor a real production line you MUST be in PRODUCTION before flipping LIVE — otherwise every ^MD will print into thin air the moment the printer acks.',
        target: 'print-go-mode',
        placement: 'bottom',
      },
      {
        id: 'live-line-conditions',
        title: 'Line conditions — set in AUTO, measured in PRODUCTION',
        body:
          'The Line Conditions row behaves differently depending on the Print Go source:\n\n  • In AUTO, you enter ft/min, pitch and BPM by hand — the simulator uses these to pace synthetic photocell pulses.\n\n  • In PRODUCTION, ft/min, BPM and interval go read-only and update LIVE from the actual photocell trips arriving on the wire (rolling 12-sample window). Pitch stays operator-set because we still need it to derive belt speed from a photocell-only signal.\n\nIf you see "—" or a stale indicator in PRODUCTION, the line is stopped or no bottle has crossed yet.',
        target: 'line-conditions',
        placement: 'top',
      },
      {
        id: 'live-start-run',
        title: 'Start production run',
        body:
          'Going LIVE lets the line print, but a Production Run wraps the prints into a named, auditable batch. This is what gives you the signed CSV/JSON/Envelope artifacts QA needs.\n\nYou cannot start a run without LIVE engaged AND a catalog loaded.',
        target: 'start-run-button',
        action: 'Click "Start production run" to open the dialog.',
        placement: 'bottom',
      },
      {
        id: 'live-run-dialog',
        title: 'Lot, operator, run length',
        body:
          'The Start Run dialog asks for:\n  • Lot # / batch ID (auto-suggested as LOT-YYYYMMDD-HHMM)\n  • Operator name (remembered across runs)\n  • Optional run length — auto-stops + auto-exports when printed+missed reaches N\n\nPre-flight checks at the top show catalog/pair/LIVE status. Operator is remembered so the next shift just types their lot.',
        target: null,
        placement: 'center',
      },
      {
        id: 'live-active-banner',
        title: 'Active production run banner',
        body:
          'Once started, this banner replaces the catalog counter strip. Lot, operator, elapsed clock, printed/missed/yield counters update live. Auto Print Go controls live INSIDE the banner so you can\'t accidentally start a run with the conveyor stopped.',
        target: 'production-run-active',
        placement: 'bottom',
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
        title: 'Batch progress strip',
        body:
          'The bottom strip shows printed / missed / remaining for the active batch. When the run hits its target count (or you hit Stop & export), it auto-finalises and downloads three artifacts: CSV, signed JSON, and HTML envelope report.',
        target: 'hud-batch-progress',
        placement: 'top',
      },
      {
        id: 'live-outro',
        title: 'You are trained ✓',
        body:
          'You now know the full Twin Code production flow:\n  Catalog → Bind → Preview → Pre-flight → LIVE → Production Run → Signed exports → Fault recovery.\n\nReplay any stage from the Training button at the top of the page. The sample catalog we loaded for this tour is being cleared now — you\'re back to a clean slate, ready for your real CSV.',
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
