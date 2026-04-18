/**
 * Custom Report Builder — user picks metrics, grouping, and visualizations.
 * Fully composable, results render live below the picker.
 */

import { useMemo, useRef, useState } from 'react';
import {
  Sliders, Package, Target, Activity, Timer, Gauge, AlertTriangle,
  TrendingUp, BarChart3, ChevronDown, ChevronUp, CheckSquare, Square,
  Eye, EyeOff,
} from 'lucide-react';
import type { ProductionRun } from '@/types/production';
import type { Printer } from '@/types/printer';
import type {
  DateScope, CustomReportConfig, CustomMetric, CustomVisualization, CustomGrouping,
} from '@/types/reportTemplates';
import {
  METRIC_LABELS, VISUALIZATION_LABELS, GROUPING_LABELS,
} from '@/types/reportTemplates';
import { KpiCard } from './KpiCard';
import { ReportDownloadMenu } from './ReportDownloadMenu';
import {
  ProductionTrendChart, OEETrendChart, DowntimeParetoChart,
  MessageBreakdownChart, HourlyHeatmap, PerPrinterBarChart,
} from './ReportCharts';
import {
  filterRuns, aggregate, hourlyHeatmap, groupByPrinter,
  formatDuration, formatNumber, describeDateScope,
} from '@/lib/reportAggregation';
import { cn } from '@/lib/utils';

const METRIC_ICONS: Record<CustomMetric, React.ElementType> = {
  totalProduced: Package,
  totalTarget: Target,
  attainmentPct: Gauge,
  runTime: Timer,
  downtime: AlertTriangle,
  downtimeByReason: AlertTriangle,
  unitsPerHour: Activity,
  oee: Gauge,
  availability: Gauge,
  performance: Gauge,
  runCount: Package,
  avgRunDuration: Timer,
  topMessages: BarChart3,
};

const METRIC_ACCENTS: Partial<Record<CustomMetric, 'primary' | 'success' | 'warning' | 'destructive' | 'accent'>> = {
  totalProduced: 'primary',
  totalTarget: 'accent',
  attainmentPct: 'success',
  runTime: 'success',
  downtime: 'destructive',
  unitsPerHour: 'warning',
  oee: 'primary',
  availability: 'success',
  performance: 'warning',
  runCount: 'accent',
  avgRunDuration: 'accent',
};

const ALL_METRICS: CustomMetric[] = [
  'totalProduced', 'totalTarget', 'attainmentPct',
  'runTime', 'downtime', 'unitsPerHour',
  'oee', 'availability', 'performance',
  'runCount', 'avgRunDuration',
];

const ALL_VIZ: CustomVisualization[] = [
  'kpiCards', 'productionTrend', 'downtimePareto', 'oeeTrend',
  'shiftComparison', 'messageBreakdown', 'hourlyHeatmap',
];

const ALL_GROUPINGS: CustomGrouping[] = [
  'printer', 'shift', 'day', 'week', 'message', 'combined',
];

export function CustomReportBuilder({
  runs, scope, printers, config, onChange,
}: {
  runs: ProductionRun[];
  scope: DateScope;
  printers: Printer[];
  config: CustomReportConfig;
  onChange: (next: CustomReportConfig) => void;
}) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [pickerCollapsed, setPickerCollapsed] = useState(false);

  const filtered = useMemo(() => filterRuns(runs, scope), [runs, scope]);

  // Apply additional filters (message, downtime reason)
  const refined = useMemo(() => {
    let r = filtered;
    if (config.messageFilter.length > 0) {
      r = r.filter(run => config.messageFilter.includes(run.messageName));
    }
    if (config.downtimeReasonFilter.length > 0) {
      r = r.filter(run => run.downtimeEvents.some(e => config.downtimeReasonFilter.includes(e.reason)));
    }
    return r;
  }, [filtered, config.messageFilter, config.downtimeReasonFilter]);

  const metrics = useMemo(() => aggregate(refined), [refined]);
  const heatmap = useMemo(() => hourlyHeatmap(refined), [refined]);

  const perPrinterChart = useMemo(() => {
    const groups = groupByPrinter(refined);
    return Array.from(groups.entries()).map(([id, prs]) => {
      const m = aggregate(prs);
      return {
        name: printers.find(p => p.id === id)?.name ?? `Printer ${id}`,
        produced: m.totalProduced,
        target: m.totalTarget,
        oee: m.oee,
      };
    });
  }, [refined, printers]);

  const toggleMetric = (m: CustomMetric) => {
    const next = config.metrics.includes(m)
      ? config.metrics.filter(x => x !== m)
      : [...config.metrics, m];
    onChange({ ...config, metrics: next });
  };

  const toggleViz = (v: CustomVisualization) => {
    const next = config.visualizations.includes(v)
      ? config.visualizations.filter(x => x !== v)
      : [...config.visualizations, v];
    onChange({ ...config, visualizations: next });
  };

  const setGrouping = (g: CustomGrouping) => onChange({ ...config, grouping: g });

  return (
    <div className="space-y-4">
      {/* Builder panel */}
      <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card shadow-sm overflow-hidden">
        <button
          onClick={() => setPickerCollapsed(v => !v)}
          className="w-full px-4 py-3 flex items-center gap-2 hover:bg-primary/5 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <Sliders className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-bold text-foreground">Report Builder</div>
            <div className="text-[10px] text-muted-foreground">
              {config.metrics.length} metrics · {config.visualizations.length} charts · grouped by {GROUPING_LABELS[config.grouping]}
            </div>
          </div>
          {pickerCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>

        {!pickerCollapsed && (
          <div className="border-t border-border/40 p-4 space-y-5">
            {/* Metrics */}
            <Section title="Metrics" icon={Gauge} hint="Pick KPIs to display in the summary cards">
              <div className="flex flex-wrap gap-1.5">
                {ALL_METRICS.map(m => {
                  const Icon = METRIC_ICONS[m];
                  const active = config.metrics.includes(m);
                  return (
                    <Chip
                      key={m}
                      active={active}
                      onClick={() => toggleMetric(m)}
                      icon={Icon}
                      label={METRIC_LABELS[m]}
                    />
                  );
                })}
              </div>
            </Section>

            {/* Visualizations */}
            <Section title="Visualizations" icon={BarChart3} hint="Pick charts and graphical breakdowns">
              <div className="flex flex-wrap gap-1.5">
                {ALL_VIZ.map(v => {
                  const active = config.visualizations.includes(v);
                  return (
                    <Chip
                      key={v}
                      active={active}
                      onClick={() => toggleViz(v)}
                      icon={active ? Eye : EyeOff}
                      label={VISUALIZATION_LABELS[v]}
                    />
                  );
                })}
              </div>
            </Section>

            {/* Grouping */}
            <Section title="Grouping" icon={TrendingUp} hint="How to roll up the data">
              <div className="flex flex-wrap gap-1.5">
                {ALL_GROUPINGS.map(g => (
                  <button
                    key={g}
                    onClick={() => setGrouping(g)}
                    className={cn(
                      'text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all',
                      config.grouping === g
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background border-border/50 text-foreground hover:border-primary/40',
                    )}
                  >
                    {GROUPING_LABELS[g]}
                  </button>
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>

      {/* Header strip with download */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-black text-foreground tracking-tight">Custom Report</h2>
          <p className="text-xs text-muted-foreground">{describeDateScope(scope)} · {refined.length} run{refined.length === 1 ? '' : 's'}</p>
        </div>
        <ReportDownloadMenu
          title="Custom Report"
          subtitle={describeDateScope(scope)}
          getElement={() => reportRef.current}
          runs={refined}
          disabled={refined.length === 0}
        />
      </div>

      {/* Rendered report */}
      <div ref={reportRef} className="space-y-4">
        {refined.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-12 text-center">
            <Sliders className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">No runs match this configuration.</p>
            <p className="text-xs text-muted-foreground mt-1">Adjust the date range, printer filter, or message filter.</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            {config.visualizations.includes('kpiCards') && config.metrics.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {config.metrics.map(m => {
                  const Icon = METRIC_ICONS[m] as unknown as import('lucide-react').LucideIcon;
                  return (
                    <KpiCard
                      key={m}
                      icon={Icon}
                      label={METRIC_LABELS[m]}
                      value={formatMetricValue(m, metrics)}
                      unit={metricUnit(m)}
                      accent={METRIC_ACCENTS[m] ?? 'primary'}
                    />
                  );
                })}
              </div>
            )}

            {/* Charts grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {config.visualizations.includes('productionTrend') && (
                <ProductionTrendChart runs={refined} bucket={scope.bucket} />
              )}
              {config.visualizations.includes('oeeTrend') && (
                <OEETrendChart runs={refined} bucket={scope.bucket} />
              )}
              {config.visualizations.includes('downtimePareto') && (
                <DowntimeParetoChart metrics={metrics} />
              )}
              {config.visualizations.includes('messageBreakdown') && (
                <MessageBreakdownChart metrics={metrics} />
              )}
              {config.visualizations.includes('shiftComparison') && perPrinterChart.length > 0 && (
                <PerPrinterBarChart data={perPrinterChart} />
              )}
            </div>

            {config.visualizations.includes('hourlyHeatmap') && (
              <HourlyHeatmap cells={heatmap} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function formatMetricValue(m: CustomMetric, agg: ReturnType<typeof aggregate>): string {
  switch (m) {
    case 'totalProduced': return formatNumber(agg.totalProduced);
    case 'totalTarget': return formatNumber(agg.totalTarget);
    case 'attainmentPct': return agg.attainmentPct.toFixed(1);
    case 'runTime': return formatDuration(agg.runTime);
    case 'downtime': return formatDuration(agg.downtime);
    case 'unitsPerHour': return agg.unitsPerHour.toFixed(0);
    case 'oee': return agg.oee.toFixed(1);
    case 'availability': return agg.availability.toFixed(1);
    case 'performance': return agg.performance.toFixed(1);
    case 'runCount': return formatNumber(agg.runCount);
    case 'avgRunDuration': return formatDuration(agg.avgRunDuration);
    default: return '—';
  }
}

function metricUnit(m: CustomMetric): string | undefined {
  switch (m) {
    case 'totalProduced':
    case 'totalTarget': return 'units';
    case 'attainmentPct':
    case 'oee':
    case 'availability':
    case 'performance': return '%';
    case 'unitsPerHour': return 'u/hr';
    default: return undefined;
  }
}

/* ---------- small UI primitives ---------- */

function Section({
  title, icon: Icon, hint, children,
}: {
  title: string; icon: React.ElementType; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-primary" />
        <h4 className="text-xs font-bold text-foreground uppercase tracking-wide">{title}</h4>
        {hint && <span className="text-[10px] text-muted-foreground">— {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({
  active, onClick, icon: Icon, label,
}: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all',
        active
          ? 'bg-primary/15 border-primary/50 text-primary shadow-sm'
          : 'bg-background border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground',
      )}
    >
      {active
        ? <CheckSquare className="w-3 h-3" />
        : <Square className="w-3 h-3" />}
      <Icon className="w-3 h-3" />
      <span>{label}</span>
    </button>
  );
}
