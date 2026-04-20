import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import { Camera, AlertCircle, Loader2 } from 'lucide-react';

interface ScannerViewProps {
  onResult: (text: string) => void;
  onError?: (msg: string) => void;
}

/**
 * Live camera viewfinder that decodes QR / Data Matrix / Code128 codes.
 * Uses native BarcodeDetector when available (Android Chrome), falls back to
 * @zxing/browser for iOS Safari and other browsers.
 */
export function ScannerView({ onResult, onError }: ScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'denied' | 'unavailable'>('starting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const decodedRef = useRef(false);

  useEffect(() => {
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
  }, [onError, onResult]);

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
            {/* corners */}
            <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
            <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
            <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
            <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
            {/* sweeping line */}
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
