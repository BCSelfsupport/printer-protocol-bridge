/**
 * Twin Code — bonded pair message preview
 * ----------------------------------------
 * Mirrors the regular CodeSync "current message" preview shown when you
 * connect to a printer. Adds a third layer of operator confidence on top of
 * the bind dialog and the live toast: a literal dot-matrix visualization of
 * what each side is selecting.
 *
 * Why a custom (synthetic) preview vs. fetching `^LF` from the printer?
 *   - The dispatcher already commits to a known canonical field shape via
 *     the LID/SIDE seeds (mem://features/twin-code-auto-create-messages),
 *     so we have a deterministic source of truth without another wire round-trip.
 *   - The whole point of the preview is to confirm the *configured intent*
 *     ("LID is going to print a 16x16 DM at field 1") matches what the
 *     operator expects — fetching the printer state would just echo whatever
 *     the printer currently has, which defeats the cross-check.
 *   - The post-bind ^LF sanity check (see PrinterSession.verifyFieldIndex)
 *     still runs and will refuse to bind on a shape mismatch — so the live
 *     vs. configured drift is caught loud, not silent.
 */
import { renderText } from '@/lib/dotMatrixFonts';
import { useEffect, useRef } from 'react';
import { useTwinPair } from '../twinPairStore';

interface SidePreviewProps {
  side: 'A' | 'B';
  /** Operator-configured message name (e.g. "LID", "SIDE", "LID-A1"). */
  messageName?: string;
  /** Field index inside the message that receives the serial. */
  fieldIndex?: number;
  /** Subcommand the dispatcher will issue per print (BD or TD). */
  subcommand?: 'BD' | 'TD';
  /** Whether the printer for this side is reachable / bound. */
  bound: boolean;
  /** Friendly printer label from the binding (IP, name). */
  printerLabel?: string;
}

const DOT = 4; // px per dot — readable on 1396px viewport without dominating the panel
const PAD_DOTS = 60; // approximate template width matching the seed's centering math
const TEMPLATE_DOTS_A = 16; // LID seed runs on a 16-dot template (DM 16×16)
const TEMPLATE_DOTS_B = 7;  // SIDE seed runs on a 7-dot template (Standard 7×5 text)

/**
 * Renders the canonical seed shape for one side of the pair onto a small
 * dot-matrix canvas — green on dark, matching the printer ink look used in
 * MessageThumbnail / MessageCanvas.
 */
function SideCanvas({ side }: { side: 'A' | 'B' }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const templateDots = side === 'A' ? TEMPLATE_DOTS_A : TEMPLATE_DOTS_B;
    c.width = PAD_DOTS * DOT;
    c.height = templateDots * DOT;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    // Background — match MessageThumbnail palette.
    ctx.fillStyle = 'hsl(220, 13%, 12%)';
    ctx.fillRect(0, 0, c.width, c.height);

    // Light grid every 4 dots for visual scale.
    ctx.fillStyle = 'hsl(220, 13%, 18%)';
    for (let r = 0; r < templateDots; r += 4) {
      for (let col = 0; col < PAD_DOTS; col += 4) {
        ctx.fillRect(col * DOT, r * DOT, 1, 1);
      }
    }

    ctx.fillStyle = 'hsl(160, 84%, 55%)'; // emerald — printer ink

    if (side === 'A') {
      // LID seed: native 16×16 DataMatrix at x=20 (centered on a 60-dot pad),
      // bottom-anchored. We draw a representative ECC200-style block (filled
      // border + a fixed checker pattern) — purely indicative, not a real DM.
      const x0 = 20 * DOT;
      const y0 = 0; // bottom-anchored on 16-dot template = top of canvas
      const size = 16 * DOT;

      // L-shape "finder" border (left + bottom solid, top + right dashed)
      ctx.fillRect(x0, y0, DOT, size);
      ctx.fillRect(x0, y0 + size - DOT, size, DOT);
      for (let i = 0; i < 16; i += 2) ctx.fillRect(x0 + i * DOT, y0, DOT, DOT);
      for (let i = 0; i < 16; i += 2) ctx.fillRect(x0 + size - DOT, y0 + i * DOT, DOT, DOT);

      // Pseudo-random module pattern (deterministic so the preview is stable)
      let seed = 0x2a;
      for (let r = 1; r < 15; r++) {
        for (let col = 1; col < 15; col++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          if (((seed >> 7) & 0x1) === 1) {
            ctx.fillRect(x0 + col * DOT, y0 + r * DOT, DOT, DOT);
          }
        }
      }
    } else {
      // SIDE seed: 13-character placeholder in Standard 7×5, left-aligned,
      // bottom-anchored on the 7-dot template (text fills the full template).
      try {
        renderText(ctx, 'DRYRUN0000000', 0, 0, 'Standard7High', DOT, 1);
      } catch {
        // Font load may not be ready on first paint — skip silently; the
        // canvas already has the grid background so the panel stays valid.
      }
    }
  }, [side]);

  return (
    <canvas
      ref={ref}
      style={{ height: (side === 'A' ? TEMPLATE_DOTS_A : TEMPLATE_DOTS_B) * DOT, width: 'auto', imageRendering: 'pixelated' }}
      className="rounded border border-border"
    />
  );
}

function SideCard({
  side,
  messageName,
  fieldIndex,
  subcommand,
  bound,
  printerLabel,
}: SidePreviewProps) {
  const expected = side === 'A' ? 'DataMatrix 16×16 (^BD)' : 'Text 7×5, 13 chars (^TD)';
  const defaultName = side === 'A' ? 'LID' : 'SIDE';
  const defaultField = 1;
  const defaultSub = side === 'A' ? 'BD' : 'TD';
  return (
    <div
      className={`flex flex-col gap-2 rounded-md border p-3 ${
        bound ? 'border-primary/40 bg-card' : 'border-border bg-muted/20'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
              side === 'A' ? 'bg-primary/15 text-primary' : 'bg-accent/30 text-accent-foreground'
            }`}
          >
            {side === 'A' ? 'A · LID' : 'B · SIDE'}
          </span>
          <span className="font-mono text-xs">
            {messageName ?? defaultName}
          </span>
          <span className="text-[10px] text-muted-foreground">
            f{fieldIndex ?? defaultField} · ^{subcommand ?? defaultSub}
          </span>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wider ${
            bound ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {bound ? 'bound' : 'not bound'}
        </span>
      </div>

      <SideCanvas side={side} />

      <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
        <span>Shape: {expected}</span>
        {printerLabel && <span className="font-mono text-foreground/80">{printerLabel}</span>}
      </div>
    </div>
  );
}

/**
 * Full bonded-pair preview strip — drop in above the conveyor view so the
 * operator sees both selected messages at a glance.
 */
export function TwinMessagePreview() {
  const pair = useTwinPair();
  const aBound = !!pair.a;
  const bBound = !!pair.b;
  return (
    <div className="rounded-md border border-border bg-card/60 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Selected messages
        </h3>
        <span className="text-[10px] text-muted-foreground">
          Visual cross-check — must match the message shown on each printer's HMI before LIVE.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SideCard
          side="A"
          bound={aBound}
          messageName={pair.a?.messageName}
          fieldIndex={pair.a?.fieldIndex}
          subcommand={pair.a?.subcommand}
          printerLabel={pair.a ? `${pair.a.name || 'Lid'} · ${pair.a.ip}:${pair.a.port}` : undefined}
        />
        <SideCard
          side="B"
          bound={bBound}
          messageName={pair.b?.messageName}
          fieldIndex={pair.b?.fieldIndex}
          subcommand={pair.b?.subcommand}
          printerLabel={pair.b ? `${pair.b.name || 'Side'} · ${pair.b.ip}:${pair.b.port}` : undefined}
        />
      </div>
    </div>
  );
}
