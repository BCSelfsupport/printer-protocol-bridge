import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useLicense } from '@/contexts/LicenseContext';
import { Key, Loader2, CheckCircle2, XCircle, LogOut, Smartphone, QrCode, Download, Apple, Share2, ChevronDown } from 'lucide-react';
import { PairMobileDialog } from './PairMobileDialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface LicenseActivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LicenseActivationDialog({ open, onOpenChange }: LicenseActivationDialogProps) {
  const { activate, deactivate, pairAsCompanion, tier, isActivated, productKey, error, isLoading, isCompanion } = useLicense();
  const [keyInput, setKeyInput] = useState('');
  const [pairingInput, setPairingInput] = useState('');
  const [showPairMobile, setShowPairMobile] = useState(false);
  const [mode, setMode] = useState<'key' | 'pair'>('key');

  const handleActivate = async () => {
    const success = await activate(keyInput.trim().toUpperCase());
    if (success) {
      setKeyInput('');
    }
  };

  const handlePair = async () => {
    const success = await pairAsCompanion(pairingInput.trim());
    if (success) {
      setPairingInput('');
      setMode('key');
    }
  };

  const tierLabels: Record<string, { label: string; color: string }> = {
    lite: { label: 'LITE', color: 'bg-slate-100 text-slate-700' },
    full: { label: 'FULL', color: 'bg-blue-100 text-blue-700' },
    database: { label: 'DATABASE', color: 'bg-purple-100 text-purple-700' },
    demo: { label: 'DEMO', color: 'bg-amber-100 text-amber-700' },
    dev: { label: 'DEVELOPER', color: 'bg-green-100 text-green-700' },
  };

  const current = tierLabels[tier] || tierLabels.lite;
  const isMobile = !window.electronAPI;

  // Detect whether the page is already running as an installed PWA so we
  // don't nag users who have already added it to their home screen.
  const isInstalledPWA = typeof window !== 'undefined' && (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );

  // Detect platform for tailored install instructions
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPad|iPhone|iPod/.test(ua);

  const showInstallHint = isMobile && !isInstalledPWA;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              License Activation
            </DialogTitle>
            <DialogDescription>
              Enter your product key to unlock features
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current status */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">Current Tier</span>
              {isActivated && (productKey || isCompanion) ? (
                <div className="flex items-center gap-2">
                  {isCompanion && (
                    <Badge variant="outline" className="text-xs"><Smartphone className="w-3 h-3 mr-1" />Companion</Badge>
                  )}
                  <Badge className={current.color}>{current.label}</Badge>
                </div>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">NOT ACTIVATED</Badge>
              )}
            </div>

            {/* Active license info */}
            {isActivated && productKey && !isCompanion && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>License active</span>
                </div>
                <div className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">
                  {productKey}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={deactivate} className="flex-1">
                    <LogOut className="w-3 h-3 mr-1" />
                    Deactivate
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowPairMobile(true)} className="flex-1">
                    <QrCode className="w-3 h-3 mr-1" />
                    Pair Mobile
                  </Button>
                </div>
              </div>
            )}

            {/* Companion session info */}
            {isActivated && isCompanion && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Smartphone className="w-4 h-4" />
                  <span>Paired as companion device</span>
                </div>
                <Button variant="outline" size="sm" onClick={deactivate} className="w-full">
                  <LogOut className="w-3 h-3 mr-1" />
                  Unpair Device
                </Button>
              </div>
            )}

            {/* Dev mode info */}
            {isActivated && !productKey && !isCompanion && tier === 'dev' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Auto-assigned (dev build)</span>
                </div>
                <Button variant="outline" size="sm" onClick={deactivate} className="w-full">
                  <LogOut className="w-3 h-3 mr-1" />
                  Switch to LITE (test mode)
                </Button>
              </div>
            )}

            {/* Activation form */}
            {(!isActivated || (tier === 'dev' && !productKey && !isCompanion)) && (
              <div className="space-y-3">
                {/* Mode toggle for mobile */}
                {isMobile && (
                  <div className="flex gap-1 bg-muted rounded-lg p-1">
                    <button
                      onClick={() => setMode('key')}
                      className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${mode === 'key' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                    >
                      Product Key
                    </button>
                    <button
                      onClick={() => setMode('pair')}
                      className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${mode === 'pair' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                    >
                      Pair with PC
                    </button>
                  </div>
                )}

                {mode === 'key' ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-sm">Product Key</Label>
                      <Input
                        value={keyInput}
                        onChange={e => setKeyInput(e.target.value)}
                        placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                        className="font-mono text-center tracking-widest"
                        onKeyDown={e => e.key === 'Enter' && handleActivate()}
                      />
                    </div>
                    {error && (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <XCircle className="w-4 h-4" />
                        <span>{error}</span>
                      </div>
                    )}
                    <Button onClick={handleActivate} disabled={isLoading || !keyInput.trim()} className="w-full">
                      {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Key className="w-4 h-4 mr-2" />}
                      Activate
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-sm">Pairing Code</Label>
                      <Input
                        value={pairingInput}
                        onChange={e => setPairingInput(e.target.value.toUpperCase())}
                        placeholder="Enter 6-character code"
                        className="font-mono text-center tracking-[0.3em] text-lg"
                        maxLength={6}
                        onKeyDown={e => e.key === 'Enter' && handlePair()}
                      />
                      <p className="text-xs text-muted-foreground">
                        Open CodeSync on your PC → License → Pair Mobile to get a code
                      </p>
                    </div>
                    {error && (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <XCircle className="w-4 h-4" />
                        <span>{error}</span>
                      </div>
                    )}
                    <Button onClick={handlePair} disabled={isLoading || pairingInput.trim().length < 6} className="w-full">
                      {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Smartphone className="w-4 h-4 mr-2" />}
                      Pair with PC
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Tier descriptions */}
            <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
              <p><span className="font-semibold">LITE</span> — Standalone operation, no network</p>
              <p><span className="font-semibold">FULL</span> — Network printer access</p>
              <p><span className="font-semibold">DATABASE</span> — Full + Variable Data Printing</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PairMobileDialog open={showPairMobile} onOpenChange={setShowPairMobile} />
    </>
  );
}
