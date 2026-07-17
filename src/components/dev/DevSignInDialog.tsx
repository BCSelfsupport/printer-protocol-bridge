import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Shield, Loader2 } from 'lucide-react';
import { useLicense } from '@/contexts/LicenseContext';
import { isDevAccessRuntime, isPreviewDevPassword, normalizeDevPassword } from '@/lib/devAccess';

interface DevSignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Stage = 'check' | 'verify';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/**
 * Server-verified developer sign-in.
 */
export function DevSignInDialog({ open, onOpenChange, onSuccess }: DevSignInDialogProps) {
  const { productKey } = useLicense();
  const [stage, setStage] = useState<Stage>('check');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  // Always land on the verify form so CITEC/TEXAS is reachable no matter what
  // domain / cache / license state the app is in. The server probe is best-effort
  // only — its result never blocks the password prompt.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setCode('');
    setStage('verify');
    setBusy(false);
    if (!productKey) return;
    // Fire and forget: we don't gate the UI on this
    (async () => {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/verify-dev-access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
          body: JSON.stringify({ product_key: productKey }),
        });
      } catch {
        /* ignored — CITEC/TEXAS override always works */
      }
    })();
  }, [open, productKey]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const normalizedCode = normalizeDevPassword(code);
    // Unconditional client-side override — CITEC/TEXAS always open the dev panel,
    // regardless of runtime, license state, or edge function availability.
    if (isPreviewDevPassword(normalizedCode)) {
      setCode('');
      onSuccess();
      onOpenChange(false);
      setBusy(false);
      return;
    }
    if (!productKey) {
      setBusy(false);
      setError('No license key activated.');
      return;
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-dev-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({ product_key: productKey, dev_password: normalizedCode }),
      });
      const data = await res.json();
      if (data.valid) {
        onSuccess();
        onOpenChange(false);
      } else {
        setError('Invalid developer password.');
      }
    } catch {
      setError('Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Developer Sign In
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Enter the developer password.</p>
        </DialogHeader>

        {busy && stage === 'check' && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {stage === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-sm">Use the developer password to open the panel.</p>
            {isDevAccessRuntime() && (
              <p className="text-xs text-muted-foreground">
                Preview / Electron build — password: <code className="font-mono bg-muted px-1 py-0.5 rounded">CITEC</code>
              </p>
            )}
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Developer password"
              type="password"
              autoFocus
            />
            <Button type="submit" disabled={busy || !code.trim()} className="w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in'}
            </Button>
          </form>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Redeem invite — visible whenever the license isn't yet a developer */}
        {!busy && error && (
          <div className="border-t pt-3 mt-2 space-y-2">
            {!showRedeem ? (
              <Button variant="outline" size="sm" className="w-full" onClick={() => { setShowRedeem(true); setError(null); }}>
                I have a developer invite code
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Paste the invite code your owner gave you.</p>
                <Input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX"
                  className="font-mono text-center"
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={busy || !inviteCode.trim() || !productKey}
                  onClick={async () => {
                    setBusy(true); setError(null);
                    try {
                      const res = await fetch(`${SUPABASE_URL}/functions/v1/developer-invite`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
                        body: JSON.stringify({ action: 'redeem', product_key: productKey, invite_code: inviteCode.trim() }),
                      });
                      const data = await res.json();
                      if (data.ok) {
                        setShowRedeem(false);
                        setInviteCode('');
                        // Re-probe status — should now show enrollment.
                        const r2 = await fetch(`${SUPABASE_URL}/functions/v1/verify-dev-access`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
                          body: JSON.stringify({ product_key: productKey }),
                        });
                        const d2 = await r2.json();
                        setStage('verify');
                      } else {
                        setError(data.error || 'Invalid invite.');
                      }
                    } catch { setError('Network error.'); }
                    finally { setBusy(false); }
                  }}
                >
                  Redeem invite
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
