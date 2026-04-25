import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Copy, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { useLicense } from '@/contexts/LicenseContext';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/**
 * Owner-only developer-invite generator. Renders inside the Dev Panel.
 * Creating an invite requires the owner's current TOTP code (re-confirmed).
 */
export function DevInvitePanel() {
  const { productKey, isOwnerDeveloper } = useLicense();
  const [totp, setTotp] = useState('');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ code: string; expires_at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOwnerDeveloper) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Only the master owner key can issue developer invites.
      </div>
    );
  }

  const handleCreate = async () => {
    if (!productKey || totp.length !== 6) return;
    setBusy(true);
    setError(null);
    setInvite(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/developer-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({
          action: 'create',
          owner_key: productKey,
          owner_totp_code: totp,
        }),
      });
      const data = await res.json();
      if (data.code) {
        setInvite(data);
        setTotp('');
      } else {
        setError(data.error || 'Could not create invite.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied'));
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-semibold">Developer Invites</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Generate a one-time invite code, valid for 24 hours. The recipient pastes
        it on their machine to promote their license to developer status. They
        will then enroll their own authenticator on first sign-in.
      </p>

      <Card className="p-3 space-y-2">
        <label className="text-xs font-medium">Confirm with your authenticator code</label>
        <Input
          value={totp}
          onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          inputMode="numeric"
          className="text-center text-lg tracking-widest font-mono"
        />
        <Button onClick={handleCreate} disabled={busy || totp.length !== 6} className="w-full" size="sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Create invite</>}
        </Button>
      </Card>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {invite && (
        <Card className="p-3 space-y-2 border-emerald-500/40 bg-emerald-500/5">
          <div className="text-xs text-muted-foreground">New invite (single use)</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-base font-mono bg-background p-2 rounded border">
              {invite.code}
            </code>
            <Button size="sm" variant="ghost" onClick={() => copy(invite.code)}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Expires {new Date(invite.expires_at).toLocaleString()}
          </div>
        </Card>
      )}
    </div>
  );
}
