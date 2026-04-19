import { forwardRef, useMemo } from 'react';
import {
  Package, Timer, Gauge, TrendingUp, Factory, BarChart3, ArrowDownCircle,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import type { ProductionRun } from '@/types/production';
import type { Printer } from '@/types/printer';
import type { ReportTimeScope } from '@/types/reportTemplates';
import {
  resolveScope, filterRuns, aggregate, bucketRuns, groupByPrinter, topMessages,
  formatDuration,
} from '@/lib/reportAggregation';

interface Props {
  runs: ProductionRun[];
  printers: Printer[];
  scope: ReportTimeScope;
}

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', '#06b6d4', '#a855f7', '#ec4899'];

function MetricCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  accent: 'primary' | 'success' | 'warning' | 'destructive';
}) {
  const colorMap = {
    primary: 'from-primary/10 to-transparent border-primary/20 text-primary',
    success: 'from-success/10 to-transparent border-success/20 text-success',
    warning: 'from-warning/10 to-transparent border-warning/20 text-warning',
    destructive: 'from-destructive/10 to-transparent border-destructive/20 text-destructive',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 md:p-5 ${colorMap[accent]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 opacity-80" />
        <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{label}</span>
      </div>
      <div className="text-3xl md:text-4xl font-black text-foreground tabular-nums tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1 font-medium">{sub}</div>}
    </div>
  );
}

export const ProductionSummaryReport = forwardRef<HTMLDivElement, Props>(({ runs, printers, scope }, ref) => {
  const range = useMemo(() => resolveScope(scope), [scope]);
  const filtered = useMemo(() => filterRuns(runs, range, scope.printerIds), [runs, range, scope.printerIds]);
  const summary = useMemo(() => aggregate(filtered), [filtered]);
  const buckets = useMemo(() => bucketRuns(filtered, scope.bucket), [filtered, scope.bucket]);
  const byPrinter = useMemo(() => groupByPrinter(filtered), [filtered]);
  const topMsgs = useMemo(() => topMessages(filtered, 6), [filtered]);

  if (filtered.length === 0) {
    return (
      <div ref={ref} className="rounded-2xl border bg-card p-12 text-center">
        <Factory className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-base font-semibold text-foreground mb-1">No production runs in this period</p>
        <p className="text-sm text-muted-foreground">Try a different date range or printer filter.</p>
      </div>
    );
  }

  const printerRows = Array.from(byPrinter.entries()).map(([id, rs]) => {
    const p = printers.find(x => x.id === id);
    const agg = aggregate(rs);
    return { id, name: p?.name ?? `Printer ${id}`, ...agg };
  }).sort((a, b) => b.produced - a.produced);

  return (
    <div ref={ref} className="space-y-4 bg-background p-1">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Total Produced" icon={Package} accent="primary"
          value={summary.produced.toLocaleString()}
          sub={`${summary.runCount} ${summary.runCount === 1 ? 'run' : 'runs'}`}
        />
        <MetricCard
          label="Total Run Time" icon={Timer} accent="warning"
          value={formatDuration(summary.runTime)}
          sub={`Avg ${formatDuration(summary.avgRunDuration)} per run`}
        />
        <MetricCard
          label="Units / Hour" icon={TrendingUp} accent="success"
          value={summary.unitsPerHour.toFixed(0)}
          sub="Production rate"
        />
        <MetricCard
          label="Downtime" icon={ArrowDownCircle} accent="destructive"
          value={formatDuration(summary.downtime)}
          sub={summary.runTime > 0 ? `${((summary.downtime / (summary.runTime + summary.downtime)) * 100).toFixed(1)}% of total time` : undefined}
        />
      </div>

      {/* Production trend */}
      <div className="rounded-2xl border bg-card p-4 md:p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm md:text-base font-bold text-foreground">Production Trend</h3>
          <span className="text-xs text-muted-foreground ml-auto">Per {scope.bucket}</span>
        </div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={buckets}>
              <defs>
                <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }}
              />
              <Area
                type="monotone" dataKey="produced"
                stroke="hsl(var(--primary))" strokeWidth={2.5}
                fill="url(#prodGrad)" name="Produced"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Per-printer table */}
        <div className="rounded-2xl border bg-card p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Gauge className="w-4 h-4 text-primary" />
            </div>
            <h3 className="text-sm md:text-base font-bold text-foreground">Per-Line Production</h3>
          </div>
          <div className="space-y-2">
            {printerRows.map(p => {
              const pct = summary.produced > 0 ? (p.produced / summary.produced) * 100 : 0;
              return (
                <div key={p.id} className="rounded-lg bg-secondary/40 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-foreground truncate">{p.name}</span>
                    <span className="text-sm font-black text-foreground tabular-nums">{p.produced.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                    <span>{p.runCount} runs · {formatDuration(p.runTime)}</span>
                    <span>{p.unitsPerHour.toFixed(0)} u/h</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top messages */}
        <div className="rounded-2xl border bg-card p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Package className="w-4 h-4 text-primary" />
            </div>
            <h3 className="text-sm md:text-base font-bold text-foreground">Top Products</h3>
          </div>
          {topMsgs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No products to show</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topMsgs} dataKey="produced" nameKey="messageName"
                      cx="50%" cy="50%" innerRadius={40} outerRadius={70}
                      paddingAngle={2}
                    >
                      {topMsgs.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5">
                {topMsgs.map((m, i) => (
                  <div key={m.messageName} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-foreground font-medium truncate flex-1">{m.messageName}</span>
                    <span className="font-bold text-foreground tabular-nums">{m.produced.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
ProductionSummaryReport.displayName = 'ProductionSummaryReport';
