import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * WP-5 — Per-printer stack view in the editor (Squid-style, read-only v1).
 *
 * Shows every printer in the fleet that has this message stored, with the
 * settings each printer is currently tuned to. Collapsible so the mobile
 * editor stays clean.
 */
export interface OtherPrinterRow {
  printerId: number;
  printerName: string;
  lineId?: string;
  isCurrent?: boolean;
  width?: number;
  delay?: number;
  bold?: number;
  gap?: number;
  speed?: string;
  rotation?: string;
  lastSentAt?: number | null;
}

interface Props {
  messageName: string;
  rows: OtherPrinterRow[];
}

function formatWhen(ms?: number | null): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function MessageOnOtherPrintersPanel({ messageName, rows }: Props) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  return (
    <div className="border border-border rounded-lg bg-card/50">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(o => !o)}
        className="w-full justify-between h-auto py-2 px-3 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          "{messageName}" on {rows.length} other printer{rows.length === 1 ? '' : 's'}
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>
      {open && (
        <div className="border-t border-border divide-y divide-border max-h-72 overflow-y-auto">
          {rows.map(r => (
            <div key={r.printerId} className="px-3 py-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium text-sm">
                  {r.printerName}
                  {r.isCurrent && <span className="ml-2 text-[10px] text-primary">(this printer)</span>}
                </div>
                <div className="text-muted-foreground">{formatWhen(r.lastSentAt)}</div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                {r.lineId && <span>Line: <span className="text-foreground">{r.lineId}</span></span>}
                <span>W: <span className="text-foreground">{r.width ?? '—'}</span></span>
                <span>D: <span className="text-foreground">{r.delay ?? '—'}</span></span>
                <span>Bold: <span className="text-foreground">{r.bold ?? '—'}</span></span>
                <span>Gap: <span className="text-foreground">{r.gap ?? '—'}</span></span>
                <span>Speed: <span className="text-foreground">{r.speed ?? '—'}</span></span>
                <span>Rot: <span className="text-foreground">{r.rotation ?? '—'}</span></span>
              </div>
            </div>
          ))}
          <div className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/30">
            Read-only view. Edit settings on each printer individually — Copy to Printers preserves each target's tuning.
          </div>
        </div>
      )}
    </div>
  );
}
