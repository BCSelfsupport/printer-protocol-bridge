import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Monitor, LogOut, Printer as PrinterIcon } from 'lucide-react';
import { toast } from 'sonner';
import { SharedReports } from './SharedReports';
import { sharedDataFresh } from './freshness';
import type { SharedHistory, ViewerState } from './types';
const EMPTY_HISTORY: SharedHistory = { runs: [], snapshots: [], templates: [] };
export function ViewerApp({ onLeave, paired }: { onLeave: () => void; paired: boolean }) {
  const [address, setAddress] = useState(''); const [fingerprint, setFingerprint] = useState(''); const [code, setCode] = useState(''); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [joined, setJoined] = useState(paired);
  const [state, setState] = useState<ViewerState>({ mode: 'viewer', status: 'pending' });
  const [history, setHistory] = useState(EMPTY_HISTORY); const [printerId, setPrinterId] = useState('');
  const [tab, setTab] = useState('overview');
  const api = window.electronAPI?.sharing;
  useEffect(() => {
    if (!api || !joined) return;
    let disposed = false, running = false, revision = -1;
    async function tick() {
      if (running || disposed || !api) return; running = true;
      try {
        const next = await api.poll(); if (disposed) return; setState(next);
        if (next.status === 'approved' && next.historyRevision !== revision) {
          const collected: Record<string, unknown[]> = { runs: [], snapshots: [], templates: [] };
          const expected = next.historyRevision;
          for (const store of ['runs', 'snapshots', 'templates'] as const) {
            let offset: number | null = 0;
            while (offset !== null) { const page = await api.readHistory(store, offset); if (page.revision !== expected) throw new Error('History updated; refreshing'); collected[store].push(...page.records); offset = page.next; if (disposed) return; }
          }
          setHistory(collected as unknown as SharedHistory); revision = expected ?? -1;
        }
      } catch { if (!disposed) setState(prev => ({ ...prev, status: 'offline' })); } finally { running = false; }
    }
    void tick(); const timer = setInterval(tick, 3000); return () => { disposed = true; clearInterval(timer); };
  }, [api, joined]);
  async function join() { if (!api) return; setBusy(true); try { await api.join({ address: address.trim(), fingerprint: fingerprint.trim(), code: code.trim(), name: name.trim() }); setJoined(true); } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to connect'); } finally { setBusy(false); } }
  async function leave() { await api?.leave(); onLeave(); }
  const fresh = state.status === 'approved' && sharedDataFresh(state.snapshot?.observedAt);
  const printers = state.snapshot?.printers ?? [];
  const reading = state.snapshot?.metrics[Number(printerId)];
  const readingFresh = fresh && sharedDataFresh(reading?.observedAt);
  if (!joined) return <div className="h-dvh overflow-y-auto bg-background text-foreground p-6"><div className="max-w-lg mx-auto py-12 space-y-5"><Monitor className="h-10 w-10 text-primary" /><h1 className="text-2xl font-bold">Connect to Master PC</h1>
    {[['Factory address', address, setAddress, '192.168.1.50:8767'], ['Master fingerprint', fingerprint, setFingerprint, ''], ['Pairing code', code, setCode, ''], ['This PC name', name, setName, 'Production Office']].map(([label, value, setter, placeholder]) => <div className="space-y-2" key={String(label)}><Label htmlFor={String(label)}>{String(label)}</Label><Input id={String(label)} value={String(value)} placeholder={String(placeholder)} onChange={e => { if (typeof setter === 'function') setter(e.target.value); }} /></div>)}
    <div className="flex gap-3"><Button disabled={busy || !api || !address || !fingerprint || !code || !name} onClick={() => { void join(); }}>Connect</Button><Button variant="outline" onClick={onLeave}>Back</Button></div>{!api && <p className="text-muted-foreground">Viewing mode requires the updated Windows app.</p>}
  </div></div>;
  return <div className="h-dvh flex flex-col bg-background text-foreground"><header className="border-b flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex flex-wrap gap-3 items-center"><Monitor className="h-5 w-5" /><h1 className="font-semibold">{state.name ?? 'Master PC'}</h1><Badge variant="outline">View only</Badge><span className={fresh ? 'text-primary text-sm' : 'text-destructive text-sm'}>{fresh ? 'Connected' : state.status === 'pending' ? 'Waiting for Master approval' : state.status === 'revoked' ? 'Access removed — pair again' : 'Master offline / data out of date'}</span>{state.snapshot && <span className="text-xs text-muted-foreground">Updated {new Date(state.snapshot.observedAt).toLocaleTimeString()}</span>}</div><Button variant="outline" onClick={() => { void leave(); }}><LogOut className="h-4 w-4 mr-2" />Disconnect</Button></header>
    <main className="flex-1 overflow-y-auto p-4 md:p-6"><Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="overview">Printer overview</TabsTrigger><TabsTrigger value="service">Service data</TabsTrigger><TabsTrigger value="reports">Reports</TabsTrigger></TabsList>
      <TabsContent value="overview"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{printers.map(p => <div className="border rounded-lg p-4 bg-card space-y-3" key={p.id}><div className="flex items-center gap-3"><PrinterIcon className="h-8 w-8 text-muted-foreground" /><div><h2 className="font-semibold">{p.name}</h2><p className="text-sm text-muted-foreground">ID {p.id}</p></div><Badge className="ml-auto" variant={fresh && p.hasActiveErrors ? 'destructive' : 'outline'}>{!fresh ? 'Out of date' : p.status}</Badge></div><dl className="grid grid-cols-2 gap-2 text-sm"><dt>Message</dt><dd>{p.currentMessage ?? 'Unavailable'}</dd><dt>Print count</dt><dd>{p.printCount ?? 'Unavailable'}</dd><dt>Ink</dt><dd>{fresh ? p.inkLevel ?? 'Unavailable' : 'Out of date'}</dd><dt>Makeup</dt><dd>{fresh ? p.makeupLevel ?? 'Unavailable' : 'Out of date'}</dd><dt>Faults</dt><dd>{!fresh ? 'Out of date' : p.hasActiveErrors ? 'Active' : p.isConnected || p.jetRunning !== undefined ? 'None reported' : 'Unavailable'}</dd></dl><Button variant="outline" onClick={() => { setPrinterId(String(p.id)); setTab('service'); }}>Service data</Button></div>)}</div></TabsContent>
      <TabsContent value="service"><div className="space-y-4 max-w-3xl"><Select value={printerId} onValueChange={setPrinterId}><SelectTrigger><SelectValue placeholder="Select printer" /></SelectTrigger><SelectContent>{printers.map(p => <SelectItem value={String(p.id)} key={p.id}>{p.name} · ID {p.id}</SelectItem>)}</SelectContent></Select>{reading && <p className="text-sm text-muted-foreground">Reading from {new Date(reading.observedAt).toLocaleTimeString()}</p>}<dl className="divide-y">{[['Pressure', 'pressure', 'PSI'], ['Viscosity', 'viscosity', 'cP'], ['Modulation', 'modulation', 'V'], ['Charge', 'charge', '%'], ['RPS', 'rps', 'rev/s'], ['Phase quality', 'phaseQual', '%'], ['Printhead temperature', 'printheadTemp', '°C'], ['Electronics temperature', 'electronicsTemp', '°C'], ['Power hours', 'powerHours', ''], ['Stream hours', 'streamHours', ''], ['Ink', 'inkLevel', ''], ['Makeup', 'makeupLevel', '']].map(([label, key, unit]) => { const value = reading?.values[key as keyof typeof reading.values]; return <div key={key} className="flex justify-between gap-4 py-3"><dt>{label}</dt><dd className="font-mono">{!readingFresh ? reading ? 'Out of date' : 'Unavailable' : value === undefined || value === null ? 'Unavailable' : `${String(value)} ${unit}`}</dd></div>; })}</dl></div></TabsContent>
      <TabsContent value="reports"><SharedReports history={history} printers={printers} /></TabsContent>
    </Tabs></main></div>;
}
