import { useEffect, useRef, useState } from 'react';
import { ScanLine, Smartphone, ScanQrCode } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

interface ScanWaitingDialogProps {
  open: boolean;
  /** Identifier for the pending scan_requests row. Required when open. */
  requestId: string | null;
  /** Original prompt label (e.g. "WORK ORDER") used as the page title. */
  promptLabel: string;
  /** Expiry timestamp from the create response — used to count down. */
  expiresAt: string | null;
  /** Product key — needed to authorise the poll edge-function call. */
  productKey: string | null;
  /** Called when mobile fulfils the request with a scanned value. */
  onFulfilled: (value: string) => void;
  /** Called when operator cancels or dialog closes manually. */
  onCancel: () => void;
}

/** PC-side modal shown after selecting a message that needs a mobile scan. */
export function ScanWaitingDialog({
  productKey,
  open,
  requestId,
  promptLabel,
  expiresAt,
  onFulfilled,
  onCancel,
}: ScanWaitingDialogProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // Countdown so the operator knows when the request will time out
  useEffect(() => {
    if (!open || !expiresAt) return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [open, expiresAt]);

  // Guard against double-fire (realtime + polling fallback can race).
  const firedRef = useRef(false);

  // Reset the guard whenever a new request is opened
  useEffect(() => {
    if (open && requestId) firedRef.current = false;
  }, [open, requestId]);

  // Poll the scan-request edge function every 2s. We can't use Supabase realtime
  // or direct table queries here because scan_requests has service-role-only RLS;
  // the edge function uses the service key to read the row on our behalf.
  useEffect(() => {
    if (!open || !requestId || !productKey) return;

    const fire = (value: string) => {
      if (firedRef.current) return;
      firedRef.current = true;
      console.log('[ScanWaitingDialog] fulfilled value received:', value);
      onFulfilled(value);
    };

    let cancelled = false;
    const poll = async () => {
      if (firedRef.current || cancelled) return;
      // Guard: skip polls when the license context isn't ready yet — this avoids
      // transient 401 "Invalid license" responses from the edge function on the
      // very first tick before the license hook has hydrated.
      if (!productKey || productKey.length < 5) return;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-request?action=poll`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ product_key: productKey, request_id: requestId }),
          },
        );
        // Swallow 401/404 silently — these are recoverable: the next poll will
        // retry once the license hydrates or the row becomes visible.
        if (res.status === 401 || res.status === 404) {
          console.warn('[ScanWaitingDialog] poll got', res.status, '— retrying next tick');
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        const row = data?.request as { status?: string; scanned_value?: string | null } | null;
        if (row?.status === 'fulfilled' && typeof row.scanned_value === 'string') {
          fire(row.scanned_value);
        }
      } catch (e) {
        console.warn('[ScanWaitingDialog] poll failed:', e);
      }
    };

    // Fire immediately so we catch already-fulfilled rows without waiting 2s
    poll();
    const pollId = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [open, requestId, productKey, onFulfilled]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="bg-gradient-to-b from-primary/20 to-primary/5 px-4 py-3 border-b flex items-center gap-3">
          <ScanLine className="w-5 h-5 text-primary" />
          <DialogTitle className="flex-1 text-lg font-semibold">
            Waiting for mobile scan
          </DialogTitle>
        </div>

        <div className="bg-card p-6 space-y-5">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                <Smartphone className="w-10 h-10 text-primary" />
              </div>
            </div>
          </div>

          <div className="text-center space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Scan required</p>
            <p className="text-2xl font-bold text-foreground tracking-wide">
              {promptLabel}
            </p>
          </div>

          {/* Step-by-step instructions for the operator */}
          <div className="bg-muted/40 border border-border rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              On your paired phone
            </p>
            <ol className="space-y-2.5">
              <li className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <p className="text-sm text-foreground pt-0.5">
                  Open the <span className="font-semibold text-primary">CodeSync</span> mobile app
                </p>
              </li>
              <li className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <p className="text-sm text-foreground pt-0.5">
                  Tap <span className="font-semibold">Start camera</span> when prompted
                </p>
              </li>
              <li className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  3
                </span>
                <p className="text-sm text-foreground pt-0.5 flex items-center gap-1.5 flex-wrap">
                  <ScanQrCode className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>Scan the <span className="font-semibold">{promptLabel}</span> barcode or QR code</span>
                </p>
              </li>
            </ol>
          </div>

          <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-xs text-center text-foreground">
            The printer will start printing automatically as soon as the scanned value arrives.
          </div>

          {expiresAt && (
            <p className="text-xs text-muted-foreground text-center">
              Request expires in <span className="font-mono font-semibold">{timeLabel}</span>
            </p>
          )}

          <button
            onClick={onCancel}
            className="w-full industrial-button py-3 rounded-lg text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
