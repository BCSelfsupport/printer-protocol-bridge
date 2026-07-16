import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Radio, RefreshCw, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import { printerEmulator } from '@/lib/printerEmulator';
import { cn } from '@/lib/utils';

type AckStatus = 'pending' | 'ok' | 'fail';

interface AckRow {
  id: number;
  name: string;
  ipAddress: string;
  before: string | null;
  requested: string;
  hmiAfter: string | null;
  status: AckStatus;
  response: string;
  verifyResponse: string;
  elapsedMs: number | null;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hasProtocolFailure = (response?: string) => {
  if (!response) return false;
  const upper = response.toUpperCase();
  return /\?\s*\d+\s*:/.test(upper)
    || /COMMAND\s+FAILED/.test(upper)
    || /\bERROR\b/.test(upper)
    || /\bERR\s*\[\s*[1-9]\d*\s*\]/.test(upper)
    || /\bFAILED\b/.test(upper)
    || /\bCANNOT\b/.test(upper);
};

const normalizeMessageName = (value: string) => value.trim().toUpperCase();

export function SlaveSelectionAckTest() {
  const [messageName, setMessageName] = useState('60DAYWHITE');
  const [simulateMisses, setSimulateMisses] = useState(false);
  const [rows, setRows] = useState<AckRow[]>([]);
  const [masterMessage, setMasterMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [emulatorEnabled, setEmulatorEnabled] = useState(multiPrinterEmulator.enabled);

  const ensureEmulatorEnabled = useCallback(() => {
    printerEmulator.enabled = true;
    multiPrinterEmulator.enabled = true;
    setEmulatorEnabled(true);
  }, []);

  const snapshotFleet = useCallback(() => {
    ensureEmulatorEnabled();
    const fleet = multiPrinterEmulator.getEmulatedPrinters();
    const master = fleet[0];
    const slaves = fleet.slice(1);

    if (master) {
      setMasterMessage(multiPrinterEmulator.getInstanceById(master.id)?.getState().currentMessage ?? null);
    }

    setRows(slaves.map((printer) => {
      const state = multiPrinterEmulator.getInstanceById(printer.id)?.getState();
      return {
        id: printer.id,
        name: printer.name,
        ipAddress: printer.ipAddress,
        before: state?.currentMessage ?? null,
        requested: normalizeMessageName(messageName),
        hmiAfter: state?.currentMessage ?? null,
        status: 'pending' as const,
        response: 'Snapshot only',
        verifyResponse: '',
        elapsedMs: null,
      };
    }));
  }, [ensureEmulatorEnabled, messageName]);

  const runSelectionAckTest = useCallback(async () => {
    const requested = normalizeMessageName(messageName);
    if (!requested) return;

    ensureEmulatorEnabled();
    setRunning(true);
    setLastRunAt(null);

    const fleet = multiPrinterEmulator.getEmulatedPrinters();
    const master = fleet[0];
    const slaves = fleet.slice(1);

    if (master) {
      const masterInstance = multiPrinterEmulator.getInstanceById(master.id);
      masterInstance?.processCommand(`^NM ${requested}`);
      masterInstance?.processCommand('^SV');
      masterInstance?.processCommand(`^SM ${requested}`);
      setMasterMessage(masterInstance?.getState().currentMessage ?? null);
    }

    const missingIds = new Set<number>(
      simulateMisses
        ? [slaves[3]?.id, slaves[8]?.id].filter((id): id is number => typeof id === 'number')
        : [],
    );

    setRows(slaves.map((printer) => {
      const state = multiPrinterEmulator.getInstanceById(printer.id)?.getState();
      return {
        id: printer.id,
        name: printer.name,
        ipAddress: printer.ipAddress,
        before: state?.currentMessage ?? null,
        requested,
        hmiAfter: state?.currentMessage ?? null,
        status: 'pending' as const,
        response: 'Waiting',
        verifyResponse: '',
        elapsedMs: null,
      };
    }));

    for (const printer of slaves) {
      const instance = multiPrinterEmulator.getInstanceById(printer.id);
      if (!instance) continue;

      await delay(120);
      const startedAt = performance.now();
      const before = instance.getState().currentMessage ?? null;

      if (missingIds.has(printer.id)) {
        if ((instance.getState().currentMessage ?? '').toUpperCase() === requested) {
          instance.processCommand('^SM BESTCODE');
        }
        instance.processCommand(`^DM ${requested}`);
      } else {
        instance.processCommand(`^NM ${requested}`);
        instance.processCommand('^SV');
      }

      const selectResult = instance.processCommand(`^SM ${requested}`);
      const verifyResult = instance.processCommand('^LM');
      const hmiAfter = instance.getState().currentMessage ?? null;
      const ok = selectResult.success
        && !hasProtocolFailure(selectResult.response)
        && hmiAfter?.toUpperCase() === requested;

      setRows((prev) => prev.map((row) => row.id === printer.id
        ? {
            ...row,
            before,
            hmiAfter,
            status: ok ? 'ok' : 'fail',
            response: selectResult.response || '(empty response)',
            verifyResponse: verifyResult.response || '(empty list)',
            elapsedMs: Math.round(performance.now() - startedAt),
          }
        : row,
      ));
    }

    setLastRunAt(new Date());
    setRunning(false);
  }, [ensureEmulatorEnabled, messageName, simulateMisses]);

  const summary = useMemo(() => {
    const ok = rows.filter((row) => row.status === 'ok').length;
    const fail = rows.filter((row) => row.status === 'fail').length;
    const pending = rows.filter((row) => row.status === 'pending').length;
    return { ok, fail, pending, total: rows.length };
  }, [rows]);

  return (
    <ScrollArea className="h-full p-4">
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Radio className="h-4 w-4 text-primary" />
                Master Selection ACK Test
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Virtual fleet: 1 master + 12 slaves
              </div>
            </div>
            <Badge variant={emulatorEnabled ? 'default' : 'outline'} className="shrink-0 text-[10px]">
              {emulatorEnabled ? 'Emulator on' : 'Emulator off'}
            </Badge>
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Message</Label>
              <Input
                value={messageName}
                onChange={(event) => setMessageName(event.target.value.toUpperCase())}
                className="h-9 font-mono text-sm"
                placeholder="60DAYWHITE"
                disabled={running}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" size="sm" onClick={snapshotFleet} disabled={running}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Snapshot
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/60 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Simulate two missing-message failures
            </div>
            <Switch checked={simulateMisses} onCheckedChange={setSimulateMisses} disabled={running} />
          </div>

          <Button className="w-full" onClick={runSelectionAckTest} disabled={running || !messageName.trim()}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            {running ? 'Testing selection ACKs...' : 'Run 13-printer ACK test'}
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-md border border-border bg-card p-2 text-center">
            <div className="text-[10px] uppercase text-muted-foreground">Targets</div>
            <div className="text-lg font-semibold text-foreground">{summary.total}</div>
          </div>
          <div className="rounded-md border border-success/40 bg-success/10 p-2 text-center">
            <div className="text-[10px] uppercase text-muted-foreground">ACK OK</div>
            <div className="text-lg font-semibold text-success">{summary.ok}</div>
          </div>
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-center">
            <div className="text-[10px] uppercase text-muted-foreground">Failed</div>
            <div className="text-lg font-semibold text-destructive">{summary.fail}</div>
          </div>
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-center">
            <div className="text-[10px] uppercase text-muted-foreground">Pending</div>
            <div className="text-lg font-semibold text-warning">{summary.pending}</div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Master HMI</span>
            <span className="font-mono font-semibold text-foreground">{masterMessage ?? '—'}</span>
          </div>
          {lastRunAt && (
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Last run</span>
              <span className="font-mono text-foreground">{lastRunAt.toLocaleTimeString()}</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              No ACK run yet.
            </div>
          ) : rows.map((row) => (
            <div key={row.id} className="rounded-md border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{row.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{row.ipAddress}:23</div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 text-[10px]',
                    row.status === 'ok' && 'border-success/50 bg-success/10 text-success',
                    row.status === 'fail' && 'border-destructive/50 bg-destructive/10 text-destructive',
                    row.status === 'pending' && 'border-warning/50 bg-warning/10 text-warning',
                  )}
                >
                  {row.status === 'ok' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                  {row.status === 'fail' && <XCircle className="mr-1 h-3 w-3" />}
                  {row.status === 'pending' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  {row.status.toUpperCase()}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <div className="text-muted-foreground">Before</div>
                  <div className="truncate font-mono text-foreground">{row.before ?? '—'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Requested</div>
                  <div className="truncate font-mono text-foreground">{row.requested}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">HMI after</div>
                  <div className={cn('truncate font-mono', row.status === 'ok' ? 'text-success' : 'text-foreground')}>
                    {row.hmiAfter ?? '—'}
                  </div>
                </div>
              </div>

              <div className="mt-2 rounded bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground">
                <div>^SM ACK: {row.response}</div>
                {row.elapsedMs != null && <div>Elapsed: {row.elapsedMs}ms</div>}
                {row.status === 'fail' && row.verifyResponse && (
                  <div className="mt-1 whitespace-pre-wrap">^LM: {row.verifyResponse}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}