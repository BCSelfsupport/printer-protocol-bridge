import { useEffect, useMemo, useState } from 'react';
import { Database, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Printer } from '@/types/printer';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';
import type { CableJobConfig } from './cableJobs';

interface Props {
  config: CableJobConfig;
  onChange: (c: CableJobConfig) => void;
  printer: Printer | null;
  messageNames: string[];
  getStoredMessageForPrinter: (name: string, p?: Printer | null) => MessageDetails | null;
}

const NONE = '__none';

export function JobSetupPanel({ config, onChange, printer, messageNames, getStoredMessageForPrinter }: Props) {
  const [sources, setSources] = useState<{ id: string; name: string; columns: string[] }[]>([]);
  const [mapMessage, setMapMessage] = useState<string | null>(config.defaultMessage);

  useEffect(() => {
    supabase.from('data_sources').select('id, name, columns').order('created_at', { ascending: false })
      .then(({ data }) => setSources((data ?? []) as any));
  }, []);

  const source = sources.find((s) => s.id === config.dataSourceId);
  const columns = source?.columns ?? [];
  const mapFields = useMemo(
    () => (mapMessage ? getStoredMessageForPrinter(mapMessage, printer)?.fields ?? [] : []),
    [mapMessage, printer, getStoredMessageForPrinter],
  );
  const mapping = (mapMessage && config.mappings[mapMessage]) || {};

  const setFieldColumn = (fieldNum: number, col: string) => {
    if (!mapMessage) return;
    const next: Record<string, number[]> = {};
    Object.entries(mapping).forEach(([c, nums]) => {
      const rest = nums.filter((n) => n !== fieldNum);
      if (rest.length) next[c] = rest;
    });
    if (col !== NONE) next[col] = [...(next[col] ?? []), fieldNum];
    onChange({ ...config, mappings: { ...config.mappings, [mapMessage]: next } });
  };
  const columnForField = (n: number) => Object.entries(mapping).find(([, nums]) => nums.includes(n))?.[0] ?? NONE;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Database className="w-4 h-4" />Job Table</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The barcode on the production sheet is a job ID. Pick the table that holds your jobs (import it on the Data Sources screen) and the column that contains that ID.
          </p>
          <div className="space-y-1">
            <Label>Job table</Label>
            <Select value={config.dataSourceId ?? NONE} onValueChange={(v) => onChange({ ...config, dataSourceId: v === NONE ? null : v, idColumn: null, messageColumn: null })}>
              <SelectTrigger><SelectValue placeholder="Choose a table" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Job ID column (matches the sheet barcode)</Label>
            <Select value={config.idColumn ?? NONE} onValueChange={(v) => onChange({ ...config, idColumn: v === NONE ? null : v })} disabled={!source}>
              <SelectTrigger><SelectValue placeholder="Choose a column" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Message name column (optional)</Label>
            <Select value={config.messageColumn ?? NONE} onValueChange={(v) => onChange({ ...config, messageColumn: v === NONE ? null : v })} disabled={!source}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Always use the default message</SelectItem>
                {columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Default message</Label>
            <Select value={config.defaultMessage ?? NONE} onValueChange={(v) => { const m = v === NONE ? null : v; onChange({ ...config, defaultMessage: m }); setMapMessage(m); }}>
              <SelectTrigger><SelectValue placeholder="Choose a message" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {messageNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3 pt-2 border-t border-border">
            <Row label="Ask operator to confirm before sending" checked={config.requireConfirm} onChange={(v) => onChange({ ...config, requireConfirm: v })} />
            <Row label="Reset print counter on every new job" checked={config.resetCountersOnJob} onChange={(v) => onChange({ ...config, resetCountersOnJob: v })} />
            <Row label="Set length counter (Custom Counter 1) to a start value" checked={config.seedLengthCounter} onChange={(v) => onChange({ ...config, seedLengthCounter: v })} />
            {config.seedLengthCounter && (
              <div className="space-y-1">
                <Label className="text-xs">Length start value</Label>
                <Input type="number" min={0} value={config.lengthStart} onChange={(e) => onChange({ ...config, lengthStart: parseInt(e.target.value, 10) || 0 })} />
                <p className="text-xs text-muted-foreground">Put a Custom Counter 1 field in the message. It then counts up on the printer once per print, so with a 1 m (or 1 ft) pitch it reads as a running length.</p>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Operator name (saved in the job log)</Label>
              <Input value={config.operator} onChange={(e) => onChange({ ...config, operator: e.target.value })} placeholder="e.g. Marco" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Link2 className="w-4 h-4" />Column → Field Mapping</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Message</Label>
            <Select value={mapMessage ?? NONE} onValueChange={(v) => setMapMessage(v === NONE ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Choose a message" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {messageNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!mapMessage ? (
            <p className="text-sm text-muted-foreground">Choose a message to map its fields to job columns.</p>
          ) : mapFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">This message isn't in the library for the selected printer yet.</p>
          ) : (
            mapFields.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Field {i + 1} · {f.type}</div>
                  <div className="text-sm font-mono truncate">{f.data || '—'}</div>
                </div>
                <Select value={columnForField(i + 1)} onValueChange={(v) => setFieldColumn(i + 1, v)} disabled={!columns.length}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Keep as is</SelectItem>
                    {columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
