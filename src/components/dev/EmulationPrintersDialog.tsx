import { useCallback, useEffect, useState } from 'react';
import { Printer as PrinterIcon, Wifi, WifiOff, Power } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import { printerEmulator } from '@/lib/printerEmulator';
import { cn } from '@/lib/utils';

interface EmulationPrintersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the operator turns emulation off from inside this menu. */
  onEmulationOff?: () => void;
}

type Row = ReturnType<typeof multiPrinterEmulator.listAll>[number];

/**
 * Emulate menu — pick which simulated printers are online (reachable) and
 * which are offline. Offline printers behave exactly like a powered-off
 * machine: availability polling marks them unavailable and every command
 * returns a transport error.
 */
export function EmulationPrintersDialog({
  open,
  onOpenChange,
  onEmulationOff,
}: EmulationPrintersDialogProps) {
  const [rows, setRows] = useState<Row[]>([]);

  const refresh = useCallback(() => setRows(multiPrinterEmulator.listAll()), []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const toggle = (row: Row) => {
    multiPrinterEmulator.setOffline(row.ipAddress, row.port, !row.offline);
    refresh();
  };

  const allOnline = () => { multiPrinterEmulator.setAllOffline(false); refresh(); };
  const allOffline = () => { multiPrinterEmulator.setAllOffline(true); refresh(); };

  const onlineCount = rows.filter(r => !r.offline).length;

  const turnEmulationOff = () => {
    printerEmulator.enabled = false;
    multiPrinterEmulator.enabled = false;
    onEmulationOff?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl bg-slate-900 border-slate-700 max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-400">
            <PrinterIcon className="w-5 h-5" />
            Emulated Printers — online / offline
          </DialogTitle>
          <p className="text-xs text-slate-400">
            Tap a printer to switch it between online and offline. Offline printers act like a
            powered-off machine — they can't be connected to and the jet can't be started.
          </p>
        </DialogHeader>

        {/* Quick actions */}
        <div className="flex items-center justify-between gap-2 flex-wrap border-y border-slate-700 py-2">
          <div className="text-xs text-slate-300">
            <span className="font-bold text-emerald-400">{onlineCount}</span> online
            <span className="text-slate-500"> / {rows.length} emulated printers</span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={allOnline}
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Wifi className="w-3.5 h-3.5 mr-1" /> All Online
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={allOffline}
              className="h-8 text-xs border-slate-600"
            >
              <WifiOff className="w-3.5 h-3.5 mr-1" /> All Offline
            </Button>
          </div>
        </div>

        {/* Printer grid */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-2 px-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="py-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {rows.map(row => {
              const online = !row.offline;
              return (
                <button
                  key={`${row.ipAddress}:${row.port}`}
                  type="button"
                  onClick={() => toggle(row)}
                  className={cn(
                    'w-full text-left p-2 rounded-md border-2 transition-all flex items-center gap-2',
                    online
                      ? 'bg-emerald-500/15 border-emerald-500'
                      : 'bg-slate-800/40 border-slate-700 hover:border-slate-500',
                  )}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
                      online ? 'bg-emerald-500/25 text-emerald-300' : 'bg-slate-900 text-slate-500',
                    )}
                  >
                    {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">{row.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">
                      {row.ipAddress}:{row.port}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide',
                      online
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-700/40 text-slate-400 border border-slate-600',
                    )}
                  >
                    {online ? 'Online' : 'Offline'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="border-t border-slate-700 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={turnEmulationOff}
            className="border-slate-600"
          >
            <Power className="w-4 h-4 mr-1" />
            Turn Emulation Off
          </Button>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
