import { forwardRef, useMemo } from 'react';
import {
  Package, Target, Timer, ArrowDownCircle, TrendingUp, Gauge, BarChart3, AlertTriangle,
  Activity, Hash, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import type { ProductionRun } from '@/types/production';
import type { Printer } from '@/types/printer';
import type { CustomReportTemplate } from '@/types/reportTemplates';
import { DEFAULT_SHIFTS } from '@/types/reportTemplates';
import {
  resolveScope, filterRuns, aggregate, bucketRuns, downtimeByReason, topMessages,
  groupByPrinter, groupByShift, hourlyHeatmap, formatDuration, DOWNTIME_LABELS,
} from '@/lib/reportAggregation';

interface Props {
  template: CustomReportTemplate;
  runs: ProductionRun[];
  printers: Printer[];
}

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', '#06b6d4', '#a855f7', '#ec4899', '#f59e0b', '#10b981'];

function KPI({ icon: Icon, label, value, sub, accent = 'primary' }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  accent?: 'primary' | 'success' | 'warning' | 'destructive';
}) {
  const map = {
    primary: 'from-primary/10 border-primary/20',
    success: 'from-success/10 border-success/20',
    warning: 'from-warning/10 border-warning/20',
    destructive: 'from-destructive/10 border-destructive/20',
  };
  const iconMap = {
    primary: 'text-primary', success: 'text-success', warning: 'text-warning', destructive: 'text-destructive',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br to-transparent p-3 md:p-4 ${map[accent]}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${iconMap[accent]}`} />
        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl md:text-2xl font-black text-foreground tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export const CustomReportRenderer = forwardRef<HTMLDivElement, Props>(({ template, runs, printers }, ref) => {
  const range = useMemo(() => resolveScope(template.scope), [template.scope]);
  const filtered = useMemo(() => {
    let r = filterRuns(runs, range, template.scope.printerIds);
    if (template.messageFilter && template.messageFilter.trim()) {
      const q = template.messageFilter.trim().toLowerCase();
      r = r.filter(x => x.messageName.toLowerCase().includes(q));
    }
    if (template.downtimeReasons && template.downtimeReasons.length > 0) {
      const set = new Set(template.downtimeReasons);
      r = r.map(run => ({
        ...run,
        downtimeEvents: run.downtimeEvents.filter(e => set.has(e.reason)),
      }));
    }
    return r;
  }, [runs, range, template.scope.printerIds, template.messageFilter, template.downtimeReasons]);

  const summary = useMemo(() => aggregate(filtered), [filtered]);
  const buckets = useMemo(() => bucketRuns(filtered, template.scope.bucket), [filtered, template.scope.bucket]);
  const downtimePareto = useMemo(() => downtimeByReason(filtered), [filtered]);
  const topMsgs = useMemo(() => topMessages(filtered, 8), [filtered]);
  const byPrinter = useMemo(() => groupByPrinter(filtered), [filtered]);
  const byShift = useMemo(() => groupByShift(filtered, DEFAULT_SHIFTS), [filtered]);
  const heatmap = useMemo(() => hourlyHeatmap(filtered), [filtered]);

  const showViz = (key: typeof template.visualizations[number]) => template.visualizations.includes(key);
  const showMetric = (key: typeof template.metrics[number]) => template.metrics.includes(key);

  const heatmapMax = Math.max(...heatmap.flat(), 1);
  const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  if (filtered.length === 0) {
    return (
      <div ref={ref} className="rounded-2xl border bg-card p-12 text-center">
        <BarChart3 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-base font-semibold text-foreground mb-1">No data matches this template</p>
        <p className="text-sm text-muted-foreground">Adjust the filters or expand the date range.</p>
      </div>
    );
  }

  return (
    <div ref={ref} className="space-y-4 bg-background p-1">
      {/* KPI cards */}
      {showViz('kpiCards') && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {showMetric('produced') && <KPI icon={Package} label="Produced" value={summary.produced.toLocaleString()} accent="primary" />}
          {showMetric('target') && <KPI icon={Target} label="Target" value={summary.target.toLocaleString()} accent="primary" />}
          {showMetric('attainment') && <KPI icon={TrendingUp} label="Attainment" value={`${summary.attainment.toFixed(1)}%`}
            accent={summary.attainment >= 100 ? 'success' : summary.attainment >= 80 ? 'warning' : 'destructive'} />}
          {showMetric('runTime') && <KPI icon={Timer} label="Run Time" value={formatDuration(summary.runTime)} accent="warning" />}
          {showMetric('downtime') && <KPI icon={ArrowDownCircle} label="Downtime" value={formatDuration(summary.downtime)} accent="destructive" />}
          {showMetric('unitsPerHour') && <KPI icon={Activity} label="Units / Hour" value={summary.unitsPerHour.toFixed(0)} accent="success" />}
          {showMetric('oee') && <KPI icon={Gauge} label="OEE" value={`${summary.oee.toFixed(1)}%`}
            accent={summary.oee >= 60 ? 'success' : 'destructive'} />}
          {showMetric('availability') && <KPI icon={Activity} label="Availability" value={`${summary.availability.toFixed(1)}%`} accent="success" />}
          {showMetric('performance') && <KPI icon={Activity} label="Performance" value={`${summary.performance.toFixed(1)}%`} accent="warning" />}
          {showMetric('runCount') && <KPI icon={Hash} label="Runs" value={summary.runCount.toString()} accent="primary" />}
          {showMetric('avgRunDuration') && <KPI icon={Clock} label="Avg Run" value={formatDuration(summary.avgRunDuration)} accent="primary" />}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Production trend */}
        {showViz('productionTrend') && (
          <div className="rounded-2xl border bg-card p-4 md:p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Production Trend</h3>
              <span className="text-xs text-muted-foreground ml-auto">Per {template.scope.bucket}</span>
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={buckets}>
                  <defs>
                    <linearGradient id="cstmProd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }} />
                  <Area type="monotone" dataKey="produced" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#cstmProd)" name="Produced" />
                  {showMetric('target') && (
                    <Area type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 4" fill="none" name="Target" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* OEE trend */}
        {showViz('oeeTrend') && (
          <div className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">OEE Trend</h3>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={buckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }} />
                  <Line type="monotone" dataKey="oee" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} name="OEE %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Downtime pareto */}
        {showViz('downtimePareto') && (
          <div className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <h3 className="text-sm font-bold text-foreground">Downtime Pareto</h3>
            </div>
            {downtimePareto.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No downtime recorded</p>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={downtimePareto.map(d => ({ name: DOWNTIME_LABELS[d.reason] ?? d.reason, minutes: Math.round(d.totalMs / 60000), count: d.count }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={100} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }} />
                    <Bar dataKey="minutes" fill="hsl(var(--destructive))" radius={[0, 6, 6, 0]} name="Minutes" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Shift comparison */}
        {showViz('shiftComparison') && (
          <div className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Shift Comparison</h3>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={DEFAULT_SHIFTS.map(s => {
                  const rs = byShift.get(s.id) ?? [];
                  const a = aggregate(rs);
                  return { name: s.name, Produced: a.produced, Target: a.target };
                })}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="Target" fill="hsl(var(--muted))" radius={[6, 6, 0, 0]} barSize={28} />
                  <Bar dataKey="Produced" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Message pie */}
        {showViz('messagePie') && (
          <div className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Top Products</h3>
            </div>
            {topMsgs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 items-center">
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={topMsgs} dataKey="produced" nameKey="messageName" cx="50%" cy="50%" innerRadius={35} outerRadius={70} paddingAngle={2}>
                        {topMsgs.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1">
                  {topMsgs.map((m, i) => (
                    <div key={m.messageName} className="flex items-center gap-1.5 text-[11px]">
                      <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-foreground truncate flex-1">{m.messageName}</span>
                      <span className="font-bold tabular-nums">{m.produced.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hourly heatmap */}
        {showViz('hourlyHeatmap') && (
          <div className="rounded-2xl border bg-card p-4 md:p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Hourly Production Heatmap</h3>
              <span className="text-xs text-muted-foreground ml-auto">Day-of-week × Hour</span>
            </div>
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                <div className="grid gap-0.5" style={{ gridTemplateColumns: '40px repeat(24, minmax(20px, 1fr))' }}>
                  <div />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="text-[9px] text-muted-foreground text-center font-mono">{h}</div>
                  ))}
                  {heatmap.map((row, dow) => (
                    <>
                      <div key={`l-${dow}`} className="text-[10px] text-muted-foreground font-bold text-right pr-1">{dows[dow]}</div>
                      {row.map((val, h) => {
                        const intensity = val / heatmapMax;
                        return (
                          <div
                            key={`c-${dow}-${h}`}
                            className="aspect-square rounded-sm"
                            title={`${dows[dow]} ${h}:00 — ${val.toLocaleString()} units`}
                            style={{
                              backgroundColor: val > 0
                                ? `hsl(var(--primary) / ${0.15 + intensity * 0.85})`
                                : 'hsl(var(--muted))',
                            }}
                          />
                        );
                      })}
                    </>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Per-printer table */}
      {template.groupBy.includes('printer') && (
        <div className="rounded-2xl border bg-card p-4 md:p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">Per-Printer Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2">Printer</th>
                  {showMetric('produced') && <th className="py-2 text-right">Produced</th>}
                  {showMetric('target') && <th className="py-2 text-right">Target</th>}
                  {showMetric('attainment') && <th className="py-2 text-right">Attainment</th>}
                  {showMetric('runTime') && <th className="py-2 text-right">Run Time</th>}
                  {showMetric('downtime') && <th className="py-2 text-right">Downtime</th>}
                  {showMetric('oee') && <th className="py-2 text-right">OEE</th>}
                  {showMetric('runCount') && <th className="py-2 text-right">Runs</th>}
                </tr>
              </thead>
              <tbody>
                {Array.from(byPrinter.entries()).map(([id, rs]) => {
                  const p = printers.find(x => x.id === id);
                  const a = aggregate(rs);
                  return (
                    <tr key={id} className="border-b border-border/40 hover:bg-secondary/30">
                      <td className="py-2 font-semibold text-foreground">{p?.name ?? `Printer ${id}`}</td>
                      {showMetric('produced') && <td className="py-2 text-right font-bold tabular-nums">{a.produced.toLocaleString()}</td>}
                      {showMetric('target') && <td className="py-2 text-right tabular-nums">{a.target.toLocaleString()}</td>}
                      {showMetric('attainment') && <td className="py-2 text-right tabular-nums">{a.attainment.toFixed(1)}%</td>}
                      {showMetric('runTime') && <td className="py-2 text-right tabular-nums">{formatDuration(a.runTime)}</td>}
                      {showMetric('downtime') && <td className="py-2 text-right tabular-nums text-destructive">{formatDuration(a.downtime)}</td>}
                      {showMetric('oee') && <td className="py-2 text-right tabular-nums">{a.oee.toFixed(1)}%</td>}
                      {showMetric('runCount') && <td className="py-2 text-right tabular-nums">{a.runCount}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Downtime by reason metric (table) */}
      {showMetric('downtimeByReason') && downtimePareto.length > 0 && !showViz('downtimePareto') && (
        <div className="rounded-2xl border bg-card p-4 md:p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">Downtime by Reason</h3>
          <div className="space-y-1.5">
            {downtimePareto.map(d => (
              <div key={d.reason} className="flex items-center gap-3 text-sm">
                <span className="font-medium text-foreground flex-1">{DOWNTIME_LABELS[d.reason] ?? d.reason}</span>
                <span className="text-xs text-muted-foreground">{d.count} events</span>
                <span className="font-bold text-destructive tabular-nums w-20 text-right">{formatDuration(d.totalMs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
CustomReportRenderer.displayName = 'CustomReportRenderer';
