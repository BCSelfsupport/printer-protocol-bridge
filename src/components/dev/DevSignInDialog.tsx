import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Shield, Loader2, ScanLine } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useLicense } from '@/contexts/LicenseContext';

interface DevSignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Stage = 'check' | 'enroll' | 'verify';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/**
 * TOTP-based developer sign-in.
 *  - Probes the server for enrollment status when opened.
 *  - If not enrolled, generates a TOTP secret and shows a QR.
 *  - Once enrolled, asks for the 6-digit code from the authenticator app.
 *
 * Replaces the old shared-password DEV_PORTAL_PASSWORD prompt.
 */
export function DevSignInDialog({ open, onOpenChange, onSuccess }: DevSignInDialogProps) {
  const { productKey } = useLicense();
  const [stage, setStage] = useState<Stage>('check');
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  // On open, probe status (only meaningful for prod — local dev should never see this dialog)
  useEffect(() => {
    if (!open) return;
    setError(null);
    setCode('');
    setSecret(null);
    setOtpauth(null);
    if (!productKey) {
      setError('No license key activated.');
      return;
    }
    setStage('check');
    setBusy(true);
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-dev-access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
          body: JSON.stringify({ product_key: productKey }),
        });
        const data = await res.json();
        if (!data.is_developer) {
          setError('This license is not authorised for developer access.');
          setStage('check');
          return;
        }
        setStage(data.enrolled ? 'verify' : 'enroll');
      } catch {
        setError('Could not reach the server.');
      } finally {
        setBusy(false);
      }
    })();
  }, [open, productKey]);

  const handleEnroll = async () => {
    if (!productKey) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-dev-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({ product_key: productKey, action: 'enroll' }),
      });
      const data = await res.json();
      if (data.otpauth_uri) {
        setSecret(data.secret);
        setOtpauth(data.otpauth_uri);
      } else {
        setError(data.error || 'Enrollment failed.');
      }
    } catch {
      setError('Enrollment failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productKey || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-dev-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({ product_key: productKey, totp_code: code.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        onSuccess();
        onOpenChange(false);
      } else {
        setError('Invalid code. Try the next one your app shows.');
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
          <p className="text-sm text-muted-foreground">
            Authenticator app required (Google Authenticator, 1Password, Authy, etc).
          </p>
        </DialogHeader>

        {busy && stage === 'check' && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {stage === 'enroll' && !otpauth && !busy && (
          <div className="space-y-4">
            <p className="text-sm">
              You haven't enrolled this license in 2-factor authentication yet. Click below
              to generate your authenticator secret. <strong>You will only see it once.</strong>
            </p>
            <Button onClick={handleEnroll} disabled={busy} className="w-full">
              <ScanLine className="w-4 h-4 mr-2" />
              Generate authenticator QR
            </Button>
          </div>
        )}

        {stage === 'enroll' && otpauth && (
          <div className="space-y-4">
            <p className="text-sm">
              Scan this QR with your authenticator app. If you can't scan, type the secret manually.
            </p>
            <div className="flex justify-center bg-white p-4 rounded-lg">
              <QRCodeSVG value={otpauth} size={200} />
            </div>
            <div className="text-center text-xs font-mono break-all bg-muted p-2 rounded">
              {secret}
            </div>
            <p className="text-xs text-muted-foreground">
              Once added, enter the 6-digit code below to confirm.
            </p>
            <form onSubmit={handleVerify} className="space-y-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                autoFocus
                className="text-center text-2xl tracking-widest font-mono"
              />
              <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & sign in'}
              </Button>
            </form>
          </div>
        )}

        {stage === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-sm">Enter the current 6-digit code from your authenticator app.</p>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              autoFocus
              className="text-center text-2xl tracking-widest font-mono"
            />
            <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
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
                        setStage(d2.enrolled ? 'verify' : 'enroll');
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
