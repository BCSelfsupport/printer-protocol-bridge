import { useState, useEffect, useCallback, useRef } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export interface PrinterFault {
  code: string;
  severity: string;
  message: string;
}

interface FaultAlertDialogProps {
  /** Active faults from ^LE polling */
  faults: PrinterFault[];
  /** Whether a printer is currently connected */
  isConnected: boolean;
}

const SNOOZE_DURATION_MS = 3 * 60 * 1000; // 3 minutes

export function FaultAlertDialog({ faults, isConnected }: FaultAlertDialogProps) {
  const [open, setOpen] = useState(false);
  // Index of the fault currently being displayed
  const [currentIndex, setCurrentIndex] = useState(0);
  // Track which fault codes are currently snoozed (code -> expiry timestamp)
  const snoozedRef = useRef<Record<string, number>>({});
  // Track which faults we've already shown so we don't re-pop immediately
  const [dismissedCodes, setDismissedCodes] = useState<Set<string>>(new Set());

  // Determine which faults should trigger a popup (not snoozed)
  const getActiveFaults = useCallback(() => {
    const now = Date.now();
    for (const code of Object.keys(snoozedRef.current)) {
      if (snoozedRef.current[code] <= now) {
        delete snoozedRef.current[code];
      }
    }
    return faults.filter(f => !snoozedRef.current[f.code]);
  }, [faults]);

  // When faults change, check if we need to show the dialog
  useEffect(() => {
    if (!isConnected || faults.length === 0) {
      setOpen(false);
      setCurrentIndex(0);
      return;
    }

    const active = getActiveFaults();
    if (active.length > 0) {
      const hasNew = active.some(f => !dismissedCodes.has(f.code));
      if (hasNew) {
        setCurrentIndex(0);
        setOpen(true);
      }
    }
  }, [faults, isConnected, getActiveFaults, dismissedCodes]);

  // When faults are cleared, reset
  useEffect(() => {
    if (faults.length === 0) {
      setDismissedCodes(new Set());
      snoozedRef.current = {};
      setCurrentIndex(0);
    }
  }, [faults.length]);

  // Reset when disconnected
  useEffect(() => {
    if (!isConnected) {
      setDismissedCodes(new Set());
      snoozedRef.current = {};
      setCurrentIndex(0);
    }
  }, [isConnected]);

  const activeFaults = getActiveFaults();
  const currentFault = activeFaults[currentIndex];

  const handleDismiss = useCallback(() => {
    if (!currentFault) return;

    const now = Date.now();
    // Snooze this specific fault
    snoozedRef.current[currentFault.code] = now + SNOOZE_DURATION_MS;
    setDismissedCodes(prev => {
      const next = new Set(prev);
      next.add(currentFault.code);
      return next;
    });

    // Schedule re-check after snooze expires
    const code = currentFault.code;
    setTimeout(() => {
      setDismissedCodes(prev => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    }, SNOOZE_DURATION_MS);

    // Check if there are more faults to show
    const remaining = activeFaults.filter((f, i) => i !== currentIndex && !snoozedRef.current[f.code]);
    if (remaining.length > 0) {
      // Move to next fault (recalculate index since we snoozed current)
      setCurrentIndex(0);
    } else {
      setOpen(false);
      setCurrentIndex(0);
    }
  }, [currentFault, activeFaults, currentIndex]);

  if (!currentFault || (!open && activeFaults.length === 0)) return null;

  // Build the QR image path: /fault-codes/{code}.png
  const qrImagePath = `/fault-codes/${currentFault.code}.png`;

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-[60] grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border border-destructive/50 bg-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg"
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogPrimitive.Title className="text-lg font-semibold text-destructive">
              {currentFault.code} — Fault
            </AlertDialogPrimitive.Title>
          </div>

          {/* Description wraps fault details + QR */}
          <AlertDialogPrimitive.Description asChild>
            <div className="space-y-3">
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
                <p className="font-medium text-foreground">{currentFault.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Code: {currentFault.code} · Severity: {currentFault.severity === 'F' ? 'Fault' : currentFault.severity}
                </p>
              </div>

              {/* QR Code image */}
              <div className="flex flex-col items-center gap-2">
                <img
                  src={qrImagePath}
                  alt={`Scan for help with fault ${currentFault.code}`}
                  className="w-full max-w-[280px] rounded-md border border-border"
                  onError={(e) => {
                    // Hide image if no QR exists for this fault code
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <p className="text-xs text-muted-foreground text-center">
                  Scan with BestCode Buddy for troubleshooting help
                </p>
              </div>

              {/* Fault counter & snooze info */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {activeFaults.length > 1 && (
                  <span>Fault {currentIndex + 1} of {activeFaults.length}</span>
                )}
                <span className="ml-auto">Reappears in 3 min if unresolved</span>
              </div>
            </div>
          </AlertDialogPrimitive.Description>

          {/* Footer */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            <AlertDialogPrimitive.Action className={cn(buttonVariants())} onClick={handleDismiss}>
              {activeFaults.length > 1 && currentIndex < activeFaults.length - 1 ? 'Next Fault' : 'OK'}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
