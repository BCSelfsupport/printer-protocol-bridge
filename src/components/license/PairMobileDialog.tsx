import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLicense, type CompanionDevice } from '@/contexts/LicenseContext';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Loader2, RefreshCw, Timer, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface PairMobileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Public PWA URL operators install on their phones.
const MOBILE_APP_URL = 'https://bestcode-codesync.lovable.app';

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


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Pair Mobile Device
          </DialogTitle>
          <DialogDescription className="sr-only">Scan the QR code with the phone camera</DialogDescription>
        </DialogHeader>

        {/* One step: the QR opens the app on the phone AND pairs it. */}
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex items-center gap-3 text-foreground" aria-label="Phone camera to QR code">
            <Smartphone className="w-10 h-10 text-primary" />
            <span className="text-3xl font-bold text-primary">→</span>
            <div className="w-10 h-10 border-4 border-primary rounded-md" />
          </div>

          {isGenerating ? (
            <div className="flex items-center justify-center w-[260px] h-[260px]">
              <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
            </div>
          ) : pairingCode ? (
            <>
              <div className="bg-white p-4 rounded-xl">
                <QRCodeSVG value={`${MOBILE_APP_URL}/?pair=${pairingCode}`} size={240} level="M" />
              </div>
              <div className="flex items-center gap-2 text-lg text-muted-foreground font-mono">
                <Timer className="w-5 h-5" />
                {formatTime(secondsLeft)}
              </div>
              <div className="text-xl font-mono font-bold tracking-[0.3em] text-muted-foreground">
                {pairingCode}
              </div>
            </>
          ) : (
            <Button onClick={generate} size="lg" className="h-20 w-20 rounded-full" aria-label="New QR code">
              <RefreshCw className="w-10 h-10" />
            </Button>
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

      </DialogContent>
    </Dialog>
  );
}
