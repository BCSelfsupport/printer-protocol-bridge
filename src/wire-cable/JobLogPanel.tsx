import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { listJobLog, jobLogToCsv, type CableJobLogRow } from './cableJobs';

export function JobLogPanel({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<CableJobLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setRows(await listJobLog());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const exportCsv = () => {
    const blob = new Blob([jobLogToCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cable-job-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />Job Log
          <span className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="w-3.5 h-3.5 mr-1" />CSV</Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs logged yet. Scan a production sheet to start one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground text-left">
                <tr><th className="py-1 pr-3">Started</th><th className="pr-3">Job</th><th className="pr-3">Message</th><th className="pr-3">Printer</th><th className="pr-3">Operator</th><th className="pr-3 text-right">Length</th><th className="pr-3 text-right">Prints</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(r.started_at).toLocaleString()}</td>
                    <td className="pr-3 font-mono">{r.job_code}</td>
                    <td className="pr-3">{r.message_name}</td>
                    <td className="pr-3">{r.printer_name ?? r.printer_id}</td>
                    <td className="pr-3">{r.operator || '—'}</td>
                    <td className="pr-3 text-right tabular-nums">{Number(r.length_printed).toFixed(1)} {r.unit}</td>
                    <td className="pr-3 text-right tabular-nums">{r.print_count}</td>
                    <td><Badge variant={r.status === 'failed' ? 'destructive' : 'secondary'}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
