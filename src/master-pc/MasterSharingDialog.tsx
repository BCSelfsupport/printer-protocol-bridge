import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Check, Copy, RefreshCw, Trash2, Monitor } from 'lucide-react';
import { useLicense } from '@/contexts/LicenseContext';
import { toast } from 'sonner';
import type { SharingInfo } from './types';
export function MasterSharingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [info, setInfo] = useState<SharingInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [operatorToken, setOperatorToken] = useState<string | null>(null);
  const { productKey } = useLicense();
  const api = window.electronAPI?.sharing;
  useEffect(() => {
    if (!open || !api) return;
    const refresh = () => api.info().then(setInfo).catch(() => {});
    void refresh(); const timer = setInterval(refresh, 2000); return () => clearInterval(timer);
  }, [open, api]);
  async function action(fn: () => Promise<SharingInfo>) { setBusy(true); try { setInfo(await fn()); } catch (e) { toast.error(e instanceof Error ? e.message : 'Sharing unavailable'); } finally { setBusy(false); } }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="flex gap-2 items-center"><Monitor className="h-5 w-5" />Master PC Sharing</DialogTitle></DialogHeader>
    {!api ? <p className="text-muted-foreground">Master PC sharing requires the updated Windows app.</p> : <div className="space-y-5">
      <div className="flex items-center justify-between"><Label htmlFor="master-sharing-enabled">Enable Master PC sharing</Label><Switch id="master-sharing-enabled" disabled={busy || !productKey} checked={info?.enabled ?? false} onCheckedChange={checked => { if (!productKey) return; void action(() => checked ? api.start({ productKey, machineId: localStorage.getItem('codesync-machine-id') ?? '', apiKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }) : api.stop()); }} /></div>
      {info?.enabled && <>
        <div className="space-y-2"><Label>Factory address</Label>{info.addresses.map(address => <div key={address} className="flex gap-2"><Input readOnly value={address} /><Button variant="outline" size="icon" aria-label="Copy factory address" onClick={() => { void navigator.clipboard.writeText(address); }}><Copy className="h-4 w-4" /></Button></div>)}</div>
        <div className="space-y-2"><Label>Master fingerprint</Label><div className="flex gap-2"><Input readOnly value={info.fingerprint ?? ''} className="font-mono text-xs" /><Button variant="outline" size="icon" aria-label="Copy Master fingerprint" onClick={() => { void navigator.clipboard.writeText(info.fingerprint ?? ''); }}><Copy className="h-4 w-4" /></Button></div></div>
        <div className="flex items-center justify-between gap-3"><div><Label>Pairing code</Label><p className="font-mono text-2xl">{info.code ?? '—'}</p>{info.expiresAt && info.code && <p className="text-xs text-muted-foreground">Expires {new Date(info.expiresAt).toLocaleTimeString()}</p>}</div><Button variant="outline" disabled={busy} onClick={() => { void action(api.newCode); }}><RefreshCw className="h-4 w-4 mr-2" />New code</Button></div>
        {info.pending.map(p => <div className="flex items-center justify-between border-b py-3 gap-2" key={p.id}><span>{p.name} · awaiting approval</span><Button onClick={() => { void action(() => api.approve(p.id)); }}><Check className="h-4 w-4 mr-2" />Approve</Button></div>)}
      </>}
      <div><h3 className="font-semibold mb-2">Viewing PCs</h3>{!info?.viewers.length && <p className="text-sm text-muted-foreground">No viewing PCs paired.</p>}{info?.viewers.map(v => <div className="flex items-center justify-between border-b py-3" key={v.id}><div>{v.name}<p className="text-xs text-muted-foreground">{info.enabled && Date.now() - v.lastSeen < 15000 ? 'Connected' : 'Offline'}</p></div><Button variant="ghost" size="icon" aria-label={`Remove access for ${v.name}`} onClick={() => { void action(() => api.revoke(v.id)); }}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
      <div className="border-t pt-4"><Button variant="outline" onClick={async () => { const relay = await window.electronAPI?.relay.getInfo(); setOperatorToken(relay?.operatorToken ?? null); }}>Mobile operator access</Button>{operatorToken && <div className="mt-2"><Label>Mobile operator token</Label><Input readOnly value={operatorToken} className="font-mono text-xs" /></div>}</div>
    </div>}
  </DialogContent></Dialog>;
}
