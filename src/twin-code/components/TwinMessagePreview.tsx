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
import { useEffect, useRef, useState } from 'react';
import { useTwinPair } from '../twinPairStore';
import { Slider } from '@/components/ui/slider';
// @ts-ignore — bwip-js ships its own types but resolution differs across bundlers
import bwipjs from 'bwip-js';

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
  /** Operator-controlled preview scale multiplier (1 = baseline). */
  scale: number;
}

/**
 * Single placeholder both sides render. Identical content per print is the
 * whole point of the cross-check — A's DM and B's text must match in production
 * (dispatcher writes the same `serial` into both via ^MD^BD1 / ^MD^TD1).
 */
const PLACEHOLDER_SERIAL = 'DRYRUN0000000'; // 13 chars, matches catalog serial length

const DOT = 4; // px per dot — readable on 1396px viewport without dominating the panel
// 13 chars × (5 wide + 1 gap) = 78 dots. Add a small right margin so the last char isn't clipped.
const PAD_DOTS = 84;
const TEMPLATE_DOTS_A = 16; // LID seed runs on a 16-dot template (DM 16×16)
const TEMPLATE_DOTS_B = 7;  // SIDE seed runs on a 7-dot template (Standard 7×5 text)

/**
 * Renders the canonical seed shape for one side of the pair onto a small
 * dot-matrix canvas — green on dark, matching the printer ink look used in
 * MessageThumbnail / MessageCanvas.
 *
 * Both sides render the SAME placeholder string (PLACEHOLDER_SERIAL) so the
 * operator can visually confirm A's DM and B's text are tied to the same
 * data — exactly how the dispatcher feeds them in production.
 */
function SideCanvas({ side, scale }: { side: 'A' | 'B'; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;

    if (side === 'A') {
      // LID canvas: small square preview — 16 modules × 2px + 2px quiet zone = 36px square.
      // It's a glance-confirmation, not a scannable code, so keep it compact.
      const DM_MODULE_PX = 2;
      const QUIET_PX = DM_MODULE_PX;
      const sizePx = 16 * DM_MODULE_PX + QUIET_PX * 2;
      c.width = sizePx;
      c.height = sizePx;
      const ctx = c.getContext('2d');
      if (!ctx) return;

      // Background — match MessageThumbnail palette.
      ctx.fillStyle = 'hsl(220, 13%, 12%)';
      ctx.fillRect(0, 0, c.width, c.height);

      // Real ECC200 DM 16×16 of the same placeholder string the SIDE renders.
      const tmp = document.createElement('canvas');
      bwipjs.toCanvas(tmp, {
        bcid: 'datamatrix',
        text: PLACEHOLDER_SERIAL,
        scale: 1,
        rows: 16,
        columns: 16,
        includetext: false,
        backgroundcolor: 'ffffff',
        paddingwidth: 0,
        paddingheight: 0,
      });
      const tctx = tmp.getContext('2d');
      if (tctx && tmp.width > 0 && tmp.height > 0) {
        const img = tctx.getImageData(0, 0, tmp.width, tmp.height);
        const cellW = tmp.width / 16;
        const cellH = tmp.height / 16;
        ctx.fillStyle = 'hsl(160, 84%, 55%)'; // emerald — printer ink
        for (let r = 0; r < 16; r++) {
          for (let col = 0; col < 16; col++) {
            const px = Math.floor(col * cellW + cellW / 2);
            const py = Math.floor(r * cellH + cellH / 2);
            const idx = (py * tmp.width + px) * 4;
            if (img.data[idx] < 128) {
              ctx.fillRect(
                QUIET_PX + col * DM_MODULE_PX,
                QUIET_PX + r * DM_MODULE_PX,
                DM_MODULE_PX,
                DM_MODULE_PX,
              );
            }
          }
        }
      }
    } else {
      // SIDE: 13-char placeholder in Standard 7×5 dot-matrix font on a 7-dot template.
      c.width = PAD_DOTS * DOT;
      c.height = TEMPLATE_DOTS_B * DOT;
      const ctx = c.getContext('2d');
      if (!ctx) return;

      // Background — match MessageThumbnail palette.
      ctx.fillStyle = 'hsl(220, 13%, 12%)';
      ctx.fillRect(0, 0, c.width, c.height);

      // Light grid every 4 dots for visual scale.
      ctx.fillStyle = 'hsl(220, 13%, 18%)';
      for (let r = 0; r < TEMPLATE_DOTS_B; r += 4) {
        for (let col = 0; col < PAD_DOTS; col += 4) {
          ctx.fillRect(col * DOT, r * DOT, 1, 1);
        }
      }

      ctx.fillStyle = 'hsl(160, 84%, 55%)'; // emerald — printer ink
      try {
        renderText(ctx, PLACEHOLDER_SERIAL, 0, 0, 'Standard7High', DOT, 1);
      } catch {
        // Font load may not be ready on first paint — skip silently.
      }
    }
  }, [side]);

  return (
    <canvas
      ref={ref}
      style={{
        // Preview thumbnail — small on purpose, this is a glance check.
        // Scale both sides together so they stay visually paired.
        height: side === 'A' ? 80 : TEMPLATE_DOTS_B * 6,
        width: side === 'A' ? 80 : 'auto',
        imageRendering: 'pixelated',
      }}
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
