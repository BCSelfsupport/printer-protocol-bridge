/**
 * Reusable chart components used across all report variants.
 * All charts use semantic theme tokens for consistency with the rest of the app.
 */

import { useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { TrendingUp, BarChart3, AlertTriangle, PieChart as PieIcon, Activity, Grid3x3 } from 'lucide-react';
import type { ProductionRun } from '@/types/production';
import { calculateOEE } from '@/types/production';
import {
  type AggregateMetrics, type HourlyCell,
  groupByBucket, bucketLabel, aggregate, downtimeLabel,
} from '@/lib/reportAggregation';
import type { GroupByBucket } from '@/types/reportTemplates';

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '10px',
  fontSize: '12px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
  padding: '8px 12px',
};

/* ---------- shared shell ---------- */

function ChartShell({
  title,
  icon: Icon,
  iconColor = 'text-primary',
  iconBg = 'bg-primary/10',
  children,
  height = 240,
  subtitle,
}: {
  title: string;
  icon: React.ElementType;
  iconColor?: string;
  iconBg?: string;
  subtitle?: string;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4 md:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm md:text-base font-bold text-foreground">{title}</h3>
          {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

/* ---------- Production Trend (units produced over time) ---------- */

export function ProductionTrendChart({
  runs,
  bucket,
}: {
  runs: ProductionRun[];
  bucket: GroupByBucket;
}) {
  const data = useMemo(() => {
    const groups = groupByBucket(runs, bucket);
    return Array.from(groups.entries()).map(([k, rs]) => ({
      name: bucketLabel(k, bucket),
      produced: rs.reduce((s, r) => s + r.actualCount, 0),
      target: rs.reduce((s, r) => s + r.targetCount, 0),
    }));
  }, [runs, bucket]);

  return (
    <ChartShell title="Production Trend" subtitle={`Per ${bucket}`} icon={TrendingUp}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Area type="monotone" dataKey="produced" stroke="hsl(var(--primary))" fill="url(#prodGrad)" strokeWidth={2.5} name="Produced" />
          <Area type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" fill="none" strokeWidth={1.5} strokeDasharray="5 3" name="Target" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

/* ---------- OEE Trend (line chart of 3 OEE pillars) ---------- */

export function OEETrendChart({
  runs,
  bucket,
}: {
  runs: ProductionRun[];
  bucket: GroupByBucket;
}) {
  const data = useMemo(() => {
    const groups = groupByBucket(runs, bucket);
    return Array.from(groups.entries()).map(([k, rs]) => {
      const m = aggregate(rs);
      return {
        name: bucketLabel(k, bucket),
        oee: Number(m.oee.toFixed(1)),
        availability: Number(m.availability.toFixed(1)),
        performance: Number(m.performance.toFixed(1)),
      };
    });
  }, [runs, bucket]);

  return (
    <ChartShell title="OEE Trend" subtitle={`Availability · Performance · OEE per ${bucket}`} icon={Activity}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="oee" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4 }} name="OEE" />
          <Line type="monotone" dataKey="availability" stroke="hsl(var(--success))" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} name="Availability" />
          <Line type="monotone" dataKey="performance" stroke="hsl(var(--warning))" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} name="Performance" />
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

/* ---------- Downtime Pareto ---------- */

const DOWNTIME_COLORS = [
  'hsl(var(--destructive))',
  'hsl(0 65% 55%)',
  'hsl(15 80% 55%)',
  'hsl(var(--warning))',
  'hsl(45 90% 55%)',
  'hsl(var(--muted-foreground))',
];

export function DowntimeParetoChart({ metrics }: { metrics: AggregateMetrics }) {
  const data = useMemo(() => {
    return metrics.downtimeByReason.slice(0, 8).map((d, i) => ({
      name: downtimeLabel(d.reason),
      minutes: Math.round(d.ms / 60000),
      color: DOWNTIME_COLORS[i % DOWNTIME_COLORS.length],
    }));
  }, [metrics]);

  if (data.length === 0) {
    return (
      <ChartShell title="Downtime Breakdown" icon={AlertTriangle} iconColor="text-destructive" iconBg="bg-destructive/10" height={240}>
        <div className="h-full flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center mb-2">
            <AlertTriangle className="w-6 h-6 text-success" />
          </div>
          <p className="text-sm font-bold text-foreground">No downtime recorded</p>
          <p className="text-xs text-muted-foreground">Production ran clean in this period.</p>
        </div>
      </ChartShell>
    );
  }

  return (
    <ChartShell title="Downtime by Reason" subtitle="Sorted by impact (Pareto)" icon={AlertTriangle} iconColor="text-destructive" iconBg="bg-destructive/10">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} unit=" min" />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} width={110} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => `${v} min`} />
          <Bar dataKey="minutes" radius={[0, 6, 6, 0]} barSize={22}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

/* ---------- Message Breakdown (pie) ---------- */

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(280 65% 55%)',
  'hsl(190 70% 50%)',
  'hsl(330 70% 55%)',
  'hsl(140 60% 45%)',
  'hsl(25 85% 55%)',
];

export function MessageBreakdownChart({ metrics }: { metrics: AggregateMetrics }) {
  const data = useMemo(() => {
    return metrics.topMessages.slice(0, 8).map((m, i) => ({
      name: m.name,
      value: m.produced,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [metrics]);

  if (data.length === 0) {
    return (
      <ChartShell title="Message Breakdown" icon={PieIcon} iconColor="text-accent-foreground" iconBg="bg-accent/15">
        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No data</div>
      </ChartShell>
    );
  }

  return (
    <ChartShell title="Top Messages" subtitle="Production share by message" icon={PieIcon} iconColor="text-primary" iconBg="bg-primary/10">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            innerRadius="50%"
            outerRadius="85%"
            paddingAngle={2}
            dataKey="value"
            stroke="hsl(var(--card))"
            strokeWidth={2}
          >
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [`${v.toLocaleString()} units`, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 10 }}
            iconType="circle"
            layout="vertical"
            verticalAlign="middle"
            align="right"
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

/* ---------- Hourly Heatmap ---------- */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function HourlyHeatmap({ cells }: { cells: HourlyCell[] }) {
  const max = useMemo(() => cells.reduce((m, c) => Math.max(m, c.produced), 0), [cells]);
  const cellMap = useMemo(() => {
    const m = new Map<string, number>();
    cells.forEach(c => m.set(`${c.weekday}-${c.hour}`, c.produced));
    return m;
  }, [cells]);

  return (
    <ChartShell title="Hourly Production" subtitle="Heatmap by weekday × hour" icon={Grid3x3} iconColor="text-primary" iconBg="bg-primary/10" height={260}>
      <div className="h-full flex flex-col">
        <div className="flex-1 grid gap-px" style={{ gridTemplateColumns: `40px repeat(24, 1fr)`, gridTemplateRows: `auto repeat(7, 1fr)` }}>
          {/* corner */}
          <div />
          {/* hour headers */}
          {Array.from({ length: 24 }, (_, h) => (
            <div key={`h-${h}`} className="text-[8px] text-muted-foreground text-center font-mono">
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
          {/* rows */}
          {WEEKDAYS.map((wd, wdi) => (
            <>
              <div key={`wd-${wdi}`} className="text-[10px] text-muted-foreground font-bold flex items-center pr-1.5 justify-end">
                {wd}
              </div>
              {Array.from({ length: 24 }, (_, h) => {
                const v = cellMap.get(`${wdi}-${h}`) ?? 0;
                const intensity = max > 0 ? v / max : 0;
                return (
                  <div
                    key={`c-${wdi}-${h}`}
                    title={v > 0 ? `${WEEKDAYS[wdi]} ${h}:00 — ${v.toLocaleString()} units` : ''}
                    className="rounded-sm transition-colors"
                    style={{
                      backgroundColor: intensity > 0
                        ? `hsl(var(--primary) / ${0.12 + intensity * 0.78})`
                        : 'hsl(var(--muted) / 0.4)',
                    }}
                  />
                );
              })}
            </>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 justify-end text-[10px] text-muted-foreground">
          <span>Less</span>
          {[0.15, 0.35, 0.55, 0.75, 0.95].map(o => (
            <div key={o} className="w-4 h-3 rounded-sm" style={{ backgroundColor: `hsl(var(--primary) / ${o})` }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </ChartShell>
  );
}

/* ---------- Per-printer comparison bar ---------- */

export function PerPrinterBarChart({
  data,
}: {
  data: { name: string; produced: number; target: number; oee: number }[];
}) {
  return (
    <ChartShell title="Production by Printer" icon={BarChart3}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="target" fill="hsl(var(--muted))" radius={[6, 6, 0, 0]} barSize={28} name="Target" />
          <Bar dataKey="produced" radius={[6, 6, 0, 0]} barSize={28} name="Produced">
            {data.map((d, i) => (
              <Cell key={i} fill={d.target > 0 && d.produced >= d.target ? 'hsl(var(--success))' : 'hsl(var(--primary))'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

/* re-export shell for use elsewhere */
export { ChartShell };
