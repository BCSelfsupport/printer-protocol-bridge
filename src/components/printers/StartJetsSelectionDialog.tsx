import { useEffect, useMemo, useState } from 'react';
import { Check, X, Power, Crown, Link as LinkIcon } from 'lucide-react';
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

interface StartJetsSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Online printers eligible for Start Jet (jet currently OFF). */
  candidates: Printer[];
  /** Called with the printers the operator ticked for Start Jet. */
  onConfirm: (targets: Printer[]) => void;
}

/**
 * Start-of-shift companion to "Stop All Jets".
 *
 * Shows every online printer whose jet is currently OFF and lets the operator
 * pick which ones to spin up. Serialized ^SJ 1 sending happens in the parent
 * (Index.tsx#handleStartSelectedJets) — this dialog is UI-only.
 */
export function StartJetsSelectionDialog({
  open,
  onOpenChange,
  candidates,
  onConfirm,
}: StartJetsSelectionDialogProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const candidateKey = useMemo(
    () => candidates.map(p => p.id).sort((a, b) => a - b).join(','),
    [candidates],
  );

  // Pre-check everything when opened — matches operator intent ("start them
  // all, but let me untick the couple I don't want").
  useEffect(() => {
    if (!open) return;
    setChecked(new Set(candidates.map(p => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidateKey]);

  const allChecked = candidates.length > 0 && checked.size === candidates.length;

  const toggle = (id: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setChecked(new Set(candidates.map(p => p.id)));
  const clearAll = () => setChecked(new Set());

  const handleConfirm = () => {
    const targets = candidates.filter(p => checked.has(p.id));
    onConfirm(targets);
    onOpenChange(false);
  };

  const renderCard = (printer: Printer) => {
    const isChecked = checked.has(printer.id);
    const roleIcon =
      printer.role === 'master' ? <Crown className="w-3 h-3 text-amber-400" /> :
      printer.role === 'slave' ? <LinkIcon className="w-3 h-3 text-cyan-400" /> :
      null;

    return (
      <button
        key={printer.id}
        type="button"
        onClick={() => toggle(printer.id)}
        className={cn(
          'w-full text-left p-2 rounded-md border-2 transition-all flex items-center gap-2',
          isChecked
            ? 'bg-emerald-500/15 border-emerald-500'
            : 'bg-slate-800/40 border-slate-700 hover:border-slate-500 hover:bg-slate-800/70',
        )}
      >
        <div
          className={cn(
            'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0',
            isChecked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500 bg-slate-900',
          )}
        >
          {isChecked && <Check className="w-3 h-3 text-white" strokeWidth={4} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            {roleIcon}
            <span className="text-xs font-bold text-white truncate">
              {printer.lineId?.trim() || printer.name}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono truncate">
            {printer.ipAddress}:{printer.port}
          </div>
        </div>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl bg-slate-900 border-slate-700 max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-400">
            <Power className="w-5 h-5" />
            Start Jets — pick printers to spin up
          </DialogTitle>
          <p className="text-xs text-slate-400">
            Every online printer whose jet is currently OFF is listed below and pre-selected.
            Untick any you don't want to start, then confirm. Start Jet (^SJ 1) is sent one
            printer at a time with a safe gap between each. Each printer will begin its ~66-second startup.
          </p>
        </DialogHeader>

        {/* Send to All toggle */}
        <button
          type="button"
          onClick={() => (allChecked ? clearAll() : selectAll())}
          disabled={candidates.length === 0}
          className={cn(
            'w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all',
            allChecked
              ? 'bg-emerald-500/20 border-emerald-500'
              : 'bg-slate-800/60 border-slate-600 hover:border-emerald-500/60 hover:bg-slate-800',
            candidates.length === 0 && 'opacity-50 cursor-not-allowed',
          )}
        >
          <div
            className={cn(
              'w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0',
              allChecked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-400 bg-slate-900',
            )}
          >
            {allChecked && <Check className="w-4 h-4 text-white" strokeWidth={4} />}
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-bold text-white">Start All Available Jets</div>
            <div className="text-[11px] text-slate-400">
              Every online printer currently in a stopped state
            </div>
          </div>
        </button>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-wrap border-y border-slate-700 py-2">
          <div className="text-xs text-slate-300">
            <span className="font-bold text-white">{checked.size}</span> printer{checked.size === 1 ? '' : 's'} selected
            <span className="text-slate-500"> / {candidates.length} available</span>
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
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-2 px-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="py-2">
            {candidates.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-6">
                No online printers with a stopped jet. All available printers are already running.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {candidates.map(p => renderCard(p))}
              </div>
            )}
          </div>
        </div>

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
            disabled={checked.size === 0}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <Power className="w-4 h-4 mr-1" />
            Start {checked.size} Jet{checked.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
