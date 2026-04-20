import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import { Camera, AlertCircle, Loader2, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ScannerViewProps {
  onResult: (text: string) => void;
  onError?: (msg: string) => void;
}

const DEMO_QR_VALUES = [
  '1A4060300003E16000007737',
  '1A4050300009A4D000681364',
  '1A4040300008B7C000123456',
];

/**
 * Live camera viewfinder that decodes QR / Data Matrix / Code128 codes.
 * Uses native BarcodeDetector when available (Android Chrome), falls back to
 * @zxing/browser for iOS Safari and other browsers.
 *
 * DEMO MODE: When the URL contains ?demo=1 (or the host posts a
 * 'cs:demo-scan' message), the camera is replaced by a tappable mock
 * viewfinder pre-loaded with sample METRC tags. Useful for the desktop
 * phone-overlay where webcam access from inside an iframe is blocked.
 */
export function ScannerView({ onResult, onError }: ScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'denied' | 'unavailable' | 'demo'>('starting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const decodedRef = useRef(false);

  // Detect demo mode (URL flag OR running inside the dev phone overlay iframe)
  const isDemoMode = (() => {
    if (typeof window === 'undefined') return false;
    if (window.location.search.includes('demo=1')) return true;
    try {
      // If we are framed by the host overlay, it sets this flag via postMessage handshake
      return window.self !== window.top;
    } catch {
      return true; // cross-origin frame access throws → assume framed
    }
  })();

  // Listen for host-injected demo scan results (postMessage from MobilePhoneOverlay)
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'cs:demo-scan' && typeof e.data.value === 'string') {
        if (decodedRef.current) return;
        decodedRef.current = true;
        onResult(e.data.value);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onResult]);

  useEffect(() => {
    if (isDemoMode) {
      setStatus('demo');
      return;
    }

    let stream: MediaStream | null = null;
    let zxingControls: { stop: () => void } | null = null;
    let nativeRafId: number | null = null;

    async function start() {
      try {
        // Prefer rear camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus('scanning');

        // Try native BarcodeDetector first
        const NativeBD = (window as any).BarcodeDetector;
        if (NativeBD) {
          try {
            const detector = new NativeBD({ formats: ['qr_code', 'data_matrix', 'code_128', 'code_39'] });
            const tick = async () => {
              if (decodedRef.current || !videoRef.current) return;
              try {
                const codes = await detector.detect(videoRef.current);
                if (codes && codes.length > 0) {
                  decodedRef.current = true;
                  onResult(String(codes[0].rawValue || ''));
                  return;
                }
              } catch { /* ignore individual frame errors */ }
              nativeRafId = requestAnimationFrame(tick);
            };
            nativeRafId = requestAnimationFrame(tick);
            return;
          } catch {
            // fall through to zxing
          }
        }

        // ZXing fallback
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result && !decodedRef.current) {
            decodedRef.current = true;
            onResult(result.getText());
          }
        });
        zxingControls = controls;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (err?.name === 'NotAllowedError' || /permission|denied/i.test(msg)) {
          setStatus('denied');
          setErrorMsg('Camera permission was denied. Please allow camera access and reload.');
        } else if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
          setStatus('unavailable');
          setErrorMsg('No rear-facing camera was found on this device.');
        } else {
          setStatus('unavailable');
          setErrorMsg(msg);
        }
        onError?.(msg);
      }
    }

    start();

    return () => {
      decodedRef.current = true;
      if (nativeRafId !== null) cancelAnimationFrame(nativeRafId);
      try { zxingControls?.stop(); } catch {}
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [onError, onResult, isDemoMode]);

  // ─── DEMO viewfinder ─────────────────────────────────────────────────
  if (status === 'demo') {
    return (
      <div className="relative w-full aspect-[3/4] max-h-[60vh] bg-gradient-to-br from-zinc-900 via-zinc-950 to-black rounded-2xl overflow-hidden border border-amber-500/30">
        {/* Faux work-order paper */}
        <div className="absolute inset-4 bg-[hsl(45_30%_92%)] rounded-md shadow-2xl p-4 flex flex-col items-center justify-center gap-3">
          <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-semibold">Work Order · METRC Tag</div>
          {/* Faux QR pattern */}
          <div className="w-32 h-32 grid grid-cols-8 gap-0 bg-white p-2 border border-zinc-300">
            {Array.from({ length: 64 }).map((_, i) => {
              // deterministic pseudo-random pattern
              const on = ((i * 7 + 3) % 5 < 2) || i < 8 || i > 55 || i % 8 === 0 || i % 8 === 7;
              return <div key={i} className={on ? 'bg-zinc-900' : 'bg-white'} />;
            })}
          </div>
          <div className="text-[10px] font-mono text-zinc-700 break-all px-2 text-center">{DEMO_QR_VALUES[0]}</div>
        </div>

        {/* Reticle on top */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-2/3 aspect-square">
            <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-amber-400 rounded-tl-lg" />
            <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-amber-400 rounded-tr-lg" />
            <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-amber-400 rounded-bl-lg" />
            <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-amber-400 rounded-br-lg" />
            <div className="absolute inset-x-4 top-1/2 h-0.5 bg-amber-400/80 shadow-[0_0_12px_rgba(251,191,36,0.8)] animate-pulse" />
          </div>
        </div>

        {/* Demo badge + scan buttons */}
        <div className="absolute top-2 left-2 bg-amber-500/90 text-amber-950 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
          Demo Mode
        </div>

        <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-1.5">
          <p className="text-[10px] text-amber-100/80 text-center">Tap a sample tag to simulate a scan</p>
          <div className="flex flex-col gap-1">
            {DEMO_QR_VALUES.map((v) => (
              <Button
                key={v}
                size="sm"
                variant="secondary"
                className="h-8 text-[11px] font-mono bg-amber-400 hover:bg-amber-300 text-amber-950 border-0"
                onClick={() => {
                  if (decodedRef.current) return;
                  decodedRef.current = true;
                  onResult(v);
                }}
              >
                <ScanLine className="w-3.5 h-3.5 mr-1.5" />
                {v}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── REAL camera viewfinder ──────────────────────────────────────────
  return (
    <div className="relative w-full aspect-[3/4] max-h-[60vh] bg-black rounded-2xl overflow-hidden border border-border">
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Reticle */}
      {status === 'scanning' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-2/3 aspect-square">
            <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
            <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
            <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
            <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
            <div className="absolute inset-x-4 top-1/2 h-0.5 bg-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,0.8)] animate-pulse" />
          </div>
        </div>
      )}

      {/* Status overlays */}
      {status === 'starting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Starting camera…</p>
        </div>
      )}
      {(status === 'denied' || status === 'unavailable') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-white p-6 text-center">
          <AlertCircle className="w-10 h-10 text-amber-400" />
          <p className="text-sm">{errorMsg}</p>
        </div>
      )}

      {/* Bottom hint */}
      {status === 'scanning' && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
          <div className="bg-black/70 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur flex items-center gap-2">
            <Camera className="w-3.5 h-3.5" />
            Hold the QR code inside the frame
          </div>
        </div>
      )}
    </div>
  );
}
