import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Camera, ArrowRight, Loader2, Trash2, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { printerEmulator } from '@/lib/printerEmulator';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';

/** Commands we query to build a full parameter snapshot */
const SNAPSHOT_COMMANDS = [
  { code: '^PW', label: 'Width' },
  { code: '^PH', label: 'Height' },
  { code: '^PD', label: 'Delay' },
  { code: '^PS', label: 'Speed' },
  { code: '^PR', label: 'Repeat' },
  { code: '^CM', label: 'Change Message (Speed/Offset/Pitch)' },
  { code: '^GM', label: 'Get Message Params' },
  { code: '^SM', label: 'Selected Message' },
  { code: '^SU', label: 'Status' },
];

interface Snapshot {
  timestamp: Date;
  label: string;
  values: Record<string, string>;
}

interface ParameterSnapshotProps {
  emulatorEnabled: boolean;
  connectedPrinterId?: number;
  connectedPrinterIp?: string;
  connectedPrinterPort?: number;
}

export function ParameterSnapshot({
  emulatorEnabled,
  connectedPrinterId,
  connectedPrinterIp,
  connectedPrinterPort,
}: ParameterSnapshotProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const canQuery = emulatorEnabled || (!!window.electronAPI && connectedPrinterId != null);

  const getEmulator = () => {
    if (multiPrinterEmulator.enabled && connectedPrinterIp) {
      return multiPrinterEmulator.getInstanceByIp(connectedPrinterIp, connectedPrinterPort) || printerEmulator;
    }
    return printerEmulator;
  };

  const takeSnapshot = useCallback(async () => {
    if (!canQuery) return;
    setLoading(true);

    const values: Record<string, string> = {};

    for (const cmd of SNAPSHOT_COMMANDS) {
      try {
        if (emulatorEnabled) {
          const result = getEmulator().processCommand(cmd.code);
          values[cmd.code] = result.response || '(empty)';
        } else if (window.electronAPI && connectedPrinterId != null) {
          const result = await window.electronAPI.printer.sendCommand(connectedPrinterId, cmd.code);
          if (result.success) {
            values[cmd.code] = result.response || '(empty)';
          } else {
            values[cmd.code] = `ERR: ${result.error}`;
          }
        }
        // Small delay between commands to avoid firmware stalls
        if (!emulatorEnabled) {
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (err: any) {
        values[cmd.code] = `ERR: ${err.message}`;
      }
    }

    const snapshot: Snapshot = {
      timestamp: new Date(),
      label: `Snapshot ${snapshots.length + 1}`,
      values,
    };

    setSnapshots(prev => [snapshot, ...prev]);
    setLoading(false);
  }, [canQuery, emulatorEnabled, connectedPrinterId, connectedPrinterIp, connectedPrinterPort, snapshots.length]);

  const exportSnapshots = () => {
    const lines = snapshots.map((snap, i) => {
      const header = `=== ${snap.label} (${snap.timestamp.toLocaleString()}) ===`;
      const entries = SNAPSHOT_COMMANDS.map(cmd => `  ${cmd.code} (${cmd.label}): ${snap.values[cmd.code] || 'N/A'}`);
      return [header, ...entries].join('\n');
    }).join('\n\n');

    const blob = new Blob([lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `param-snapshots-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Find differences between the two most recent snapshots
  const getDiff = (): { code: string; label: string; before: string; after: string }[] | null => {
    if (snapshots.length < 2) return null;
    const after = snapshots[0];
    const before = snapshots[1];
    const diffs: { code: string; label: string; before: string; after: string }[] = [];
    for (const cmd of SNAPSHOT_COMMANDS) {
      const bVal = before.values[cmd.code] || '';
      const aVal = after.values[cmd.code] || '';
      if (bVal !== aVal) {
        diffs.push({ code: cmd.code, label: cmd.label, before: bVal, after: aVal });
      }
    }
    return diffs;
  };

  const diff = getDiff();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Camera className="w-3.5 h-3.5" />
          Parameter Snapshot
        </h4>
        <div className="flex gap-1">
          {snapshots.length > 0 && (
            <>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={exportSnapshots}>
                <Download className="w-3 h-3 mr-1" />Export
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setSnapshots([])}>
                <Trash2 className="w-3 h-3 mr-1" />Clear
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Take a snapshot before &amp; after changing settings on the printer HMI to see which parameters changed.
      </p>

      <Button
        size="sm"
        onClick={takeSnapshot}
        disabled={!canQuery || loading}
        className="w-full"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Querying printer...</>
        ) : (
          <><Camera className="w-4 h-4 mr-2" />Take Snapshot ({snapshots.length})</>
        )}
      </Button>

      {/* Diff display */}
      {diff !== null && (
        <div className="bg-muted/50 rounded-lg border border-border p-3">
          <h5 className="text-[10px] font-semibold text-foreground mb-2 flex items-center gap-1">
            <ArrowRight className="w-3 h-3" />
            Changes Detected ({diff.length})
          </h5>
          {diff.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">No differences — nothing changed between the last two snapshots.</p>
          ) : (
            <div className="space-y-2">
              {diff.map(d => (
                <div key={d.code} className="bg-background rounded p-2 border border-primary/30">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-[10px] font-bold text-primary">{d.code}</code>
                    <span className="text-[9px] text-muted-foreground">{d.label}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center text-[10px] font-mono">
                    <span className="text-destructive bg-destructive/10 rounded px-1 py-0.5 break-all">{d.before}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="text-success bg-success/10 rounded px-1 py-0.5 break-all">{d.after}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Snapshot list */}
      {snapshots.length > 0 && (
        <div className="space-y-2">
          {snapshots.map((snap, i) => (
            <details key={i} className="bg-muted/50 rounded border border-border">
              <summary className="px-3 py-2 cursor-pointer text-[10px] font-mono text-foreground flex items-center justify-between">
                <span>{snap.label}</span>
                <Badge variant="outline" className="text-[9px]">
                  {snap.timestamp.toLocaleTimeString()}
                </Badge>
              </summary>
              <div className="px-3 pb-2 space-y-1">
                {SNAPSHOT_COMMANDS.map(cmd => (
                  <div key={cmd.code} className="flex gap-2 text-[10px] font-mono">
                    <code className={cn("shrink-0 font-bold", "text-primary")}>{cmd.code}</code>
                    <span className="text-muted-foreground shrink-0">({cmd.label})</span>
                    <span className="text-foreground break-all">{snap.values[cmd.code] || 'N/A'}</span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
