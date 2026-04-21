import { useEffect, useRef, useState, useCallback } from 'react';
import { ScanLine, CheckCircle2, AlertCircle, Smartphone, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { useLicense } from '@/contexts/LicenseContext';

interface PendingScanRequest {
  id: string;
  message_name: string;
  prompt_label: string;
  max_length: number;
  created_at: string;
  expires_at: string;
}

const SCANNER_ELEMENT_ID = 'scan-page-camera';
const MACHINE_ID_KEY = 'codesync-machine-id';

function getMachineId(): string {
  let id = localStorage.getItem(MACHINE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(MACHINE_ID_KEY, id);
  }
  return id;
}

/**
 * Mobile companion route. Polls for a pending scan_request belonging to the
 * paired license; when one appears, opens the camera scanner. On capture the
 * value is sent back via the scan-request edge function and the PC bakes it
 * into the printer message.
 */
export default function ScanPage() {
  const { isCompanion, companionSessionId } = useLicense();
  const [pending, setPending] = useState<PendingScanRequest | null>(null);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const callScanRequest = useCallback(
    async (action: string, body: Record<string, unknown>) => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-request?action=${action}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    },
    [],
  );

  // Poll for pending scan requests every 3s while idle.
  useEffect(() => {
    if (!isCompanion || !companionSessionId || pending) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const { requests } = await callScanRequest('list-pending', {
          session_id: companionSessionId,
          machine_id: getMachineId(),
        });
        if (cancelled) return;
        if (Array.isArray(requests) && requests.length > 0) {
          setPending(requests[0]);
        }
      } catch (e) {
        // Silent — keep polling
        console.warn('[ScanPage] poll failed:', e);
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isCompanion, companionSessionId, pending, callScanRequest]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      const state = scanner.getState();
      // 2 = SCANNING, 3 = PAUSED
      if (state === 2 || state === 3) {
        await scanner.stop();
      }
      await scanner.clear();
    } catch (e) {
      console.warn('[ScanPage] stop failed:', e);
    }
    scannerRef.current = null;
  }, []);

  const handleScannedValue = useCallback(
    async (value: string) => {
      if (!pending || !companionSessionId) return;
      setStatus('sending');
      await stopScanner();
      try {
        await callScanRequest('fulfill', {
          session_id: companionSessionId,
          machine_id: getMachineId(),
          request_id: pending.id,
          value,
        });
        setStatus('sent');
        toast.success('Scan sent to printer');
        // Reset after 2s so we're ready for the next scan request
        setTimeout(() => {
          setPending(null);
          setStatus('idle');
        }, 2000);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to send scan';
        setErrorMessage(msg);
        setStatus('error');
      }
    },
    [pending, companionSessionId, callScanRequest, stopScanner],
  );

  // Start camera scanner when a pending request appears
  useEffect(() => {
    if (!pending || status !== 'idle') return;

    let cancelled = false;
    const start = async () => {
      try {
        setStatus('scanning');
        const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (cancelled) return;
            handleScannedValue(decodedText);
          },
          () => { /* ignore per-frame decode failures */ },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Camera unavailable';
        setErrorMessage(msg);
        setStatus('error');
      }
    };
    start();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [pending, status, handleScannedValue, stopScanner]);

  // Cancel current scan and revert to idle
  const handleCancel = useCallback(async () => {
    await stopScanner();
    setPending(null);
    setStatus('idle');
    setErrorMessage(null);
  }, [stopScanner]);

  if (!isCompanion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-4">
          <Smartphone className="w-14 h-14 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Mobile companion only</h1>
          <p className="text-sm text-muted-foreground">
            This page is only available when this device is paired as a CodeSync mobile companion.
            On the PC, open <span className="font-medium">Pair Mobile</span> and scan the QR with this phone first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-gradient-to-b from-primary/20 to-primary/5 px-4 py-3 border-b flex items-center gap-3">
        <ScanLine className="w-5 h-5 text-primary" />
        <h1 className="text-base font-semibold text-foreground flex-1">Scan to Print</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
        {!pending && (
          <div className="text-center space-y-4 max-w-sm">
            <div className="relative inline-flex">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                <ScanLine className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-foreground">Waiting for the PC</h2>
            <p className="text-sm text-muted-foreground">
              On the PC, select a message that has a scan field. Your camera will open here automatically.
            </p>
          </div>
        )}

        {pending && status === 'scanning' && (
          <div className="w-full max-w-sm space-y-4">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Scanning for</p>
              <p className="text-xl font-bold text-foreground">{pending.prompt_label}</p>
              <p className="text-xs text-muted-foreground">
                Message: <span className="font-mono">{pending.message_name}</span>
              </p>
            </div>
            <div
              id={SCANNER_ELEMENT_ID}
              className="w-full aspect-square rounded-lg overflow-hidden bg-black border-2 border-primary"
            />
            <button
              onClick={handleCancel}
              className="w-full industrial-button py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        )}

        {status === 'sending' && (
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary mx-auto animate-pulse flex items-center justify-center">
              <ScanLine className="w-7 h-7 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Sending to printer…</p>
          </div>
        )}

        {status === 'sent' && (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-14 h-14 text-primary mx-auto" />
            <p className="text-base font-semibold text-foreground">Scan sent</p>
            <p className="text-sm text-muted-foreground">The printer is now printing.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-4 max-w-sm">
            <AlertCircle className="w-14 h-14 text-destructive mx-auto" />
            <p className="text-base font-semibold text-foreground">Something went wrong</p>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <button
              onClick={handleCancel}
              className="w-full industrial-button py-3 rounded-lg text-sm font-medium"
            >
              Try again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
