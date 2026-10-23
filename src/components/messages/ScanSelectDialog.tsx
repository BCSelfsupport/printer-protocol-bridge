import { useEffect, useRef, useState } from 'react';
import { ListChecks, Smartphone, Keyboard } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SELECT_MESSAGE_SCAN } from '@/lib/scanPurpose';

interface ScanSelectDialogProps {
  open: boolean;
  productKey: string | null;
  machineId: string;
  /** Phone requests are only made from a licensed PC. */
  allowPhone: boolean;
  onScanned: (value: string) => void;
  onClose: () => void;
}

const fnUrl = (action: string) =>
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-request?action=${action}`;
const post = (action: string, body: Record<string, unknown>) =>
  fetch(fnUrl(action), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });

/** "Scan to Select Message": work-sheet barcode = message name. Accepts a USB scanner/typing or the paired phone. */
export function ScanSelectDialog({ open, productKey, machineId, allowPhone, onScanned, onClose }: ScanSelectDialogProps) {
  const [value, setValue] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const firedRef = useRef(false);
  const onScannedRef = useRef(onScanned);
  useEffect(() => { onScannedRef.current = onScanned; }, [onScanned]);

  // Create a phone request when opened.
  useEffect(() => {
    if (!open) return;
    setValue('');
    firedRef.current = false;
    if (!allowPhone || !productKey || productKey.length < 20) return;
    let cancelled = false;
    let createdId: string | null = null;
    (async () => {
      try {
        const res = await post('create', {
          product_key: productKey,
          machine_id: machineId,
          message_name: SELECT_MESSAGE_SCAN,
          prompt_label: 'WORK SHEET',
          max_length: 64,
        });
        const data = await res.json();
        if (!cancelled && res.ok && data.id) { createdId = data.id; setRequestId(data.id); }
      } catch { /* phone optional */ }
    })();
    return () => {
      cancelled = true;
      if (createdId) post('cancel', { product_key: productKey, request_id: createdId }).catch(() => {});
      setRequestId(null);
    };
  }, [open, allowPhone, productKey, machineId]);

  // Poll the phone request.
  useEffect(() => {
    if (!open || !requestId || !productKey) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || firedRef.current) return;
      try {
        const res = await post('poll', { product_key: productKey, request_id: requestId });
        if (!res.ok) return;
        const row = (await res.json())?.request as { status?: string; scanned_value?: string | null } | null;
        if (row?.status === 'fulfilled' && typeof row.scanned_value === 'string' && !firedRef.current) {
          firedRef.current = true;
          onScannedRef.current(row.scanned_value);
        }
      } catch { /* retry */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [open, requestId, productKey]);

  const submit = () => {
    if (!value.trim() || firedRef.current) return;
    firedRef.current = true;
    onScanned(value);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="bg-primary/10 px-4 py-3 border-b flex items-center gap-3">
          <ListChecks className="w-5 h-5 text-primary" />
          <DialogTitle className="flex-1 text-lg font-semibold">Scan to Select Message</DialogTitle>
        </div>
        <div className="bg-card p-6 space-y-5">
          <p className="text-sm text-foreground text-center">
            Scan the barcode on the work sheet. The message with the same name is chosen.
          </p>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5" /> Scanner or keyboard
            </label>
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="Message name"
              className="font-mono text-lg"
            />
          </div>
          {requestId && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <Smartphone className="w-6 h-6 text-primary animate-pulse flex-shrink-0" />
              <p className="text-sm text-foreground">Or scan it with the paired phone.</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 industrial-button py-3 rounded-lg text-sm font-medium">Cancel</button>
            <button
              onClick={submit}
              disabled={!value.trim()}
              className="flex-1 industrial-button py-3 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              Select
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
