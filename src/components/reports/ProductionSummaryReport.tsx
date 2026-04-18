/**
 * Production Summary — simple "how many produced & how long" view.
 * No OEE math required; aimed at customers who don't track targets/downtime religiously.
 */

import { useMemo, useRef } from 'react';
import {
  Package, Timer, Gauge, Factory, TrendingUp,
} from 'lucide-react';
import type { ProductionRun } from '@/types/production';
import type { Printer } from '@/types/printer';
import type { DateScope } from '@/types/reportTemplates';
import { KpiCard } from './KpiCard';
import { ReportDownloadMenu } from './ReportDownloadMenu';
import { ProductionTrendChart, PerPrinterBarChart } from './ReportCharts';
import {
  filterRuns, aggregate, groupByPrinter, formatDuration, formatNumber,
  describeDateScope,
} from '@/lib/reportAggregation';
import { calculateOEE } from '@/types/production';

export function ProductionSummaryReport({
  runs, scope, printers,
}: {
  runs: ProductionRun[];
  scope: DateScope;
  printers: Printer[];
}) {
  const reportRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterRuns(runs, scope), [runs, scope]);
  const metrics = useMemo(() => aggregate(filtered), [filtered]);

  const perPrinterRows = useMemo(() => {
    const groups = groupByPrinter(filtered);
    return Array.from(groups.entries()).map(([printerId, prs]) => {
      const m = aggregate(prs);
      const printer = printers.find(p => p.id === printerId);
      return {
        id: printerId,
        name: printer?.name ?? `Printer ${printerId}`,
        produced: m.totalProduced,
        target: m.totalTarget,
        runTime: m.runTime,
        unitsPerHour: m.unitsPerHour,
        runCount: m.runCount,
        oee: m.oee,
      };
    }).sort((a, b) => b.produced - a.produced);
  }, [filtered, printers]);

  const chartData = useMemo(() =>
    perPrinterRows.map(r => ({ name: r.name, produced: r.produced, target: r.target, oee: r.oee })),
    [perPrinterRows],
  );

  return (
    <div className="space-y-4" ref={reportRef}>
      {/* Header strip */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-black text-foreground tracking-tight">Production Summary</h2>
          <p className="text-xs text-muted-foreground">{describeDateScope(scope)} · {filtered.length} run{filtered.length === 1 ? '' : 's'}</p>
        </div>
        <ReportDownloadMenu
          title="Production Summary"
          subtitle={describeDateScope(scope)}
          getElement={() => reportRef.current}
          runs={filtered}
          disabled={filtered.length === 0}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyReport label="No production runs in this range." />
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon={Package}
              label="Total Produced"
              value={formatNumber(metrics.totalProduced)}
              unit="units"
              accent="primary"
            />
            <KpiCard
              icon={Timer}
              label="Total Run Time"
              value={formatDuration(metrics.runTime)}
              accent="success"
              sublabel={`${metrics.runCount} run${metrics.runCount === 1 ? '' : 's'}`}
            />
            <KpiCard
              icon={Gauge}
              label="Avg Throughput"
              value={metrics.unitsPerHour.toFixed(0)}
              unit="u/hr"
              accent="warning"
            />
            <KpiCard
              icon={Factory}
              label="Active Lines"
              value={perPrinterRows.length}
              accent="accent"
              sublabel={`of ${printers.length} configured`}
            />
          </div>

          {/* Trend + per-printer comparison */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ProductionTrendChart runs={filtered} bucket={scope.bucket} />
            {perPrinterRows.length > 1
              ? <PerPrinterBarChart data={chartData} />
              : <div className="rounded-xl border border-border/40 bg-card p-5 flex flex-col items-center justify-center text-center min-h-[240px]">
                  <TrendingUp className="w-8 h-8 text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">Multi-printer comparison appears when {'>'}1 line is included.</p>
                </div>}
          </div>

          {/* Per-line table */}
          <div className="rounded-xl border border-border/40 bg-card shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
              <Factory className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Per-Line Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40">
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-4 py-2">Printer</th>
                    <th className="text-right px-3 py-2">Runs</th>
                    <th className="text-right px-3 py-2">Produced</th>
                    <th className="text-right px-3 py-2">Target</th>
                    <th className="text-right px-3 py-2">Run Time</th>
                    <th className="text-right px-4 py-2">Units/Hour</th>
                  </tr>
                </thead>
                <tbody>
                  {perPrinterRows.map(r => {
                    const attainPct = r.target > 0 ? (r.produced / r.target) * 100 : null;
                    return (
                      <tr key={r.id} className="border-t border-border/30 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-2.5 font-bold text-foreground">{r.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.runCount}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-foreground">{formatNumber(r.produced)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {r.target > 0 ? formatNumber(r.target) : '—'}
                          {attainPct !== null && (
                            <span className={`ml-1.5 text-[10px] font-bold ${attainPct >= 100 ? 'text-success' : attainPct >= 80 ? 'text-warning' : 'text-destructive'}`}>
                              {attainPct.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatDuration(r.runTime)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-primary">{r.unitsPerHour.toFixed(0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent runs */}
          <div className="rounded-xl border border-border/40 bg-card shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Recent Runs</h3>
              <span className="text-[10px] text-muted-foreground">({filtered.length} total)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40">
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-4 py-2">Message</th>
                    <th className="text-left px-3 py-2">Printer</th>
                    <th className="text-left px-3 py-2">Started</th>
                    <th className="text-right px-3 py-2">Produced</th>
                    <th className="text-right px-4 py-2">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 25).map(run => {
                    const oee = calculateOEE(run);
                    return (
                      <tr key={run.id} className="border-t border-border/30 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-2 font-semibold text-foreground truncate max-w-[200px]">{run.messageName}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{run.printerName}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                          {new Date(run.startTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{formatNumber(run.actualCount)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatDuration(oee.runTime)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyReport({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-12 text-center">
      <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground mt-1">Try adjusting the date range or printer filter.</p>
    </div>
  );
}
