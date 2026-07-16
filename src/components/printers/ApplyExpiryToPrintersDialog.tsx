import { useEffect, useMemo, useState } from 'react';
import { Check, X, Printer as PrinterIcon, Crown, Link as LinkIcon, Calendar } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer } from '@/types/printer';
import { cn } from '@/lib/utils';

interface ApplyExpiryToPrintersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourcePrinter: Printer;
  /** Other online printers whose current message has an expiry field. */
  siblingPrinters: Printer[];
  /** Current source expiry days (pre-fills the input). */
  currentDays: number;
  /** Called once per selected target with the new days value. */
  onConfirm: (targets: Printer[], days: number) => void;
}

const LAST_SELECTION_KEY = 'apply-expiry-to-printers:last-selection';

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
  const orphanSlaves = all.filter(p => p.role === 'slave' && !masters.some(m => m.id === p.masterId));
  if (orphanSlaves.length) groups.push({ label: 'Slaves (no master in list)', printers: orphanSlaves });
  if (ungrouped.length) groups.push({ label: 'Ungrouped', printers: ungrouped });
  return groups;
}

function loadLastSelection(sourceId: number): Set<number> {
  try {
    const raw = localStorage.getItem(LAST_SELECTION_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Record<string, number[]>;
    return new Set(parsed[String(sourceId)] ?? []);
  } catch { return new Set(); }
}

function saveLastSelection(sourceId: number, ids: number[]) {
  try {
    const raw = localStorage.getItem(LAST_SELECTION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number[]>) : {};
    parsed[String(sourceId)] = ids;
    localStorage.setItem(LAST_SELECTION_KEY, JSON.stringify(parsed));
  } catch { /* ignore */ }
}

export function ApplyExpiryToPrintersDialog({
  open,
  onOpenChange,
  sourcePrinter,
  siblingPrinters,
  currentDays,
  onConfirm,
}: ApplyExpiryToPrintersDialogProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [daysInput, setDaysInput] = useState<string>(String(currentDays));

  const siblingIdsKey = useMemo(
    () => siblingPrinters.map(p => p.id).sort((a, b) => a - b).join(','),
    [siblingPrinters],
  );

  useEffect(() => {
    if (!open) return;
    setDaysInput(String(currentDays));
    const last = loadLastSelection(sourcePrinter.id);
    const eligible = new Set(siblingIdsKey ? siblingIdsKey.split(',').map(Number) : []);
    setChecked(new Set([...last].filter(id => eligible.has(id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourcePrinter.id, siblingIdsKey, currentDays]);

  const groups = useMemo(() => groupPrinters(siblingPrinters), [siblingPrinters]);
  const totalTargets = 1 + checked.size;

  const toggle = (id: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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

  const parsedDays = parseInt(daysInput, 10);
  const daysValid = !isNaN(parsedDays) && parsedDays >= 0;

  const handleConfirm = () => {
    if (!daysValid) return;
    const extras = siblingPrinters.filter(p => checked.has(p.id));
    saveLastSelection(sourcePrinter.id, extras.map(p => p.id));
    onConfirm([sourcePrinter, ...extras], parsedDays);
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
          'w-full text-left p-2 rounded-md border-2 transition-all flex items-center gap-2',
          isChecked
            ? 'bg-amber-500/15 border-amber-400'
            : 'bg-slate-800/40 border-slate-700 hover:border-slate-500 hover:bg-slate-800/70',
          locked && 'opacity-90 cursor-default',
        )}
      >
        <div className={cn(
          'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0',
          isChecked ? 'bg-amber-400 border-amber-400' : 'border-slate-500 bg-slate-900',
        )}>
          {isChecked && <Check className="w-3 h-3 text-slate-900" strokeWidth={4} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            {roleIcon}
            <span className="text-xs font-bold text-white truncate">
              {printer.lineId?.trim() || printer.name}
            </span>
            {locked && (
              <span className="text-[9px] px-1 py-0 rounded bg-amber-400/30 text-amber-200 font-bold uppercase tracking-wide">
                Source
              </span>
            )}
            {printer.expiryOffsetDays !== undefined && (
              <span className="text-[9px] px-1 py-0 rounded bg-cyan-500/20 text-cyan-300 font-bold">
                {printer.expiryOffsetDays}d
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 font-mono truncate">
            {printer.ipAddress}:{printer.port}
            {printer.currentMessage ? ` · ${printer.currentMessage}` : ''}
          </div>
        </div>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl bg-slate-900 border-slate-700 max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-300">
            <Calendar className="w-5 h-5" />
            Apply expiry offset to which printers?
          </DialogTitle>
          <p className="text-xs text-slate-400">
            The source printer is always included. Tick any others you want to update. Each printer will
            have its message re-sent with the new expiry day offset.
          </p>
        </DialogHeader>

        {/* Days input */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/60 border border-amber-400/30">
          <Calendar className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <label className="text-sm font-semibold text-white">Expiry offset:</label>
          <Input
            type="number"
            min={0}
            value={daysInput}
            onChange={e => setDaysInput(e.target.value)}
            onFocus={e => e.target.select()}
            className="w-24 h-9 text-lg text-center font-bold bg-slate-900 border-amber-400/60 text-amber-200"
          />
          <span className="text-sm text-slate-300">days</span>
        </div>

        {/* Send to All */}
        <button
          type="button"
          onClick={() => (checked.size === siblingPrinters.length && siblingPrinters.length > 0 ? clearAll() : selectAll())}
          disabled={siblingPrinters.length === 0}
          className={cn(
            'w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all',
            checked.size === siblingPrinters.length && siblingPrinters.length > 0
              ? 'bg-amber-500/20 border-amber-400'
              : 'bg-slate-800/60 border-slate-600 hover:border-amber-400/60 hover:bg-slate-800',
            siblingPrinters.length === 0 && 'opacity-50 cursor-not-allowed',
          )}
        >
          <div className={cn(
            'w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0',
            checked.size === siblingPrinters.length && siblingPrinters.length > 0
              ? 'bg-amber-400 border-amber-400'
              : 'border-slate-400 bg-slate-900',
          )}>
            {checked.size === siblingPrinters.length && siblingPrinters.length > 0 && (
              <Check className="w-4 h-4 text-slate-900" strokeWidth={4} />
            )}
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-bold text-white">Send to All Printers</div>
            <div className="text-[11px] text-slate-400">
              Apply this expiry offset to every printer with an expiry field
            </div>
          </div>
        </button>

        <div className="flex items-center justify-between gap-2 flex-wrap border-y border-slate-700 py-2">
          <div className="text-xs text-slate-300">
            <span className="font-bold text-white">{totalTargets}</span> printer{totalTargets === 1 ? '' : 's'} selected
          </div>
          <Button type="button" size="sm" variant="outline" onClick={clearAll} disabled={checked.size === 0} className="h-8 text-xs border-slate-600">
            Clear
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0 -mx-2 px-2">
          <div className="space-y-4 py-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">Source printer</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {renderCard(sourcePrinter, true)}
              </div>
            </div>
            {siblingPrinters.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-6">
                No other online printers with an expiry field.
              </div>
            ) : groups.map(group => (
              <div key={group.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{group.label}</div>
                  <button type="button" onClick={() => selectGroup(group.printers.map(p => p.id))} className="text-[10px] text-amber-300 hover:underline">
                    + Select group
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {group.printers.map(p => renderCard(p))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-slate-700 pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-slate-600">
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!daysValid} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold">
            <Check className="w-4 h-4 mr-1" />
            Apply {daysValid ? `${parsedDays}d` : ''} to {totalTargets} printer{totalTargets === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
