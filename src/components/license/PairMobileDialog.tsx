import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLicense, type CompanionDevice } from '@/contexts/LicenseContext';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Loader2, RefreshCw, Timer, Trash2, CheckCircle2, Download, Apple, Copy, Share2, PlusSquare } from 'lucide-react';
import { toast } from 'sonner';

interface PairMobileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function shortenId(id: string): string {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

export function PairMobileDialog({ open, onOpenChange }: PairMobileDialogProps) {
  const { generatePairingCode, listPairedCompanions, revokeCompanion } = useLicense();
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const [pairedDevices, setPairedDevices] = useState<CompanionDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const generate = async () => {
    setIsGenerating(true);
    const result = await generatePairingCode();
    if (result) {
      setPairingCode(result.code);
      setExpiresAt(result.expiresAt);
    }
    setIsGenerating(false);
  };

  const refreshDevices = useCallback(async () => {
    setIsLoadingDevices(true);
    const list = await listPairedCompanions();
    setPairedDevices(list);
    setIsLoadingDevices(false);
  }, [listPairedCompanions]);

  // Auto-generate code + load device list on open
  useEffect(() => {
    if (open) {
      if (!pairingCode) generate();
      refreshDevices();
    }
    if (!open) {
      setPairingCode(null);
      setExpiresAt(null);
      setSecondsLeft(0);
      setPairedDevices([]);
    }
  }, [open]);

  // Poll for newly-paired devices every 5s while dialog is open
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(refreshDevices, 5000);
    return () => clearInterval(interval);
  }, [open, refreshDevices]);

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

  const handleRevoke = async (device: CompanionDevice) => {
    setRevokingId(device.id);
    const ok = await revokeCompanion(device.id);
    if (ok) {
      toast.success('Device unpaired');
      setPairedDevices(prev => prev.filter(d => d.id !== device.id));
    }
    setRevokingId(null);
  };

  const qrValue = pairingCode || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Pair Mobile Device
          </DialogTitle>
          <DialogDescription>
            Open CodeSync on your phone and enter the code below, or scan the QR code. You can pair multiple phones to this license.
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
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG value={qrValue} size={180} level="M" />
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Or enter this code manually:</p>
                <div className="text-3xl font-mono font-bold tracking-[0.3em] text-foreground">
                  {pairingCode}
                </div>
              </div>
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

        {/* Paired Devices List */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Smartphone className="w-4 h-4" />
              Paired Devices
              <span className="text-xs font-normal text-muted-foreground">
                ({pairedDevices.length})
              </span>
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshDevices}
              disabled={isLoadingDevices}
              className="h-7 px-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDevices ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {pairedDevices.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-3 text-center">
              {isLoadingDevices ? 'Loading…' : 'No phones paired yet'}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
              {pairedDevices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-md border border-border"
                >
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono text-foreground truncate">
                      {shortenId(device.companion_machine_id)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Paired {formatRelative(device.paired_at)} · Last seen {formatRelative(device.last_seen)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(device)}
                    disabled={revokingId === device.id}
                    className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Unpair this device"
                  >
                    {revokingId === device.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              ))}
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
