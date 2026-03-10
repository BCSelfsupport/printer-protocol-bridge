import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLicense } from '@/contexts/LicenseContext';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Loader2, RefreshCw, Timer } from 'lucide-react';

interface PairMobileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PairMobileDialog({ open, onOpenChange }: PairMobileDialogProps) {
  const { generatePairingCode } = useLicense();
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const generate = async () => {
    setIsGenerating(true);
    const result = await generatePairingCode();
    if (result) {
      setPairingCode(result.code);
      setExpiresAt(result.expiresAt);
    }
    setIsGenerating(false);
  };

  // Auto-generate on open
  useEffect(() => {
    if (open && !pairingCode) {
      generate();
    }
    if (!open) {
      setPairingCode(null);
      setExpiresAt(null);
      setSecondsLeft(0);
    }
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        setPairingCode(null);
        setExpiresAt(null);
      }
    };
    update();
    timerRef.current = setInterval(update, 1000);
    return () => clearInterval(timerRef.current);
  }, [expiresAt]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Build the QR payload — just the pairing code (simple, short)
  const qrValue = pairingCode || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Pair Mobile Device
          </DialogTitle>
          <DialogDescription>
            Open CodeSync on your phone and enter the code below, or scan the QR code
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {isGenerating ? (
            <div className="flex items-center gap-2 py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Generating code...</span>
            </div>
          ) : pairingCode ? (
            <>
              {/* QR Code */}
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG value={qrValue} size={180} level="M" />
              </div>

              {/* Text code */}
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Or enter this code manually:</p>
                <div className="text-3xl font-mono font-bold tracking-[0.3em] text-foreground">
                  {pairingCode}
                </div>
              </div>

              {/* Timer */}
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Timer className="w-4 h-4" />
                <span>Expires in {formatTime(secondsLeft)}</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-muted-foreground">Code expired</p>
              <Button onClick={generate} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Generate New Code
              </Button>
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
          <p>1. Open CodeSync on your mobile device</p>
          <p>2. Tap <strong>"Pair with PC"</strong> on the license screen</p>
          <p>3. Enter the 6-character code or scan the QR code</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
