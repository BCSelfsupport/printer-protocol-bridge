import { useState, useMemo, useEffect } from 'react';
import {
  BarChart3, TrendingUp, Clock, AlertTriangle, Plus, Trash2,
  Download, Target, Activity, Gauge, ArrowDownCircle, CheckCircle2,
  Timer, Factory, Zap, ChevronDown, ChevronUp
} from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import type { ProductionRun, ProductionSnapshot, OEEMetrics } from '@/types/production';
import { calculateOEE } from '@/types/production';
import type { Printer } from '@/types/printer';

interface ReportsScreenProps {
  runs: ProductionRun[];
  snapshots: ProductionSnapshot[];
  printers: Printer[];
  onAddRun: (run: Omit<ProductionRun, 'id'>) => Promise<ProductionRun>;
  onUpdateRun: (id: string, updates: Partial<ProductionRun>) => void;
  onDeleteRun: (id: string) => void;
  onAddDowntime: (runId: string, reason: string) => void;
  onEndDowntime: (runId: string, eventId: string) => void;
  onHome: () => void;
}

// Animated OEE Gauge with thick gradient ring and glow
function OEEGauge({ value, label, size = 120, isPrimary = false }: { value: number; label: string; size?: number; isPrimary?: boolean }) {
  const [animatedValue, setAnimatedValue] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(value), 100);
    return () => clearTimeout(timer);
  }, [value]);

  const strokeWidth = isPrimary ? size * 0.12 : size * 0.1;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, animatedValue) / 100) * circumference;
  const center = size / 2;

  const color = getOEEColor(value);
  const glowColor = value >= 85 ? '142 71% 45%' : value >= 60 ? '38 92% 50%' : '0 72% 51%';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Glow effect behind the gauge */}
        {isPrimary && (
          <div
            className="absolute inset-0 rounded-full blur-xl opacity-20"
            style={{ backgroundColor: color }}
          />
        )}
        <svg width={size} height={size} className="transform -rotate-90 relative z-10">
          <defs>
            <linearGradient id={`gauge-grad-${label}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={1} />
            </linearGradient>
            <filter id={`gauge-glow-${label}`}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Background track */}
          <circle
            cx={center} cy={center} r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
            opacity={0.5}
          />
          {/* Colored arc */}
          <circle
            cx={center} cy={center} r={radius}
            fill="none"
            stroke={`url(#gauge-grad-${label})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            filter={`url(#gauge-glow-${label})`}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <span className={`font-bold tabular-nums ${isPrimary ? 'text-2xl md:text-3xl' : 'text-lg md:text-xl'}`}
            style={{ color }}
          >
            {animatedValue.toFixed(1)}%
          </span>
        </div>
      </div>
      <span className={`font-semibold text-muted-foreground ${isPrimary ? 'text-sm md:text-base' : 'text-xs md:text-sm'}`}>{label}</span>
    </div>
  );
}

function getOEEColor(value: number): string {
  if (value >= 85) return 'hsl(var(--success))';
  if (value >= 60) return 'hsl(var(--warning))';
  return 'hsl(var(--destructive))';
}

function getOEELabel(value: number): string {
  if (value >= 85) return 'World Class';
  if (value >= 60) return 'Acceptable';
  if (value >= 40) return 'Low';
  return 'Critical';
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

const DOWNTIME_LABELS: Record<string, string> = {
  jet_stopped: 'Jet Stopped',
  hv_disabled: 'HV Disabled',
  printer_error: 'Printer Error',
  ink_empty: 'Ink Empty',
  makeup_empty: 'Makeup Empty',
  manual_stop: 'Manual Stop',
  changeover: 'Changeover',
  maintenance: 'Maintenance',
  other: 'Other',
};

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Stat card with icon and gradient accent
function StatCard({ icon: Icon, label, value, accent }: {
  icon: React.ElementType; label: string; value: string; accent: 'primary' | 'success' | 'destructive' | 'warning';
}) {
  const accentClasses = {
    primary: 'from-primary/15 to-transparent border-primary/20 text-primary',
    success: 'from-success/15 to-transparent border-success/20 text-success',
    destructive: 'from-destructive/15 to-transparent border-destructive/20 text-destructive',
    warning: 'from-warning/15 to-transparent border-warning/20 text-warning',
  };
  const iconClasses = {
    primary: 'text-primary',
    success: 'text-success',
    destructive: 'text-destructive',
    warning: 'text-warning',
  };

  return (
    <div className={`rounded-xl border bg-gradient-to-br ${accentClasses[accent]} p-3 md:p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 md:w-5 md:h-5 ${iconClasses[accent]}`} />
        <span className="text-xs md:text-sm text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="text-lg md:text-2xl font-bold text-foreground tabular-nums pl-6 md:pl-7">{value}</div>
    </div>
  );
}

export function ReportsScreen({
  runs, snapshots, printers,
  onAddRun, onUpdateRun, onDeleteRun,
  onAddDowntime, onEndDowntime,
  onHome,
}: ReportsScreenProps) {
  const [newRunDialogOpen, setNewRunDialogOpen] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [downtimeDialogOpen, setDowntimeDialogOpen] = useState(false);
  const [downtimeReason, setDowntimeReason] = useState('');
  const [downtimeRunId, setDowntimeRunId] = useState<string | null>(null);
  const [newPrinterId, setNewPrinterId] = useState<string>('');
  const [newMessageName, setNewMessageName] = useState('');
  const [newTargetCount, setNewTargetCount] = useState('');

  const runMetrics = useMemo(() => {
    return runs.map(run => ({ run, oee: calculateOEE(run) }));
  }, [runs]);

  const overallOEE = useMemo((): OEEMetrics | null => {
    if (runMetrics.length === 0) return null;
    const completedRuns = runMetrics.filter(rm => rm.run.endTime !== null);
    const source = completedRuns.length > 0 ? completedRuns : runMetrics;
    const avg = (field: keyof OEEMetrics) => {
      const sum = source.reduce((s, rm) => s + (rm.oee[field] as number), 0);
      return sum / source.length;
    };
    return {
      availability: avg('availability'),
      performance: avg('performance'),
      oee: avg('oee'),
      plannedTime: source.reduce((s, rm) => s + rm.oee.plannedTime, 0),
      runTime: source.reduce((s, rm) => s + rm.oee.runTime, 0),
      totalDowntime: source.reduce((s, rm) => s + rm.oee.totalDowntime, 0),
      targetCount: source.reduce((s, rm) => s + rm.oee.targetCount, 0),
      actualCount: source.reduce((s, rm) => s + rm.oee.actualCount, 0),
    };
  }, [runMetrics]);

  const oeeChartData = useMemo(() => {
    return [...runMetrics].reverse().map(rm => ({
      name: rm.run.messageName.substring(0, 12),
      oee: Number(rm.oee.oee.toFixed(1)),
      availability: Number(rm.oee.availability.toFixed(1)),
      performance: Number(rm.oee.performance.toFixed(1)),
    }));
  }, [runMetrics]);

  const productionChartData = useMemo(() => {
    return [...runMetrics].reverse().map(rm => ({
      name: rm.run.messageName.substring(0, 12),
      target: rm.run.targetCount,
      actual: rm.run.actualCount,
    }));
  }, [runMetrics]);

  const activeRuns = runs.filter(r => r.endTime === null);

  const handleCreateRun = async () => {
    const printer = printers.find(p => p.id === Number(newPrinterId));
    if (!printer || !newMessageName.trim() || !newTargetCount) return;
    await onAddRun({
      printerId: printer.id,
      printerName: printer.name,
      messageName: newMessageName.trim(),
      startTime: Date.now(),
      endTime: null,
      targetCount: Number(newTargetCount),
      actualCount: 0,
      downtimeEvents: [],
    });
    setNewRunDialogOpen(false);
    setNewPrinterId('');
    setNewMessageName('');
    setNewTargetCount('');
  };

  const handleEndRun = (runId: string, actualCount: string) => {
    onUpdateRun(runId, { endTime: Date.now(), actualCount: Number(actualCount) });
  };

  const handleExportCSV = () => {
    const headers = ['Run ID', 'Printer', 'Message', 'Start', 'End', 'Target', 'Actual', 'OEE %', 'Availability %', 'Performance %', 'Downtime (min)'];
    const rows = runMetrics.map(rm => [
      rm.run.id.substring(0, 8),
      rm.run.printerName,
      rm.run.messageName,
      new Date(rm.run.startTime).toISOString(),
      rm.run.endTime ? new Date(rm.run.endTime).toISOString() : 'Active',
      rm.run.targetCount,
      rm.run.actualCount,
      rm.oee.oee.toFixed(1),
      rm.oee.availability.toFixed(1),
      rm.oee.performance.toFixed(1),
      Math.round(rm.oee.totalDowntime / 60000),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oee-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="p-3 md:p-4 flex-shrink-0">
        <SubPageHeader
          title="Production Reports"
          onHome={onHome}
          rightContent={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={runs.length === 0}>
                <Download className="w-4 h-4 mr-1" /> Export
              </Button>
              <Button size="sm" onClick={() => setNewRunDialogOpen(true)} className="industrial-button text-white border-0">
                <Plus className="w-4 h-4 mr-1" /> New Run
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 md:px-4 pb-4 space-y-4">
        {/* ========== OEE OVERVIEW ========== */}
        {overallOEE ? (
          <div className="rounded-xl border bg-gradient-to-br from-card via-card to-secondary/50 p-5 md:p-6 shadow-lg relative overflow-hidden">
            {/* Decorative background pattern */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-2xl" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-success/5 rounded-full translate-y-1/2 -translate-x-1/4 blur-2xl" />

            <div className="flex items-center gap-2 mb-6 relative z-10">
              <div className="w-8 h-8 rounded-lg industrial-button flex items-center justify-center">
                <Gauge className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-lg md:text-xl font-bold text-foreground">OEE Overview</h2>
              <span className={`ml-auto px-4 py-1.5 rounded-full text-xs font-bold shadow-sm ${
                overallOEE.oee >= 85 ? 'bg-success text-success-foreground' :
                overallOEE.oee >= 60 ? 'bg-warning text-warning-foreground' :
                'bg-destructive text-destructive-foreground'
              }`}>
                {getOEELabel(overallOEE.oee)}
              </span>
            </div>

            {/* Gauges Row */}
            <div className="flex justify-around items-end flex-wrap gap-6 md:gap-8 relative z-10 mb-6">
              <OEEGauge value={overallOEE.oee} label="Overall OEE" size={140} isPrimary />
              <OEEGauge value={overallOEE.availability} label="Availability" size={110} />
              <OEEGauge value={overallOEE.performance} label="Performance" size={110} />
            </div>

            {/* Summary stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10">
              <StatCard icon={Target} label="Target" value={overallOEE.targetCount.toLocaleString()} accent="primary" />
              <StatCard icon={CheckCircle2} label="Actual" value={overallOEE.actualCount.toLocaleString()} accent="success" />
              <StatCard icon={Timer} label="Run Time" value={formatDuration(overallOEE.runTime)} accent="primary" />
              <StatCard icon={AlertTriangle} label="Downtime" value={formatDuration(overallOEE.totalDowntime)} accent="destructive" />
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="rounded-xl border bg-gradient-to-br from-card to-secondary/30 p-10 text-center shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-2xl" />
            <div className="w-16 h-16 rounded-2xl industrial-button flex items-center justify-center mx-auto mb-4">
              <Factory className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">No Production Runs Yet</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Start tracking your production efficiency. Create a run, set target counts, log downtime events, and monitor your OEE in real-time.
            </p>
            <Button onClick={() => setNewRunDialogOpen(true)} size="lg" className="industrial-button text-white border-0 px-8">
              <Plus className="w-5 h-5 mr-2" /> Create First Run
            </Button>
          </div>
        )}

        {/* ========== CHARTS ========== */}
        {runMetrics.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* OEE Trend */}
            <div className="rounded-xl border bg-card p-4 md:p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-sm md:text-base font-bold text-foreground">OEE Trend</h3>
              </div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={oeeChartData}>
                    <defs>
                      <linearGradient id="oeeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="availGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '10px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      }}
                    />
                    <Area type="monotone" dataKey="oee" stroke="hsl(var(--primary))" fill="url(#oeeGrad)" strokeWidth={2.5} name="OEE %" />
                    <Area type="monotone" dataKey="availability" stroke="hsl(var(--success))" fill="url(#availGrad)" strokeWidth={1.5} strokeDasharray="5 3" name="Availability %" />
                    <Area type="monotone" dataKey="performance" stroke="hsl(var(--warning))" fill="none" strokeWidth={1.5} strokeDasharray="5 3" name="Performance %" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Target vs Actual */}
            <div className="rounded-xl border bg-card p-4 md:p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-sm md:text-base font-bold text-foreground">Target vs Actual</h3>
              </div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productionChartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '10px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      }}
                    />
                    <Bar dataKey="target" fill="hsl(var(--muted))" radius={[6, 6, 0, 0]} name="Target" barSize={28} />
                    <Bar dataKey="actual" radius={[6, 6, 0, 0]} name="Actual" barSize={28}>
                      {productionChartData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.actual >= entry.target ? 'hsl(var(--success))' : 'hsl(var(--warning))'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ========== ACTIVE RUNS ========== */}
        {activeRuns.length > 0 && (
          <div className="rounded-xl border bg-card p-4 md:p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-success/15 flex items-center justify-center">
                <Zap className="w-4 h-4 text-success animate-pulse" />
              </div>
              <h3 className="text-sm md:text-base font-bold text-foreground">Active Runs</h3>
              <span className="text-xs bg-success text-success-foreground px-2.5 py-1 rounded-full font-bold shadow-sm">{activeRuns.length} running</span>
            </div>
            <div className="space-y-3">
              {activeRuns.map(run => {
                const oee = calculateOEE(run);
                const hasActiveDowntime = run.downtimeEvents.some(e => e.endTime === null);
                return (
                  <ActiveRunCard
                    key={run.id}
                    run={run}
                    oee={oee}
                    hasActiveDowntime={hasActiveDowntime}
                    onEnd={(actualCount) => handleEndRun(run.id, actualCount)}
                    onLogDowntime={() => {
                      setDowntimeRunId(run.id);
                      setDowntimeDialogOpen(true);
                    }}
                    onEndDowntime={(eventId) => onEndDowntime(run.id, eventId)}
                    onUpdateCount={(count) => onUpdateRun(run.id, { actualCount: Number(count) })}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* ========== RUN HISTORY ========== */}
        {runs.filter(r => r.endTime !== null).length > 0 && (
          <div className="rounded-xl border bg-card p-4 md:p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                <Clock className="w-4 h-4 text-muted-foreground" />
              </div>
              <h3 className="text-sm md:text-base font-bold text-foreground">Run History</h3>
              <span className="text-xs text-muted-foreground ml-1">{runs.filter(r => r.endTime !== null).length} completed</span>
            </div>
            <div className="space-y-2">
              {runs.filter(r => r.endTime !== null).map(run => {
                const oee = calculateOEE(run);
                const isExpanded = expandedRunId === run.id;
                const perfPct = run.targetCount > 0 ? Math.min(100, (run.actualCount / run.targetCount) * 100) : 0;
                return (
                  <div key={run.id} className="rounded-lg overflow-hidden border bg-secondary/50">
                    <button
                      onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                    >
                      {/* Mini OEE indicator */}
                      <div className="w-10 h-10 flex-shrink-0 relative">
                        <svg width={40} height={40} className="transform -rotate-90">
                          <circle cx={20} cy={20} r={16} fill="none" stroke="hsl(var(--muted))" strokeWidth={3} opacity={0.4} />
                          <circle
                            cx={20} cy={20} r={16}
                            fill="none"
                            stroke={getOEEColor(oee.oee)}
                            strokeWidth={3}
                            strokeDasharray={2 * Math.PI * 16}
                            strokeDashoffset={2 * Math.PI * 16 * (1 - Math.min(100, oee.oee) / 100)}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
                          {oee.oee.toFixed(0)}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">{run.messageName}</span>
                          <span className="text-xs text-muted-foreground hidden md:inline">• {run.printerName}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatDateTime(run.startTime)} → {run.endTime ? formatDateTime(run.endTime) : '...'}
                        </div>
                        {/* Mini progress bar */}
                        <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${perfPct}%`,
                              backgroundColor: perfPct >= 100 ? 'hsl(var(--success))' : perfPct >= 60 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))',
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right hidden md:block">
                          <div className="text-sm font-bold text-foreground tabular-nums">
                            {run.actualCount.toLocaleString()}<span className="text-muted-foreground font-normal">/{run.targetCount.toLocaleString()}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">produced</div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border pt-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div className="bg-background rounded-lg p-2.5">
                            <div className="text-[10px] text-muted-foreground mb-0.5">Availability</div>
                            <div className="text-base font-bold" style={{ color: getOEEColor(oee.availability) }}>{oee.availability.toFixed(1)}%</div>
                          </div>
                          <div className="bg-background rounded-lg p-2.5">
                            <div className="text-[10px] text-muted-foreground mb-0.5">Performance</div>
                            <div className="text-base font-bold" style={{ color: getOEEColor(oee.performance) }}>{oee.performance.toFixed(1)}%</div>
                          </div>
                          <div className="bg-background rounded-lg p-2.5">
                            <div className="text-[10px] text-muted-foreground mb-0.5">Run Time</div>
                            <div className="text-base font-bold text-foreground">{formatDuration(oee.runTime)}</div>
                          </div>
                          <div className="bg-background rounded-lg p-2.5">
                            <div className="text-[10px] text-muted-foreground mb-0.5">Downtime</div>
                            <div className="text-base font-bold text-destructive">{formatDuration(oee.totalDowntime)}</div>
                          </div>
                        </div>
                        {run.downtimeEvents.length > 0 && (
                          <div className="space-y-1.5 mb-3">
                            <div className="text-xs font-semibold text-muted-foreground">Downtime Events</div>
                            {run.downtimeEvents.map(evt => (
                              <div key={evt.id} className="flex items-center gap-2 text-xs bg-destructive/10 rounded-lg px-3 py-2">
                                <ArrowDownCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                                <span className="text-foreground font-medium">{DOWNTIME_LABELS[evt.reason] ?? evt.reason}</span>
                                <span className="text-muted-foreground ml-auto tabular-nums">
                                  {formatDuration((evt.endTime ?? Date.now()) - evt.startTime)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex justify-end">
                          <Button size="sm" variant="ghost" onClick={() => onDeleteRun(run.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* New Run Dialog */}
      <Dialog open={newRunDialogOpen} onOpenChange={setNewRunDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Production Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Printer</Label>
              <Select value={newPrinterId} onValueChange={setNewPrinterId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select printer" /></SelectTrigger>
                <SelectContent>
                  {printers.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Product / Message</Label>
              <Input className="mt-1" value={newMessageName} onChange={e => setNewMessageName(e.target.value)} placeholder="e.g. Batch 2024-001" />
            </div>
            <div>
              <Label className="text-sm">Target Count</Label>
              <Input className="mt-1" type="number" value={newTargetCount} onChange={e => setNewTargetCount(e.target.value)} placeholder="Required production qty" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewRunDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateRun} disabled={!newPrinterId || !newMessageName.trim() || !newTargetCount} className="industrial-button text-white border-0">
              Start Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Downtime Dialog */}
      <Dialog open={downtimeDialogOpen} onOpenChange={setDowntimeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Downtime Event</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-sm">Reason</Label>
            <Select value={downtimeReason} onValueChange={setDowntimeReason}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="printer_error">Printer Error</SelectItem>
                <SelectItem value="ink_empty">Ink Empty</SelectItem>
                <SelectItem value="makeup_empty">Makeup Empty</SelectItem>
                <SelectItem value="manual_stop">Manual Stop</SelectItem>
                <SelectItem value="changeover">Changeover</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDowntimeDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (downtimeRunId && downtimeReason) {
                  onAddDowntime(downtimeRunId, downtimeReason);
                  setDowntimeDialogOpen(false);
                  setDowntimeReason('');
                }
              }}
              disabled={!downtimeReason}
              className="industrial-button-danger text-white border-0"
            >
              Log Downtime
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Active run card with gradient border and live performance
function ActiveRunCard({
  run, oee, hasActiveDowntime,
  onEnd, onLogDowntime, onEndDowntime, onUpdateCount
}: {
  run: ProductionRun;
  oee: OEEMetrics;
  hasActiveDowntime: boolean;
  onEnd: (actualCount: string) => void;
  onLogDowntime: () => void;
  onEndDowntime: (eventId: string) => void;
  onUpdateCount: (count: string) => void;
}) {
  const [endCount, setEndCount] = useState(String(run.actualCount));
  const elapsed = formatDuration(Date.now() - run.startTime);
  const perfPct = run.targetCount > 0 ? Math.min(100, (run.actualCount / run.targetCount) * 100) : 0;

  return (
    <div className="rounded-xl p-4 border-2 border-success/30 bg-gradient-to-br from-success/5 to-transparent relative overflow-hidden">
      {/* Pulsing glow */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-success/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl animate-pulse" />

      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-success animate-pulse" />
            <span className="text-base font-bold text-foreground truncate">{run.messageName}</span>
          </div>
          <div className="text-sm text-muted-foreground">{run.printerName} • Started {elapsed} ago</div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Mini gauge */}
          <div className="relative w-14 h-14">
            <svg width={56} height={56} className="transform -rotate-90">
              <circle cx={28} cy={28} r={22} fill="none" stroke="hsl(var(--muted))" strokeWidth={4} opacity={0.3} />
              <circle
                cx={28} cy={28} r={22}
                fill="none"
                stroke={getOEEColor(oee.performance)}
                strokeWidth={4}
                strokeDasharray={2 * Math.PI * 22}
                strokeDashoffset={2 * Math.PI * 22 * (1 - Math.min(100, oee.performance) / 100)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-bold" style={{ color: getOEEColor(oee.performance) }}>{oee.performance.toFixed(0)}%</span>
              <span className="text-[8px] text-muted-foreground leading-none">Perf</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 mb-3 relative z-10">
        <div className="flex justify-between text-sm text-muted-foreground mb-1.5">
          <span className="font-medium">{run.actualCount.toLocaleString()} <span className="text-xs">/ {run.targetCount.toLocaleString()}</span></span>
          <span className="font-bold" style={{ color: perfPct >= 100 ? 'hsl(var(--success))' : 'hsl(var(--foreground))' }}>{perfPct.toFixed(0)}%</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden shadow-inner">
          <div
            className="h-full rounded-full transition-all duration-700 relative"
            style={{
              width: `${perfPct}%`,
              background: perfPct >= 100
                ? 'linear-gradient(90deg, hsl(var(--success)), hsl(142 71% 55%))'
                : 'linear-gradient(90deg, hsl(var(--primary)), hsl(207 90% 60%))',
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
          </div>
        </div>
      </div>

      {/* Active downtime warning */}
      {hasActiveDowntime && (
        <div className="flex items-center gap-2 bg-destructive/15 border border-destructive/20 rounded-lg px-3 py-2 mb-3 relative z-10">
          <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" />
          <span className="text-sm font-medium text-destructive">Downtime in progress</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 text-xs border-destructive/30"
            onClick={() => {
              const activeEvt = run.downtimeEvents.find(e => e.endTime === null);
              if (activeEvt) onEndDowntime(activeEvt.id);
            }}
          >
            End Downtime
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 relative z-10">
        <div className="flex-1">
          <Input
            type="number"
            value={endCount}
            onChange={e => {
              setEndCount(e.target.value);
              onUpdateCount(e.target.value);
            }}
            className="h-8 text-sm"
            placeholder="Current count"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={onLogDowntime}
          disabled={hasActiveDowntime}
        >
          <ArrowDownCircle className="w-3.5 h-3.5 mr-1" /> Downtime
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs industrial-button-danger text-white border-0"
          onClick={() => onEnd(endCount)}
        >
          End Run
        </Button>
      </div>
    </div>
  );
}
