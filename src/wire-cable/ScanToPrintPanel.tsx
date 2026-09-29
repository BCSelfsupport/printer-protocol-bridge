import { useCallback, useRef, useState } from 'react';
import { ScanBarcode, Smartphone, Send, Printer as PrinterIcon, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScanWaitingDialog } from '@/components/messages/ScanWaitingDialog';
import { useLicense } from '@/contexts/LicenseContext';
import type { Printer } from '@/types/printer';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';
import { useKeyboardWedgeScanner } from './useKeyboardWedgeScanner';
import {
  applyJobToFields, lookupJob, matchPrinterScan, logJobStart, logJobEnd,
  type CableJobConfig, type ResolvedJob,
} from './cableJobs';

export type SendJobFn = (
  printer: Printer,
  messageName: string,
  mapFields: (fields: MessageDetails['fields']) => MessageDetails['fields'],
  opts: { resetCounters: boolean; lengthStart: number | null },
) => Promise<{ ok: boolean; reason?: string }>;

interface Props {
  config: CableJobConfig;
  printers: Printer[];
  defaultPrinter: Printer | null;
  onSendJob: SendJobFn;
  printCount: number;
  lengthPerPrint: number;
  unitLabel: string;
  onLogged: () => void;
}

function getMachineId(): string {
  let id = localStorage.getItem('codesync-machine-id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('codesync-machine-id', id); }
  return id;
}

interface ActiveJob { logId: string | null; job: ResolvedJob; printer: Printer; startCount: number }

export function ScanToPrintPanel({ config, printers, defaultPrinter, onSendJob, printCount, lengthPerPrint, unitLabel, onLogged }: Props) {
  const { productKey } = useLicense();
  const [targetId, setTargetId] = useState<number | null>(defaultPrinter?.id ?? null);
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; text: string }>({ kind: 'idle', text: 'Ready — scan a production sheet' });
  const [pending, setPending] = useState<ResolvedJob | null>(null);
  const [active, setActive] = useState<ActiveJob | null>(null);
  const [phone, setPhone] = useState<{ id: string; expiresAt: string } | null>(null);
  const busyRef = useRef(false);

  const target = printers.find((p) => p.id === targetId) ?? null;

  const send = useCallback(async (job: ResolvedJob) => {
    if (!target) { setStatus({ kind: 'error', text: 'Choose or scan a printer first' }); return; }
    busyRef.current = true;
    setStatus({ kind: 'busy', text: `Sending ${job.jobCode} to ${target.name}…` });
    // Close the previous job on this line before starting a new one.
    if (active?.logId) {
      const prints = Math.max(0, printCount - active.startCount);
      await logJobEnd(active.logId, prints * lengthPerPrint, prints);
    }
    const mapping = config.mappings[job.messageName];
    const res = await onSendJob(target, job.messageName, (fields) => applyJobToFields(fields, mapping, job.values), {
      resetCounters: config.resetCountersOnJob,
      lengthStart: config.seedLengthCounter ? config.lengthStart : null,
    });
    const logId = await logJobStart({
      job_code: job.jobCode, message_name: job.messageName, printer_id: target.id, printer_name: target.name,
      operator: config.operator, data_source_id: config.dataSourceId, field_values: job.values, unit: unitLabel,
      status: res.ok ? 'sent' : 'failed', error_message: res.ok ? null : res.reason ?? null,
    });
    onLogged();
    busyRef.current = false;
    if (res.ok) {
      setActive({ logId, job, printer: target, startCount: config.resetCountersOnJob ? 0 : printCount });
      setStatus({ kind: 'ok', text: `${job.jobCode} is now printing on ${target.name}` });
      toast.success(`Job ${job.jobCode} sent to ${target.name}`);
    } else {
      setActive(null);
      setStatus({ kind: 'error', text: res.reason ?? 'Send failed' });
      toast.error(res.reason ?? 'Send failed');
    }
  }, [target, active, printCount, lengthPerPrint, config, onSendJob, unitLabel, onLogged]);

  const handleScan = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code || busyRef.current) return;
    const p = matchPrinterScan(code, printers);
    if (p) {
      setTargetId(p.id);
      setStatus({ kind: 'idle', text: `Printer set to ${p.name} — now scan the production sheet` });
      return;
    }
    setStatus({ kind: 'busy', text: `Looking up ${code}…` });
    const r = await lookupJob(code, config);
    if (!r.ok) { setStatus({ kind: 'error', text: r.reason }); toast.error(r.reason); return; }
    if (config.requireConfirm) { setPending(r.job); setStatus({ kind: 'idle', text: `Found ${r.job.jobCode} — confirm to send` }); }
    else await send(r.job);
  }, [printers, config, send]);

  useKeyboardWedgeScanner(handleScan, { enabled: !pending && !phone });

  const startPhoneScan = async () => {
    if (!productKey) { toast.error('Activate a licence first'); return; }
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-request?action=create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ product_key: productKey, machine_id: getMachineId(), message_name: 'CABLE JOB', prompt_label: 'PRODUCTION SHEET', max_length: 64 }),
      });
      const data = await res.json();
      if (!res.ok || !data.id) { toast.error(data.error || 'Could not start phone scan'); return; }
      setPhone({ id: data.id, expiresAt: data.expires_at });
    } catch { toast.error('Could not reach scan service'); }
  };

  const activePrints = active ? Math.max(0, printCount - active.startCount) : 0;
  const StatusIcon = status.kind === 'busy' ? Loader2 : status.kind === 'ok' ? CheckCircle2 : status.kind === 'error' ? AlertTriangle : ScanBarcode;
  const statusTone = status.kind === 'ok' ? 'text-success border-success/40' : status.kind === 'error' ? 'text-destructive border-destructive/40' : 'text-foreground border-border';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><ScanBarcode className="w-4 h-4" />Scan to Print</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`rounded-lg border-2 border-dashed p-4 flex items-center gap-3 ${statusTone}`}>
            <StatusIcon className={`w-7 h-7 shrink-0 ${status.kind === 'busy' ? 'animate-spin' : ''}`} />
            <div className="text-base font-medium">{status.text}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><PrinterIcon className="w-3.5 h-3.5" />Target printer (or scan a printer label like "P3")</span>
              <Select value={targetId != null ? String(targetId) : ''} onValueChange={(v) => setTargetId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Choose a printer" /></SelectTrigger>
                <SelectContent>
                  {printers.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)} disabled={!p.isAvailable}>
                      {p.name}{!p.isAvailable ? ' (offline)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={startPhoneScan}><Smartphone className="w-4 h-4 mr-1" />Scan with phone</Button>
          </div>

          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = manual; setManual(''); handleScan(v); }}>
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or type the job ID and press Enter" />
            <Button type="submit" disabled={!manual.trim()}><Send className="w-4 h-4" /></Button>
          </form>
          <p className="text-xs text-muted-foreground">A USB scanner works anywhere on this screen, so there's no need to click into a box first.</p>
        </CardContent>
      </Card>

      {active && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Current Job</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Info label="Job" value={active.job.jobCode} mono />
            <Info label="Printer" value={active.printer.name} />
            <Info label="Prints" value={activePrints.toLocaleString()} />
            <Info label="Length (est.)" value={`${(activePrints * lengthPerPrint).toFixed(1)} ${unitLabel}`} />
          </CardContent>
        </Card>
      )}

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setStatus({ kind: 'idle', text: 'Ready — scan a production sheet' }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Send job {pending?.jobCode}?</DialogTitle></DialogHeader>
          {pending && (
            <div className="space-y-3 text-sm">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary">Message: {pending.messageName}</Badge>
                <Badge variant={target?.isAvailable ? 'default' : 'destructive'}>Printer: {target?.name ?? 'none'}</Badge>
              </div>
              <div className="rounded border border-border divide-y divide-border max-h-60 overflow-auto">
                {Object.entries(pending.values).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 px-3 py-1.5">
                    <span className="text-muted-foreground">{k}</span><span className="font-mono text-right break-all">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button disabled={!target?.isAvailable} onClick={() => { const j = pending!; setPending(null); send(j); }}>
              <Send className="w-4 h-4 mr-1" />Send to printer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScanWaitingDialog
        open={!!phone}
        requestId={phone?.id ?? null}
        promptLabel="PRODUCTION SHEET"
        expiresAt={phone?.expiresAt ?? null}
        productKey={productKey ?? null}
        onFulfilled={(v) => { setPhone(null); handleScan(v); }}
        onCancel={async () => {
          if (phone && productKey) {
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-request?action=cancel`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
              body: JSON.stringify({ product_key: productKey, request_id: phone.id }),
            }).catch(() => {});
          }
          setPhone(null);
        }}
      />
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-semibold ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
