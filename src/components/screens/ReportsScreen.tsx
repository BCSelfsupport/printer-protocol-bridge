import { useState, useMemo, useEffect } from 'react';
import {
  BarChart3, TrendingUp, Clock, AlertTriangle, Plus, Trash2,
  Download, Target, Activity, Gauge, ArrowDownCircle, CheckCircle2,
  Timer, Factory, Zap, ChevronDown, ChevronUp, ArrowLeft,
  Printer as PrinterIcon, Package, ChevronRight
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

/* ================================================================
   SHARED HELPERS
   ================================================================ */

function OEEGauge({ value, label, size = 120, isPrimary = false }: { value: number; label: string; size?: number; isPrimary?: boolean }) {
  const [animatedValue, setAnimatedValue] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(value), 100);
    return () => clearTimeout(timer);
  }, [value]);

  const strokeWidth = isPrimary ? size * 0.09 : size * 0.08;
  const trackWidth = isPrimary ? size * 0.04 : size * 0.035;
  const radius = (size - strokeWidth) / 2;
  const innerRadius = radius - strokeWidth * 0.8;
  const circumference = 2 * Math.PI * radius;
  const innerCircumference = 2 * Math.PI * innerRadius;
  const offset = circumference - (Math.min(100, animatedValue) / 100) * circumference;
  const innerOffset = innerCircumference - (Math.min(100, animatedValue) / 100) * innerCircumference;
  const center = size / 2;
  const color = getOEEColor(value);

  // Position of the end dot on the arc
  const angle = (Math.min(100, animatedValue) / 100) * 360 - 90;
  const dotX = center + radius * Math.cos((angle * Math.PI) / 180);
  const dotY = center + radius * Math.sin((angle * Math.PI) / 180);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative group" style={{ width: size, height: size }}>
        {/* Outer glow */}
        {isPrimary && (
          <div className="absolute inset-[-8px] rounded-full opacity-25 blur-xl transition-opacity duration-500 group-hover:opacity-40"
               style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }} />
        )}
        {/* Inner soft glow */}
        <div className="absolute inset-[15%] rounded-full opacity-10 blur-lg"
             style={{ backgroundColor: color }} />

        <svg width={size} height={size} className="transform -rotate-90 relative z-10">
          <defs>
            <linearGradient id={`gauge-grad-${label}-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity={0.6} />
              <stop offset="50%" stopColor={color} stopOpacity={1} />
              <stop offset="100%" stopColor={color} stopOpacity={0.8} />
            </linearGradient>
            <filter id={`gauge-glow-${label}-${size}`}>
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id={`gauge-shadow-${label}-${size}`}>
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={color} floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Background track - outer */}
          <circle cx={center} cy={center} r={radius} fill="none"
                  stroke="hsl(var(--muted))" strokeWidth={trackWidth} opacity={0.3} />

          {/* Background track - inner */}
          <circle cx={center} cy={center} r={innerRadius} fill="none"
                  stroke="hsl(var(--muted))" strokeWidth={trackWidth * 0.6} opacity={0.15} />

          {/* Inner progress ring (thinner, subtle) */}
          <circle
            cx={center} cy={center} r={innerRadius} fill="none"
            stroke={color}
            strokeWidth={trackWidth * 0.6}
            strokeDasharray={innerCircumference}
            strokeDashoffset={innerOffset}
            strokeLinecap="round"
            opacity={0.25}
            className="transition-all duration-1000 ease-out"
          />

          {/* Main progress arc */}
          <circle
            cx={center} cy={center} r={radius} fill="none"
            stroke={`url(#gauge-grad-${label}-${size})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            filter={`url(#gauge-shadow-${label}-${size})`}
            className="transition-all duration-1000 ease-out"
          />

          {/* End dot */}
          {animatedValue > 2 && (
            <circle
              cx={dotX} cy={dotY} r={strokeWidth * 0.35}
              fill="white"
              filter={`url(#gauge-glow-${label}-${size})`}
              className="transition-all duration-1000 ease-out"
              opacity={0.9}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <span className={`font-black tabular-nums tracking-tight ${isPrimary ? 'text-3xl md:text-4xl' : 'text-xl md:text-2xl'}`}
                style={{ color, textShadow: `0 0 20px ${color}33` }}>
            {animatedValue.toFixed(1)}%
          </span>
        </div>
      </div>
      <span className={`font-semibold tracking-wide uppercase ${isPrimary ? 'text-xs md:text-sm' : 'text-[10px] md:text-xs'} text-muted-foreground`}>
        {label}
      </span>
    </div>
  );
}
function MiniGauge({ value, size = 40, strokeWidth = 3 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} opacity={0.4} />
        <circle
          cx={center} cy={center} r={radius} fill="none"
          stroke={getOEEColor(value)} strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(100, value) / 100)}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">{value.toFixed(0)}</span>
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

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
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

function StatCard({ icon: Icon, label, value, accent }: {
  icon: React.ElementType; label: string; value: string; accent: 'primary' | 'success' | 'destructive' | 'warning';
}) {
  const bgMap = {
    primary: 'from-primary/10 via-primary/5 to-transparent',
    success: 'from-success/10 via-success/5 to-transparent',
    destructive: 'from-destructive/10 via-destructive/5 to-transparent',
    warning: 'from-warning/10 via-warning/5 to-transparent',
  };
  const borderMap = {
    primary: 'border-primary/20 hover:border-primary/40',
    success: 'border-success/20 hover:border-success/40',
    destructive: 'border-destructive/20 hover:border-destructive/40',
    warning: 'border-warning/20 hover:border-warning/40',
  };
  const iconColorMap = { primary: 'text-primary', success: 'text-success', destructive: 'text-destructive', warning: 'text-warning' };
  const dotColorMap = { primary: 'bg-primary', success: 'bg-success', destructive: 'bg-destructive', warning: 'bg-warning' };

  return (
    <div className={`rounded-2xl border backdrop-blur-sm bg-gradient-to-br ${bgMap[accent]} ${borderMap[accent]} p-4 md:p-5 transition-all duration-300 group relative overflow-hidden`}>
      {/* Decorative corner glow */}
      <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full ${dotColorMap[accent]} opacity-[0.07] blur-xl`} />
      <div className="flex items-center gap-2.5 mb-2 relative z-10">
        <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg bg-gradient-to-br ${bgMap[accent]} flex items-center justify-center border ${borderMap[accent]}`}>
          <Icon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${iconColorMap[accent]}`} />
        </div>
        <span className="text-xs md:text-sm text-muted-foreground font-medium tracking-wide">{label}</span>
      </div>
      <div className="text-2xl md:text-3xl font-black text-foreground tabular-nums pl-0 relative z-10 tracking-tight">{value}</div>
    </div>
  );
}

// Live tick hook: forces re-render every second when active runs exist
function useLiveTick(hasActiveRuns: boolean) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!hasActiveRuns) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasActiveRuns]);
  return tick;
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */

export function ReportsScreen({
  runs, snapshots, printers,
  onAddRun, onUpdateRun, onDeleteRun,
  onAddDowntime, onEndDowntime,
  onHome,
}: ReportsScreenProps) {
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
  const [detailPrinterId, setDetailPrinterId] = useState<number | null>(null);
  const [newRunDialogOpen, setNewRunDialogOpen] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [downtimeDialogOpen, setDowntimeDialogOpen] = useState(false);
  const [downtimeReason, setDowntimeReason] = useState('');
  const [downtimeRunId, setDowntimeRunId] = useState<string | null>(null);
  const [newPrinterId, setNewPrinterId] = useState<string>('');
  const [newMessageName, setNewMessageName] = useState('');
  const [newTargetCount, setNewTargetCount] = useState('');

  const hasActiveRuns = runs.some(r => r.endTime === null);
  const tick = useLiveTick(hasActiveRuns);

  // Per-printer run data (recalculates every second when active runs exist)
  const printerRunData = useMemo(() => {
    const map = new Map<number, { runs: ProductionRun[]; metrics: { run: ProductionRun; oee: OEEMetrics }[] }>();
    printers.forEach(p => map.set(p.id, { runs: [], metrics: [] }));
    runs.forEach(run => {
      const entry = map.get(run.printerId);
      if (entry) {
        entry.runs.push(run);
        entry.metrics.push({ run, oee: calculateOEE(run) });
      }
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, printers, tick]);

  // Overall stats across all printers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allMetrics = useMemo(() => runs.map(run => ({ run, oee: calculateOEE(run) })), [runs, tick]);

  const overallOEE = useMemo((): OEEMetrics | null => {
    if (allMetrics.length === 0) return null;
    const completedRuns = allMetrics.filter(rm => rm.run.endTime !== null);
    const source = completedRuns.length > 0 ? completedRuns : allMetrics;
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
  }, [allMetrics]);

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

  const handleExportCSV = (runsToExport: { run: ProductionRun; oee: OEEMetrics }[]) => {
    const headers = ['Run ID', 'Printer', 'Message', 'Start', 'End', 'Target', 'Actual', 'OEE %', 'Availability %', 'Performance %', 'Downtime (min)'];
    const rows = runsToExport.map(rm => [
      rm.run.id.substring(0, 8), rm.run.printerName, rm.run.messageName,
      new Date(rm.run.startTime).toISOString(),
      rm.run.endTime ? new Date(rm.run.endTime).toISOString() : 'Active',
      rm.run.targetCount, rm.run.actualCount,
      rm.oee.oee.toFixed(1), rm.oee.availability.toFixed(1), rm.oee.performance.toFixed(1),
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

  // Compute selected printer's OEE for inline display
  const selectedData = selectedPrinterId !== null ? printerRunData.get(selectedPrinterId) : null;
  const selectedPrinter = selectedPrinterId !== null ? printers.find(p => p.id === selectedPrinterId) : null;
  const selectedOEE = useMemo((): OEEMetrics | null => {
    if (!selectedData || selectedData.metrics.length === 0) return null;
    const completed = selectedData.metrics.filter(rm => rm.run.endTime !== null);
    const source = completed.length > 0 ? completed : selectedData.metrics;
    const liveMetrics = source.map(rm => rm.run.endTime === null ? { ...rm, oee: calculateOEE(rm.run) } : rm);
    const avg = (field: keyof OEEMetrics) => liveMetrics.reduce((s, rm) => s + (rm.oee[field] as number), 0) / liveMetrics.length;
    return {
      availability: avg('availability'), performance: avg('performance'), oee: avg('oee'),
      plannedTime: liveMetrics.reduce((s, rm) => s + rm.oee.plannedTime, 0),
      runTime: liveMetrics.reduce((s, rm) => s + rm.oee.runTime, 0),
      totalDowntime: liveMetrics.reduce((s, rm) => s + rm.oee.totalDowntime, 0),
      targetCount: liveMetrics.reduce((s, rm) => s + rm.oee.targetCount, 0),
      actualCount: liveMetrics.reduce((s, rm) => s + rm.oee.actualCount, 0),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedData, tick]);

  // If drilling into full detail view
  if (detailPrinterId !== null) {
    const printer = printers.find(p => p.id === detailPrinterId);
    const data = printerRunData.get(detailPrinterId);
    if (!printer || !data) {
      setDetailPrinterId(null);
      return null;
    }
    return (
      <PrinterReportDetail
        printer={printer}
        runs={data.runs}
        metrics={data.metrics}
        onBack={() => setDetailPrinterId(null)}
        onHome={onHome}
        onUpdateRun={onUpdateRun}
        onDeleteRun={onDeleteRun}
        onAddDowntime={onAddDowntime}
        onEndDowntime={onEndDowntime}
        onExportCSV={() => handleExportCSV(data.metrics)}
        expandedRunId={expandedRunId}
        setExpandedRunId={setExpandedRunId}
        onLogDowntime={(runId) => { setDowntimeRunId(runId); setDowntimeDialogOpen(true); }}
      />
    );
  }

  // ========== OVERVIEW: All printers grid ==========
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="p-3 md:p-4 flex-shrink-0">
        <SubPageHeader
          title="Production Reports"
          onHome={onHome}
          rightContent={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleExportCSV(allMetrics)} disabled={runs.length === 0}>
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

        {/* ===== Selected Printer OEE Detail (at top) ===== */}
        {selectedPrinter && selectedOEE && (
          <div className="rounded-2xl border border-primary/15 p-6 md:p-8 shadow-xl relative overflow-hidden animate-fade-in"
               style={{
                 background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--secondary) / 0.5) 50%, hsl(var(--card)) 100%)',
               }}>
            {/* Ambient light effects */}
            <div className="absolute top-0 right-0 w-72 h-72 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none"
                 style={{ background: `radial-gradient(circle, ${getOEEColor(selectedOEE.oee)}15 0%, transparent 70%)` }} />
            <div className="absolute bottom-0 left-0 w-56 h-56 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl pointer-events-none"
                 style={{ background: `radial-gradient(circle, hsl(var(--primary) / 0.08) 0%, transparent 70%)` }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none"
                 style={{ background: `radial-gradient(circle, hsl(var(--success) / 0.04) 0%, transparent 60%)` }} />

            {/* Header */}
            <div className="flex items-center gap-3 mb-6 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20 shadow-sm">
                <PrinterIcon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl md:text-2xl font-black text-foreground truncate tracking-tight">{selectedPrinter.name}</h2>
                <p className="text-[11px] text-muted-foreground font-mono tracking-wider">{selectedPrinter.ipAddress}:{selectedPrinter.port}</p>
              </div>
              <span className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-lg ${
                selectedOEE.oee >= 85 ? 'bg-success text-success-foreground' :
                selectedOEE.oee >= 60 ? 'bg-warning text-warning-foreground' :
                'bg-destructive text-destructive-foreground'
              }`}
                    style={{
                      boxShadow: `0 4px 15px ${
                        selectedOEE.oee >= 85 ? 'hsl(var(--success) / 0.3)' :
                        selectedOEE.oee >= 60 ? 'hsl(var(--warning) / 0.3)' :
                        'hsl(var(--destructive) / 0.3)'
                      }`
                    }}>
                {getOEELabel(selectedOEE.oee)}
              </span>
            </div>

            {/* Separator line */}
            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mb-6 relative z-10" />

            {/* Gauges row — 3 independent gauges with formula */}
            <div className="relative z-10 mb-6">
              <div className="rounded-xl bg-gradient-to-b from-secondary/60 to-secondary/20 border border-border/50 p-5 md:p-6">
                <div className="flex justify-around items-end flex-wrap gap-4 md:gap-6">
                  <OEEGauge value={selectedOEE.availability} label="Availability" size={120} />

                  {/* × connector */}
                  <div className="flex flex-col items-center gap-1 pb-8">
                    <span className="text-xl font-light text-muted-foreground/50">×</span>
                  </div>

                  <OEEGauge value={selectedOEE.performance} label="Performance" size={120} />

                  {/* = connector */}
                  <div className="flex flex-col items-center gap-1 pb-8">
                    <span className="text-xl font-light text-muted-foreground/50">=</span>
                  </div>

                  <OEEGauge value={selectedOEE.oee} label="OEE" size={150} isPrimary />
                </div>
              </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 relative z-10 mb-6">
              <StatCard icon={Target} label="Target" value={selectedOEE.targetCount.toLocaleString()} accent="primary" />
              <StatCard icon={CheckCircle2} label="Actual" value={selectedOEE.actualCount.toLocaleString()} accent="success" />
              <StatCard icon={Timer} label="Run Time" value={formatDuration(selectedOEE.runTime)} accent="warning" />
              <StatCard icon={AlertTriangle} label="Downtime" value={formatDuration(selectedOEE.totalDowntime)} accent="destructive" />
            </div>

            {/* View full report button */}
            <div className="flex justify-center relative z-10">
              <Button
                size="sm"
                onClick={() => setDetailPrinterId(selectedPrinterId)}
                className="industrial-button text-white border-0 px-6 py-2.5 rounded-xl shadow-lg hover:shadow-xl transition-shadow"
              >
                <BarChart3 className="w-4 h-4 mr-2" /> View Full Report
              </Button>
            </div>
          </div>
        )}

        {/* ===== Printer Cards Grid ===== */}
        <div className="flex items-center gap-2 mb-1">
          <PrinterIcon className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">Printers</h3>
          <span className="text-xs text-muted-foreground">{printers.length} devices</span>
        </div>

        {printers.length === 0 ? (
          <div className="rounded-xl border bg-gradient-to-br from-card to-secondary/30 p-10 text-center shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-2xl" />
            <div className="w-16 h-16 rounded-2xl industrial-button flex items-center justify-center mx-auto mb-4">
              <Factory className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">No Printers Configured</h2>
            <p className="text-sm text-muted-foreground">Add printers to start tracking production.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {printers.map(printer => {
              const data = printerRunData.get(printer.id);
              const activeRuns = data?.runs.filter(r => r.endTime === null) ?? [];
              const completedRuns = data?.runs.filter(r => r.endTime !== null) ?? [];
              const printerMetrics = data?.metrics ?? [];
              const completed = printerMetrics.filter(m => m.run.endTime !== null);
              const avgOee = completed.length > 0
                ? completed.reduce((s, m) => s + m.oee.oee, 0) / completed.length
                : null;
              const totalProduced = printerMetrics.reduce((s, m) => s + m.run.actualCount, 0);
              const totalTarget = printerMetrics.reduce((s, m) => s + m.run.targetCount, 0);

              return (
                <button
                  key={printer.id}
                  onClick={() => setSelectedPrinterId(selectedPrinterId === printer.id ? null : printer.id)}
                  className={`group rounded-xl border p-4 text-left transition-all relative overflow-hidden ${
                    selectedPrinterId === printer.id
                      ? 'bg-primary/5 border-primary/40 shadow-md ring-1 ring-primary/20'
                      : 'bg-card hover:bg-secondary/50 hover:shadow-md hover:border-primary/30'
                  }`}
                >
                  {activeRuns.length > 0 && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-success via-success to-success/50 rounded-t-xl">
                      <div className="absolute inset-0 bg-success/50 animate-pulse rounded-t-xl" />
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      {avgOee !== null ? (
                        <MiniGauge value={avgOee} size={48} strokeWidth={4} />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                          <PrinterIcon className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground truncate">{printer.name}</span>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${printer.isAvailable ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{printer.ipAddress}:{printer.port}</div>

                      {activeRuns.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          {activeRuns.map(run => {
                            const oee = calculateOEE(run);
                            const perfPct = run.targetCount > 0 ? Math.min(100, (run.actualCount / run.targetCount) * 100) : 0;
                            const hasDowntime = run.downtimeEvents.some(e => e.endTime === null);
                            return (
                              <div key={run.id} className="bg-success/5 rounded-lg px-2.5 py-2 border border-success/15">
                                <div className="flex items-center gap-1.5">
                                  <Activity className="w-3 h-3 text-success flex-shrink-0" />
                                  <span className="text-xs font-semibold text-foreground truncate">{run.messageName}</span>
                                  {hasDowntime && <AlertTriangle className="w-3 h-3 text-destructive animate-pulse flex-shrink-0 ml-auto" />}
                                </div>
                                <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${perfPct}%`,
                                      background: perfPct >= 100 ? 'hsl(var(--success))' : 'hsl(var(--primary))',
                                    }}
                                  />
                                </div>
                                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                                  <span>{run.actualCount.toLocaleString()} / {run.targetCount.toLocaleString()}</span>
                                  <span className="font-semibold" style={{ color: getOEEColor(oee.performance) }}>{perfPct.toFixed(0)}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-muted-foreground/60 italic">No active runs</div>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
                  </div>

                  <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-border/50">
                    <div className="flex items-center gap-1.5">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{totalProduced.toLocaleString()}</span>
                        {totalTarget > 0 && <span> / {totalTarget.toLocaleString()}</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <BarChart3 className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{completedRuns.length}</span> runs
                      </span>
                    </div>
                    {avgOee !== null && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-[11px] font-bold" style={{ color: getOEEColor(avgOee) }}>
                          {avgOee.toFixed(1)}% OEE
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ===== Charts for selected printer or all ===== */}
        {selectedData && selectedData.metrics.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartOEETrend data={selectedData.metrics} />
            <ChartTargetVsActual data={selectedData.metrics} />
          </div>
        ) : !selectedPrinterId && allMetrics.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartOEETrend data={allMetrics} />
            <ChartTargetVsActual data={allMetrics} />
          </div>
        ) : null}
      </div>

      {/* Dialogs */}
      <NewRunDialog
        open={newRunDialogOpen}
        onOpenChange={setNewRunDialogOpen}
        printers={printers}
        newPrinterId={newPrinterId}
        setNewPrinterId={setNewPrinterId}
        newMessageName={newMessageName}
        setNewMessageName={setNewMessageName}
        newTargetCount={newTargetCount}
        setNewTargetCount={setNewTargetCount}
        onCreate={handleCreateRun}
      />
      <DowntimeDialog
        open={downtimeDialogOpen}
        onOpenChange={setDowntimeDialogOpen}
        reason={downtimeReason}
        setReason={setDowntimeReason}
        onConfirm={() => {
          if (downtimeRunId && downtimeReason) {
            onAddDowntime(downtimeRunId, downtimeReason);
            setDowntimeDialogOpen(false);
            setDowntimeReason('');
          }
        }}
      />
    </div>
  );
}

/* ================================================================
   PRINTER DETAIL VIEW
   ================================================================ */

function PrinterReportDetail({
  printer, runs, metrics, onBack, onHome,
  onUpdateRun, onDeleteRun, onAddDowntime, onEndDowntime,
  onExportCSV, expandedRunId, setExpandedRunId, onLogDowntime,
}: {
  printer: Printer;
  runs: ProductionRun[];
  metrics: { run: ProductionRun; oee: OEEMetrics }[];
  onBack: () => void;
  onHome: () => void;
  onUpdateRun: (id: string, updates: Partial<ProductionRun>) => void;
  onDeleteRun: (id: string) => void;
  onAddDowntime: (runId: string, reason: string) => void;
  onEndDowntime: (runId: string, eventId: string) => void;
  onExportCSV: () => void;
  expandedRunId: string | null;
  setExpandedRunId: (id: string | null) => void;
  onLogDowntime: (runId: string) => void;
}) {
  const activeRuns = runs.filter(r => r.endTime === null);
  const completedRuns = runs.filter(r => r.endTime !== null);
  const tick = useLiveTick(activeRuns.length > 0);

  const printerOEE = useMemo((): OEEMetrics | null => {
    if (metrics.length === 0) return null;
    const completed = metrics.filter(rm => rm.run.endTime !== null);
    const source = completed.length > 0 ? completed : metrics;
    // Recalculate OEE live for active runs
    const liveMetrics = source.map(rm => rm.run.endTime === null ? { ...rm, oee: calculateOEE(rm.run) } : rm);
    const avg = (field: keyof OEEMetrics) => liveMetrics.reduce((s, rm) => s + (rm.oee[field] as number), 0) / liveMetrics.length;
    return {
      availability: avg('availability'), performance: avg('performance'), oee: avg('oee'),
      plannedTime: liveMetrics.reduce((s, rm) => s + rm.oee.plannedTime, 0),
      runTime: liveMetrics.reduce((s, rm) => s + rm.oee.runTime, 0),
      totalDowntime: liveMetrics.reduce((s, rm) => s + rm.oee.totalDowntime, 0),
      targetCount: liveMetrics.reduce((s, rm) => s + rm.oee.targetCount, 0),
      actualCount: liveMetrics.reduce((s, rm) => s + rm.oee.actualCount, 0),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, tick]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="p-3 md:p-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <PrinterIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm md:text-base font-bold text-foreground truncate">{printer.name}</h2>
              <p className="text-[10px] text-muted-foreground">{printer.ipAddress}:{printer.port}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={onExportCSV} disabled={runs.length === 0}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 md:px-4 pb-4 space-y-4">
        {/* OEE Summary for this printer */}
        {printerOEE ? (
          <div className="rounded-xl border bg-gradient-to-br from-card via-card to-secondary/50 p-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-2xl" />
            <div className="flex justify-around items-end flex-wrap gap-4 md:gap-6 relative z-10 mb-4">
              <OEEGauge value={printerOEE.oee} label="OEE" size={120} isPrimary />
              <OEEGauge value={printerOEE.availability} label="Availability" size={90} />
              <OEEGauge value={printerOEE.performance} label="Performance" size={90} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10">
              <StatCard icon={Target} label="Target" value={printerOEE.targetCount.toLocaleString()} accent="primary" />
              <StatCard icon={CheckCircle2} label="Actual" value={printerOEE.actualCount.toLocaleString()} accent="success" />
              <StatCard icon={Timer} label="Run Time" value={formatDuration(printerOEE.runTime)} accent="primary" />
              <StatCard icon={AlertTriangle} label="Downtime" value={formatDuration(printerOEE.totalDowntime)} accent="destructive" />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-8 text-center">
            <Factory className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No production runs recorded for this printer.</p>
          </div>
        )}

        {/* Active runs */}
        {activeRuns.length > 0 && (
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-success animate-pulse" />
              <h3 className="text-sm font-bold text-foreground">Active Runs</h3>
              <span className="text-xs bg-success text-success-foreground px-2 py-0.5 rounded-full font-bold">{activeRuns.length}</span>
            </div>
            <div className="space-y-3">
              {activeRuns.map(run => {
                const oee = calculateOEE(run);
                const hasActiveDowntime = run.downtimeEvents.some(e => e.endTime === null);
                return (
                  <ActiveRunCard
                    key={run.id} run={run} oee={oee} hasActiveDowntime={hasActiveDowntime}
                    onEnd={(c) => onUpdateRun(run.id, { endTime: Date.now(), actualCount: Number(c) })}
                    onLogDowntime={() => onLogDowntime(run.id)}
                    onEndDowntime={(eventId) => onEndDowntime(run.id, eventId)}
                    onUpdateCount={(c) => onUpdateRun(run.id, { actualCount: Number(c) })}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Charts for this printer */}
        {metrics.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartOEETrend data={metrics} />
            <ChartTargetVsActual data={metrics} />
          </div>
        )}

        {/* Completed run history */}
        {completedRuns.length > 0 && (
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-bold text-foreground">Run History</h3>
              <span className="text-xs text-muted-foreground">{completedRuns.length} completed</span>
            </div>
            <div className="space-y-2">
              {completedRuns.map(run => {
                const oee = calculateOEE(run);
                const isExpanded = expandedRunId === run.id;
                const perfPct = run.targetCount > 0 ? Math.min(100, (run.actualCount / run.targetCount) * 100) : 0;
                return (
                  <div key={run.id} className="rounded-lg overflow-hidden border bg-secondary/50">
                    <button
                      onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                    >
                      <MiniGauge value={oee.oee} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">{run.messageName}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatDateTime(run.startTime)} → {run.endTime ? formatDateTime(run.endTime) : '...'}
                        </div>
                        <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${perfPct}%`,
                            backgroundColor: perfPct >= 100 ? 'hsl(var(--success))' : perfPct >= 60 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))',
                          }} />
                        </div>
                      </div>
                      <div className="text-right hidden md:block flex-shrink-0">
                        <div className="text-sm font-bold text-foreground tabular-nums">
                          {run.actualCount.toLocaleString()}<span className="text-muted-foreground font-normal">/{run.targetCount.toLocaleString()}</span>
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
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
                                <span className="text-muted-foreground ml-auto tabular-nums">{formatDuration((evt.endTime ?? Date.now()) - evt.startTime)}</span>
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
    </div>
  );
}

/* ================================================================
   SHARED CHART COMPONENTS
   ================================================================ */

function ChartOEETrend({ data }: { data: { run: ProductionRun; oee: OEEMetrics }[] }) {
  const chartData = useMemo(() => [...data].reverse().map(rm => ({
    name: rm.run.messageName.substring(0, 12),
    oee: Number(rm.oee.oee.toFixed(1)),
    availability: Number(rm.oee.availability.toFixed(1)),
    performance: Number(rm.oee.performance.toFixed(1)),
  })), [data]);

  return (
    <div className="rounded-xl border bg-card p-4 md:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-primary" />
        </div>
        <h3 className="text-sm md:text-base font-bold text-foreground">OEE Trend</h3>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
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
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
            <Area type="monotone" dataKey="oee" stroke="hsl(var(--primary))" fill="url(#oeeGrad)" strokeWidth={2.5} name="OEE %" />
            <Area type="monotone" dataKey="availability" stroke="hsl(var(--success))" fill="url(#availGrad)" strokeWidth={1.5} strokeDasharray="5 3" name="Availability %" />
            <Area type="monotone" dataKey="performance" stroke="hsl(var(--warning))" fill="none" strokeWidth={1.5} strokeDasharray="5 3" name="Performance %" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChartTargetVsActual({ data }: { data: { run: ProductionRun; oee: OEEMetrics }[] }) {
  const chartData = useMemo(() => [...data].reverse().map(rm => ({
    name: rm.run.messageName.substring(0, 12),
    target: rm.run.targetCount,
    actual: rm.run.actualCount,
  })), [data]);

  return (
    <div className="rounded-xl border bg-card p-4 md:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <BarChart3 className="w-4 h-4 text-primary" />
        </div>
        <h3 className="text-sm md:text-base font-bold text-foreground">Target vs Actual</h3>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
            <Bar dataKey="target" fill="hsl(var(--muted))" radius={[6, 6, 0, 0]} name="Target" barSize={28} />
            <Bar dataKey="actual" radius={[6, 6, 0, 0]} name="Actual" barSize={28}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.actual >= entry.target ? 'hsl(var(--success))' : 'hsl(var(--warning))'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ================================================================
   ACTIVE RUN CARD
   ================================================================ */

function ActiveRunCard({
  run, oee, hasActiveDowntime, onEnd, onLogDowntime, onEndDowntime, onUpdateCount
}: {
  run: ProductionRun; oee: OEEMetrics; hasActiveDowntime: boolean;
  onEnd: (actualCount: string) => void;
  onLogDowntime: () => void;
  onEndDowntime: (eventId: string) => void;
  onUpdateCount: (count: string) => void;
}) {
  const [endCount, setEndCount] = useState(String(run.actualCount));
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = formatDuration(Date.now() - run.startTime);
  const perfPct = run.targetCount > 0 ? Math.min(100, (run.actualCount / run.targetCount) * 100) : 0;

  return (
    <div className="rounded-xl p-4 border-2 border-success/30 bg-gradient-to-br from-success/5 to-transparent relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-success/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl animate-pulse" />
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-success animate-pulse" />
            <span className="text-base font-bold text-foreground truncate">{run.messageName}</span>
          </div>
          <div className="text-sm text-muted-foreground">{run.printerName} • Started {elapsed} ago</div>
        </div>
        <div className="flex-shrink-0">
          <MiniGauge value={oee.performance} size={56} strokeWidth={4} />
          <div className="text-center text-[8px] text-muted-foreground mt-0.5">Perf</div>
        </div>
      </div>

      <div className="mt-3 mb-3 relative z-10">
        <div className="flex justify-between text-sm text-muted-foreground mb-1.5">
          <span className="font-medium">{run.actualCount.toLocaleString()} <span className="text-xs">/ {run.targetCount.toLocaleString()}</span></span>
          <span className="font-bold" style={{ color: perfPct >= 100 ? 'hsl(var(--success))' : 'hsl(var(--foreground))' }}>{perfPct.toFixed(0)}%</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden shadow-inner">
          <div className="h-full rounded-full transition-all duration-700 relative" style={{
            width: `${perfPct}%`,
            background: perfPct >= 100
              ? 'linear-gradient(90deg, hsl(var(--success)), hsl(142 71% 55%))'
              : 'linear-gradient(90deg, hsl(var(--primary)), hsl(207 90% 60%))',
          }}>
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
          </div>
        </div>
      </div>

      {hasActiveDowntime && (
        <div className="flex items-center gap-2 bg-destructive/15 border border-destructive/20 rounded-lg px-3 py-2 mb-3 relative z-10">
          <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" />
          <span className="text-sm font-medium text-destructive">Downtime in progress</span>
          <Button size="sm" variant="outline" className="ml-auto h-7 text-xs border-destructive/30" onClick={() => {
            const activeEvt = run.downtimeEvents.find(e => e.endTime === null);
            if (activeEvt) onEndDowntime(activeEvt.id);
          }}>End Downtime</Button>
        </div>
      )}

      <div className="flex items-center gap-2 relative z-10">
        <div className="flex-1">
          <Input type="number" value={endCount} onChange={e => { setEndCount(e.target.value); onUpdateCount(e.target.value); }} className="h-8 text-sm" placeholder="Current count" />
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onLogDowntime} disabled={hasActiveDowntime}>
          <ArrowDownCircle className="w-3.5 h-3.5 mr-1" /> Downtime
        </Button>
        <Button size="sm" className="h-8 text-xs industrial-button-danger text-white border-0" onClick={() => onEnd(endCount)}>End Run</Button>
      </div>
    </div>
  );
}

/* ================================================================
   DIALOGS
   ================================================================ */

function NewRunDialog({ open, onOpenChange, printers, newPrinterId, setNewPrinterId, newMessageName, setNewMessageName, newTargetCount, setNewTargetCount, onCreate }: {
  open: boolean; onOpenChange: (o: boolean) => void; printers: Printer[];
  newPrinterId: string; setNewPrinterId: (v: string) => void;
  newMessageName: string; setNewMessageName: (v: string) => void;
  newTargetCount: string; setNewTargetCount: (v: string) => void;
  onCreate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Production Run</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-sm">Printer</Label>
            <Select value={newPrinterId} onValueChange={setNewPrinterId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select printer" /></SelectTrigger>
              <SelectContent>{printers.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onCreate} disabled={!newPrinterId || !newMessageName.trim() || !newTargetCount} className="industrial-button text-white border-0">Start Run</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DowntimeDialog({ open, onOpenChange, reason, setReason, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; reason: string; setReason: (v: string) => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Log Downtime Event</DialogTitle></DialogHeader>
        <div>
          <Label className="text-sm">Reason</Label>
          <Select value={reason} onValueChange={setReason}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!reason} className="industrial-button-danger text-white border-0">Log Downtime</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
