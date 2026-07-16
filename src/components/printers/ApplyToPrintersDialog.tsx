import { useEffect, useMemo, useState } from 'react';
import { Check, X, Printer as PrinterIcon, Tag, Crown, Link as LinkIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer } from '@/types/printer';
import { cn } from '@/lib/utils';

interface ApplyToPrintersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageName: string;
  /** The printer the operator clicked Select/Copy from. In 'select' mode it's
   *  included as a locked target. In 'copy' mode it's shown as the source label
   *  only and never included in the returned target list. */
  sourcePrinter: Printer;
  /** All other online printers eligible as extra targets. */
  siblingPrinters: Printer[];
  /** In 'select' mode: full target list (source + checked siblings).
   *  In 'copy' mode: only the checked siblings. */
  onConfirm: (targets: Printer[]) => void;
  /** 'select' (default) = apply-message-selection UX.
   *  'copy' = duplicate this message onto other printers. */
  mode?: 'select' | 'copy';
}

const LAST_SELECTION_KEY = 'apply-to-printers:last-selection';

/**
 * Groups printers by their sync group for visual scanning:
 *   - Master + its slaves (per master)
 *   - "Ungrouped" bucket for standalone printers
 */
function groupPrinters(all: Printer[]): { label: string; printers: Printer[] }[] {
  const groups: { label: string; printers: Printer[] }[] = [];
  const masters = all.filter(p => p.role === 'master');
  const ungrouped = all.filter(p => p.role !== 'master' && p.role !== 'slave');

  for (const m of masters) {
    const slaves = all.filter(p => p.role === 'slave' && p.masterId === m.id);
    groups.push({
      label: m.lineId ? `${m.lineId} (Master group)` : `${m.name} (Master group)`,
      printers: [m, ...slaves],
    });
  }

  // Any orphaned slaves whose master is not in the list
  const orphanSlaves = all.filter(
    p => p.role === 'slave' && !masters.some(m => m.id === p.masterId)
  );
  if (orphanSlaves.length) {
    groups.push({ label: 'Slaves (no master in list)', printers: orphanSlaves });
  }

  if (ungrouped.length) {
    groups.push({ label: 'Ungrouped', printers: ungrouped });
  }

  return groups;
}

function loadLastSelection(sourceId: number): Set<number> {
  try {
    const raw = localStorage.getItem(LAST_SELECTION_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Record<string, number[]>;
    return new Set(parsed[String(sourceId)] ?? []);
  } catch {
    return new Set();
  }
}

function saveLastSelection(sourceId: number, ids: number[]) {
  try {
    const raw = localStorage.getItem(LAST_SELECTION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number[]>) : {};
    parsed[String(sourceId)] = ids;
    localStorage.setItem(LAST_SELECTION_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore quota errors */
  }
}

export function ApplyToPrintersDialog({
  open,
  onOpenChange,
  messageName,
  sourcePrinter,
  siblingPrinters,
  onConfirm,
  mode = 'select',
}: ApplyToPrintersDialogProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const isCopy = mode === 'copy';

  // Prime from last-selection on open, filtered to still-available siblings.
  useEffect(() => {
    if (!open) return;
    const last = loadLastSelection(sourcePrinter.id);
    const eligible = new Set(siblingPrinters.map(p => p.id));
    const filtered = new Set([...last].filter(id => eligible.has(id)));
    setChecked(filtered);
  }, [open, sourcePrinter.id, siblingPrinters]);

  const groups = useMemo(() => groupPrinters(siblingPrinters), [siblingPrinters]);
  const totalTargets = isCopy ? checked.size : 1 + checked.size;

  const toggle = (id: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setChecked(new Set(siblingPrinters.map(p => p.id)));
  const clearAll = () => setChecked(new Set());
  const selectGroup = (ids: number[]) => {
    setChecked(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  };

  const handleConfirm = () => {
    const extras = siblingPrinters.filter(p => checked.has(p.id));
    saveLastSelection(sourcePrinter.id, extras.map(p => p.id));
    onConfirm(isCopy ? extras : [sourcePrinter, ...extras]);
    onOpenChange(false);
  };

  const renderCard = (printer: Printer, locked = false) => {
    const isChecked = locked || checked.has(printer.id);
    const roleIcon =
      printer.role === 'master' ? <Crown className="w-3 h-3 text-amber-400" /> :
      printer.role === 'slave' ? <LinkIcon className="w-3 h-3 text-cyan-400" /> :
      null;

    return (
      <button
        key={printer.id}
        type="button"
        onClick={() => !locked && toggle(printer.id)}
        disabled={locked}
        className={cn(
          'w-full text-left p-3 rounded-lg border-2 transition-all flex items-start gap-3',
          isChecked
            ? 'bg-primary/15 border-primary'
            : 'bg-slate-800/40 border-slate-700 hover:border-slate-500 hover:bg-slate-800/70',
          locked && 'opacity-90 cursor-default',
        )}
      >
        {/* Checkbox */}
        <div
          className={cn(
            'mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
            isChecked ? 'bg-primary border-primary' : 'border-slate-500 bg-slate-900',
          )}
        >
          {isChecked && <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {roleIcon}
            <span className="text-sm font-bold text-white truncate">
              {printer.lineId?.trim() || printer.name}
            </span>
            {locked && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/30 text-primary font-bold uppercase tracking-wide">
                Source
              </span>
            )}
          </div>
          {printer.lineId && printer.name !== printer.lineId && (
            <div className="text-[11px] text-slate-400 truncate">{printer.name}</div>
          )}
          <div className="text-[10px] text-slate-500 font-mono">
            {printer.ipAddress}:{printer.port}
          </div>
          {printer.currentMessage && (
            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" />
              <span className="truncate">Current: {printer.currentMessage}</span>
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl bg-slate-900 border-slate-700 max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <PrinterIcon className="w-5 h-5" />
            {isCopy
              ? `Copy "${messageName}" to which printers?`
              : `Apply "${messageName}" to which printers?`}
          </DialogTitle>
          <p className="text-xs text-slate-400">
            {isCopy
              ? `Pick the printers you want to copy "${messageName}" to. The full message content (fields, template, settings) will be written to each checked printer.`
              : `The source printer is always included. Tick any others you want to apply the same message to. If the message has a user-prompt field, you'll be asked once for the value — it'll be baked into every checked printer.`}
          </p>
        </DialogHeader>

        {/* Send to All — prominent top control */}
        <button
          type="button"
          onClick={() => (checked.size === siblingPrinters.length && siblingPrinters.length > 0 ? clearAll() : selectAll())}
          disabled={siblingPrinters.length === 0}
          className={cn(
            'w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all',
            checked.size === siblingPrinters.length && siblingPrinters.length > 0
              ? 'bg-primary/20 border-primary'
              : 'bg-slate-800/60 border-slate-600 hover:border-primary/60 hover:bg-slate-800',
            siblingPrinters.length === 0 && 'opacity-50 cursor-not-allowed',
          )}
        >
          <div
            className={cn(
              'w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0',
              checked.size === siblingPrinters.length && siblingPrinters.length > 0
                ? 'bg-primary border-primary'
                : 'border-slate-400 bg-slate-900',
            )}
          >
            {checked.size === siblingPrinters.length && siblingPrinters.length > 0 && (
              <Check className="w-4 h-4 text-white" strokeWidth={4} />
            )}
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-bold text-white">Send to All Printers</div>
            <div className="text-[11px] text-slate-400">
              Apply this message to every online printer/line in the list
            </div>
          </div>
        </button>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-wrap border-y border-slate-700 py-2">
          <div className="text-xs text-slate-300">
            <span className="font-bold text-white">{totalTargets}</span> printer{totalTargets === 1 ? '' : 's'} selected
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearAll}
            disabled={checked.size === 0}
            className="h-8 text-xs border-slate-600"
          >
            Clear
          </Button>
        </div>


        {/* Card grid */}
        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="space-y-4 py-2">
            {/* Source (locked in select mode; label-only in copy mode) */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">
                {isCopy ? 'Source printer (not written)' : 'Source printer'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {renderCard(sourcePrinter, true)}
              </div>
            </div>

            {siblingPrinters.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-6">
                No other online printers available.
              </div>
            ) : (
              groups.map(group => (
                <div key={group.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                      {group.label}
                    </div>
                    <button
                      type="button"
                      onClick={() => selectGroup(group.printers.map(p => p.id))}
                      className="text-[10px] text-primary hover:underline"
                    >
                      + Select group
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.printers.map(p => renderCard(p))}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-slate-700 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-600"
          >
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isCopy && checked.size === 0}
            className="bg-primary hover:bg-primary/90"
          >
            <Check className="w-4 h-4 mr-1" />
            {isCopy
              ? `Copy to ${totalTargets} printer${totalTargets === 1 ? '' : 's'}`
              : `Select on ${totalTargets} printer${totalTargets === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
