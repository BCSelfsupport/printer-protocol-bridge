import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useLicense } from '@/contexts/LicenseContext';
import { Key, Loader2, CheckCircle2, XCircle, LogOut } from 'lucide-react';

interface LicenseActivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LicenseActivationDialog({ open, onOpenChange }: LicenseActivationDialogProps) {
  const { activate, deactivate, tier, isActivated, productKey, error, isLoading } = useLicense();
  const [keyInput, setKeyInput] = useState('');

  const handleActivate = async () => {
    const success = await activate(keyInput.trim().toUpperCase());
    if (success) {
      setKeyInput('');
    }
  };

  const tierLabels: Record<string, { label: string; color: string }> = {
    lite: { label: 'LITE', color: 'bg-slate-100 text-slate-700' },
    full: { label: 'FULL', color: 'bg-blue-100 text-blue-700' },
    database: { label: 'DATABASE', color: 'bg-purple-100 text-purple-700' },
    dev: { label: 'DEVELOPER', color: 'bg-green-100 text-green-700' },
  };

  const current = tierLabels[tier] || tierLabels.lite;

  return (
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
            <Badge className={current.color}>{current.label}</Badge>
          </div>

          {isActivated && productKey && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span>License active</span>
              </div>
              <div className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">
                {productKey}
              </div>
              <Button variant="outline" size="sm" onClick={deactivate} className="w-full">
                <LogOut className="w-3 h-3 mr-1" />
                Deactivate License
              </Button>
            </div>
          )}

          {!isActivated && (
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
  );
}
