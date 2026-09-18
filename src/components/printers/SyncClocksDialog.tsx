import { useEffect, useMemo, useState } from 'react';
import { Check, X, CalendarClock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from '@/types/printer';
import { cn } from '@/lib/utils';

interface SyncClocksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Online printers eligible for a clock sync. */
  candidates: Printer[];
  /** Called with the printers the operator ticked. */
  onConfirm: (targets: Printer[]) => void;
  busy?: boolean;
}

/**
 * Fleet-wide clock sync picker. Sending (^DS then ^TS, serialized with the
 * 300ms firmware gap) happens in the parent — this dialog is UI-only.
 */
export function SyncClocksDialog({
  open,
  onOpenChange,
  candidates,
  onConfirm,
  busy = false,
}: SyncClocksDialogProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const candidateKey = useMemo(
    () => candidates.map(p => p.id).sort((a, b) => a - b).join(','),
    [candidates],
  );

  // Pre-check everything: "sync them all, but let me untick a couple".
  useEffect(() => {
    if (!open) return;
    setChecked(new Set(candidates.map(p => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidateKey]);

  const allChecked = candidates.length > 0 && checked.size === candidates.length;

  const toggle = (id: number) =>
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAll = () => setChecked(new Set(candidates.map(p => p.id)));
  const clearAll = () => setChecked(new Set());

  const handleConfirm = () => {
    onConfirm(candidates.filter(p => checked.has(p.id)));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl bg-slate-900 border-slate-700 max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <CalendarClock className="w-5 h-5" />
            Sync Clocks — pick printers
          </DialogTitle>
          <p className="text-xs text-slate-400">
            Sets each selected printer's date and time from this PC. Sent one printer
            at a time with a safe gap between commands.
          </p>
        </DialogHeader>

        <button
          type="button"
          onClick={() => (allChecked ? clearAll() : selectAll())}
          disabled={candidates.length === 0}
          className={cn(
            'w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all',
            allChecked
              ? 'bg-primary/20 border-primary'
              : 'bg-slate-800/60 border-slate-600 hover:border-primary/60 hover:bg-slate-800',
            candidates.length === 0 && 'opacity-50 cursor-not-allowed',
          )}
        >
          <div
            className={cn(
              'w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0',
              allChecked ? 'bg-primary border-primary' : 'border-slate-400 bg-slate-900',
            )}
          >
            {allChecked && <Check className="w-4 h-4 text-primary-foreground" strokeWidth={4} />}
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-bold text-white">Sync All Online Printers</div>
            <div className="text-[11px] text-slate-400">Every printer currently reachable</div>
          </div>
        </button>

        <div className="flex items-center justify-between gap-2 flex-wrap border-y border-slate-700 py-2">
          <div className="text-xs text-slate-300">
            <span className="font-bold text-white">{checked.size}</span> printer{checked.size === 1 ? '' : 's'} selected
            <span className="text-slate-500"> / {candidates.length} online</span>
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

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-2 px-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="py-2">
            {candidates.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-6">
                No online printers available to sync.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {candidates.map(printer => {
                  const isChecked = checked.has(printer.id);
                  return (
                    <button
                      key={printer.id}
                      type="button"
                      onClick={() => toggle(printer.id)}
                      className={cn(
                        'w-full text-left p-2 rounded-md border-2 transition-all flex items-center gap-2',
                        isChecked
                          ? 'bg-primary/15 border-primary'
                          : 'bg-slate-800/40 border-slate-700 hover:border-slate-500 hover:bg-slate-800/70',
                      )}
                    >
                      <div
                        className={cn(
                          'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0',
                          isChecked ? 'bg-primary border-primary' : 'border-slate-500 bg-slate-900',
                        )}
                      >
                        {isChecked && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={4} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {printer.name || printer.lineId?.trim()}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">
                          {printer.ipAddress}:{printer.port}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-slate-700 pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-slate-600">
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={checked.size === 0 || busy}>
            <CalendarClock className="w-4 h-4 mr-1" />
            Sync {checked.size} Printer{checked.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
