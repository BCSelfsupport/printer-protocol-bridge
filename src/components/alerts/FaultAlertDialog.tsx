import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
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
  // Track which fault codes are currently snoozed (code -> expiry timestamp)
  const snoozedRef = useRef<Record<string, number>>({});
  // Track which faults we've already shown so we don't re-pop immediately
  const [dismissedCodes, setDismissedCodes] = useState<Set<string>>(new Set());

  // Determine which faults should trigger a popup (not snoozed)
  const getActiveFaults = useCallback(() => {
    const now = Date.now();
    // Clean expired snoozes
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
      return;
    }

    const active = getActiveFaults();
    if (active.length > 0) {
      // Check if there are any NEW faults (not currently dismissed)
      const hasNew = active.some(f => !dismissedCodes.has(f.code));
      if (hasNew) {
        setOpen(true);
      }
    }
  }, [faults, isConnected, getActiveFaults, dismissedCodes]);

  // When faults are cleared (e.g. ink refilled), reset dismissed tracking
  useEffect(() => {
    if (faults.length === 0) {
      setDismissedCodes(new Set());
      snoozedRef.current = {};
    }
  }, [faults.length]);

  // Reset when disconnected
  useEffect(() => {
    if (!isConnected) {
      setDismissedCodes(new Set());
      snoozedRef.current = {};
    }
  }, [isConnected]);

  const handleDismiss = useCallback(() => {
    const now = Date.now();
    const active = getActiveFaults();
    // Snooze all currently showing faults for 3 minutes
    for (const f of active) {
      snoozedRef.current[f.code] = now + SNOOZE_DURATION_MS;
    }
    // Mark as dismissed so they don't re-pop until snooze expires
    setDismissedCodes(prev => {
      const next = new Set(prev);
      active.forEach(f => next.add(f.code));
      return next;
    });
    setOpen(false);

    // Schedule re-check after snooze expires
    setTimeout(() => {
      // Clear dismissed codes for the snoozed faults so the effect re-evaluates
      setDismissedCodes(prev => {
        const next = new Set(prev);
        active.forEach(f => next.delete(f.code));
        return next;
      });
    }, SNOOZE_DURATION_MS);
  }, [getActiveFaults]);

  const activeFaults = getActiveFaults();
  if (activeFaults.length === 0 && !open) return null;

  // Show the first fault prominently (like the printer does)
  const primaryFault = activeFaults[0];

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <AlertDialogContent className="max-w-md border-destructive/50 bg-destructive/5">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-destructive">
              {primaryFault?.code} — Fault
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="mt-3 space-y-2 text-sm">
            {activeFaults.map(f => (
              <div key={f.code} className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
                <p className="font-medium text-foreground">{f.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Code: {f.code} · Severity: {f.severity === 'F' ? 'Fault' : f.severity}
                </p>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              This alert will reappear in 3 minutes if the fault persists.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleDismiss}>
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
