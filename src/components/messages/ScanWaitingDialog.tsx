import { useEffect, useRef, useState } from 'react';
import { ScanLine, Smartphone, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

interface ScanWaitingDialogProps {
  open: boolean;
  /** Identifier for the pending scan_requests row. Required when open. */
  requestId: string | null;
  /** Original prompt label (e.g. "WORK ORDER") used as the page title. */
  promptLabel: string;
  /** Expiry timestamp from the create response — used to count down. */
  expiresAt: string | null;
  /** Called when mobile fulfils the request with a scanned value. */
  onFulfilled: (value: string) => void;
  /** Called when operator cancels or dialog closes manually. */
  onCancel: () => void;
}

/** PC-side modal shown after selecting a message that needs a mobile scan. */
export function ScanWaitingDialog({
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

  // Realtime subscription — fire onFulfilled the moment mobile updates the row.
  // We also poll every 2s as a fallback in case realtime drops or the channel
  // subscribes after the UPDATE has already fired.
  useEffect(() => {
    if (!open || !requestId) return;

    const fire = (value: string) => {
      if (firedRef.current) return;
      firedRef.current = true;
      console.log('[ScanWaitingDialog] fulfilled value received:', value);
      onFulfilled(value);
    };

    const channel = supabase
      .channel(`scan-request-${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scan_requests',
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          const row = payload.new as { status?: string; scanned_value?: string | null };
          console.log('[ScanWaitingDialog] realtime update:', row);
          if (row.status === 'fulfilled' && typeof row.scanned_value === 'string') {
            fire(row.scanned_value);
          }
        },
      )
      .subscribe((status) => {
        console.log('[ScanWaitingDialog] channel status:', status);
      });

    // Polling fallback — check the row every 2s in case realtime misses it
    const pollId = setInterval(async () => {
      if (firedRef.current) return;
      const { data, error } = await supabase
        .from('scan_requests')
        .select('status, scanned_value')
        .eq('id', requestId)
        .maybeSingle();
      if (error) {
        console.warn('[ScanWaitingDialog] poll failed:', error);
        return;
      }
      if (data?.status === 'fulfilled' && typeof data.scanned_value === 'string') {
        fire(data.scanned_value);
      }
    }, 2000);

    return () => {
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [open, requestId, onFulfilled]);

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
          <button onClick={onCancel} className="industrial-button p-2 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-card p-6 space-y-5 text-center">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                <Smartphone className="w-10 h-10 text-primary" />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-foreground font-semibold">
              Open <span className="text-primary">CodeSync</span> on your paired phone
            </p>
            <p className="text-sm text-muted-foreground">
              Go to the <span className="font-medium">Scan</span> tab and scan the QR/barcode for
            </p>
            <p className="text-base font-bold text-foreground tracking-wide">
              {promptLabel}
            </p>
          </div>

          <div className="bg-muted/50 border border-border rounded-lg p-3 text-sm">
            The printer will start printing automatically once the value arrives.
          </div>

          {expiresAt && (
            <p className="text-xs text-muted-foreground">
              Request expires in <span className="font-mono">{timeLabel}</span>
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
