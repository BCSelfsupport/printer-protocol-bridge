import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

export interface RetryFailureItem {
  printerName: string;
  reason: string;
}

interface RetryFailuresDialogProps {
  open: boolean;
  messageName: string;
  action: 'copy' | 'select' | 'send';
  failures: RetryFailureItem[];
  attempt: number;         // 1-based; how many attempts have been made
  maxAttempts?: number;    // default 3
  onIgnore: () => void;
  onRetry: () => void;
}

/**
 * WP-4 — Ignore / Try Again on failed pushes.
 * Lists each failed printer with the reason returned by the printer.
 * "Try Again" re-runs the action against ONLY the failed set.
 * After maxAttempts the retry button is disabled — operator must Ignore.
 */
export function RetryFailuresDialog({
  open,
  messageName,
  action,
  failures,
  attempt,
  maxAttempts = 3,
  onIgnore,
  onRetry,
}: RetryFailuresDialogProps) {
  const verb = action === 'copy' ? 'Copy' : action === 'select' ? 'Select' : 'Send';
  const retriesLeft = Math.max(0, maxAttempts - attempt);
  const canRetry = retriesLeft > 0 && failures.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onIgnore(); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {verb} failed on {failures.length} printer{failures.length === 1 ? '' : 's'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p className="text-sm">
                "{messageName}" could not be {verb.toLowerCase() === 'copy' ? 'copied' : verb.toLowerCase() + 'ed'} on the printers below.
                Attempt {attempt} of {maxAttempts}.
              </p>
              <div className="max-h-56 overflow-y-auto rounded-md border bg-muted/30 divide-y">
                {failures.map((f, i) => (
                  <div key={i} className="px-3 py-2 text-sm">
                    <div className="font-medium">{f.printerName}</div>
                    <div className="text-xs text-muted-foreground break-words">{f.reason || 'Unknown error'}</div>
                  </div>
                ))}
              </div>
              {!canRetry && (
                <p className="text-xs text-amber-600">
                  Retry limit reached. Check printer connection / faults, then run the action again manually.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onIgnore}>Ignore</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); if (canRetry) onRetry(); }}
            disabled={!canRetry}
          >
            Try Again{canRetry ? ` (${retriesLeft} left)` : ''}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
