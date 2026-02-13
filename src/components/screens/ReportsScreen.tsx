import { useState, useMemo } from 'react';
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
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie
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

// OEE Gauge Ring component
function OEEGauge({ value, label, color, size = 100 }: { value: number; label: string; color: string; size?: number }) {
  const strokeWidth = size * 0.1;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, value) / 100) * circumference;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={center} cy={center} r={radius}
            fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth}
          />
          <circle
            cx={center} cy={center} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg md:text-2xl font-bold text-foreground tabular-nums">
            {value.toFixed(1)}%
          </span>
        </div>
      </div>
      <span className="text-xs md:text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

// Status color for OEE values
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

export function ReportsScreen({
  runs, snapshots, printers,
  onAddRun, onUpdateRun, onDeleteRun,
  onAddDowntime, onEndDowntime,
  onHome,
}: ReportsScreenProps) {
  const [newRunDialogOpen, setNewRunDialogOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [downtimeDialogOpen, setDowntimeDialogOpen] = useState(false);
  const [downtimeReason, setDowntimeReason] = useState('');
  const [downtimeRunId, setDowntimeRunId] = useState<string | null>(null);

  // New run form state
  const [newPrinterId, setNewPrinterId] = useState<string>('');
  const [newMessageName, setNewMessageName] = useState('');
  const [newTargetCount, setNewTargetCount] = useState('');

  // Compute OEE for all runs
  const runMetrics = useMemo(() => {
    return runs.map(run => ({ run, oee: calculateOEE(run) }));
  }, [runs]);

  // Overall OEE (average of completed runs, or latest active)
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
      quality: avg('quality'),
      oee: avg('oee'),
      plannedTime: source.reduce((s, rm) => s + rm.oee.plannedTime, 0),
      runTime: source.reduce((s, rm) => s + rm.oee.runTime, 0),
      totalDowntime: source.reduce((s, rm) => s + rm.oee.totalDowntime, 0),
      targetCount: source.reduce((s, rm) => s + rm.oee.targetCount, 0),
      actualCount: source.reduce((s, rm) => s + rm.oee.actualCount, 0),
    };
  }, [runMetrics]);

  // Chart data: OEE over runs
  const oeeChartData = useMemo(() => {
    return [...runMetrics].reverse().map(rm => ({
      name: rm.run.messageName.substring(0, 12),
      oee: Number(rm.oee.oee.toFixed(1)),
      availability: Number(rm.oee.availability.toFixed(1)),
      performance: Number(rm.oee.performance.toFixed(1)),
    }));
  }, [runMetrics]);

  // Production bar chart data
  const productionChartData = useMemo(() => {
    return [...runMetrics].reverse().map(rm => ({
      name: rm.run.messageName.substring(0, 12),
      target: rm.run.targetCount,
      actual: rm.run.actualCount,
    }));
  }, [runMetrics]);

  // Active runs
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
        {/* OEE Overview Gauges */}
        {overallOEE ? (
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-4">
              <Gauge className="w-5 h-5 text-primary" />
              <h2 className="text-base md:text-lg font-bold text-foreground">OEE Overview</h2>
              <span className={`ml-auto px-3 py-1 rounded-full text-xs font-bold ${
                overallOEE.oee >= 85 ? 'bg-success/20 text-success' :
                overallOEE.oee >= 60 ? 'bg-warning/20 text-warning' :
                'bg-destructive/20 text-destructive'
              }`}>
                {getOEELabel(overallOEE.oee)}
              </span>
            </div>

            <div className="flex justify-around items-start flex-wrap gap-4">
              <OEEGauge
                value={overallOEE.oee}
                label="Overall OEE"
                color={getOEEColor(overallOEE.oee)}
                size={110}
              />
              <OEEGauge
                value={overallOEE.availability}
                label="Availability"
                color={getOEEColor(overallOEE.availability)}
                size={90}
              />
              <OEEGauge
                value={overallOEE.performance}
                label="Performance"
                color={getOEEColor(overallOEE.performance)}
                size={90}
              />
              <OEEGauge
                value={overallOEE.quality}
                label="Quality"
                color={getOEEColor(overallOEE.quality)}
                size={90}
              />
            </div>

            {/* Summary stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div className="bg-secondary rounded-lg p-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-primary flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Target</div>
                  <div className="text-sm font-bold text-foreground tabular-nums">{overallOEE.targetCount.toLocaleString()}</div>
                </div>
              </div>
              <div className="bg-secondary rounded-lg p-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Actual</div>
                  <div className="text-sm font-bold text-foreground tabular-nums">{overallOEE.actualCount.toLocaleString()}</div>
                </div>
              </div>
              <div className="bg-secondary rounded-lg p-3 flex items-center gap-2">
                <Timer className="w-4 h-4 text-primary flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Run Time</div>
                  <div className="text-sm font-bold text-foreground">{formatDuration(overallOEE.runTime)}</div>
                </div>
              </div>
              <div className="bg-secondary rounded-lg p-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Downtime</div>
                  <div className="text-sm font-bold text-foreground">{formatDuration(overallOEE.totalDowntime)}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-lg border p-8 text-center">
            <Factory className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-bold text-foreground mb-1">No Production Runs Yet</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Start tracking your production by creating a new run. Set target counts, log actual production, and monitor your OEE.
            </p>
            <Button onClick={() => setNewRunDialogOpen(true)} className="industrial-button text-white border-0">
              <Plus className="w-4 h-4 mr-1" /> Create First Run
            </Button>
          </div>
        )}

        {/* Charts Row */}
        {runMetrics.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* OEE Trend Chart */}
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">OEE Trend</h3>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={oeeChartData}>
                    <defs>
                      <linearGradient id="oeeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Area type="monotone" dataKey="oee" stroke="hsl(var(--primary))" fill="url(#oeeGrad)" strokeWidth={2} name="OEE %" />
                    <Area type="monotone" dataKey="availability" stroke="hsl(var(--success))" fill="none" strokeWidth={1.5} strokeDasharray="4 4" name="Avail %" />
                    <Area type="monotone" dataKey="performance" stroke="hsl(var(--warning))" fill="none" strokeWidth={1.5} strokeDasharray="4 4" name="Perf %" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Production vs Target Chart */}
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Target vs Actual</h3>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productionChartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="target" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} name="Target" />
                    <Bar dataKey="actual" radius={[4, 4, 0, 0]} name="Actual">
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

        {/* Active Runs */}
        {activeRuns.length > 0 && (
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-success animate-pulse" />
              <h3 className="text-sm font-bold text-foreground">Active Runs</h3>
              <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-full font-medium">{activeRuns.length} running</span>
            </div>
            <div className="space-y-2">
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

        {/* Run History */}
        {runs.filter(r => r.endTime !== null).length > 0 && (
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-bold text-foreground">Run History</h3>
            </div>
            <div className="space-y-1.5">
              {runs.filter(r => r.endTime !== null).map(run => {
                const oee = calculateOEE(run);
                const isExpanded = expandedRunId === run.id;
                return (
                  <div key={run.id} className="bg-secondary rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                      className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{run.messageName}</span>
                          <span className="text-xs text-muted-foreground">• {run.printerName}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatDateTime(run.startTime)} → {run.endTime ? formatDateTime(run.endTime) : '...'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <div className={`text-sm font-bold tabular-nums ${
                            oee.oee >= 85 ? 'text-success' : oee.oee >= 60 ? 'text-warning' : 'text-destructive'
                          }`}>
                            {oee.oee.toFixed(1)}%
                          </div>
                          <div className="text-[10px] text-muted-foreground">OEE</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-foreground tabular-nums">
                            {run.actualCount}/{run.targetCount}
                          </div>
                          <div className="text-[10px] text-muted-foreground">count</div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-border pt-3">
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div>
                            <div className="text-[10px] text-muted-foreground">Availability</div>
                            <div className="text-sm font-bold text-foreground">{oee.availability.toFixed(1)}%</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground">Performance</div>
                            <div className="text-sm font-bold text-foreground">{oee.performance.toFixed(1)}%</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground">Downtime</div>
                            <div className="text-sm font-bold text-foreground">{formatDuration(oee.totalDowntime)}</div>
                          </div>
                        </div>
                        {run.downtimeEvents.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-muted-foreground">Downtime Events</div>
                            {run.downtimeEvents.map(evt => (
                              <div key={evt.id} className="flex items-center gap-2 text-xs bg-destructive/10 rounded px-2 py-1">
                                <ArrowDownCircle className="w-3 h-3 text-destructive flex-shrink-0" />
                                <span className="text-foreground">{evt.reason}</span>
                                <span className="text-muted-foreground ml-auto">
                                  {formatDuration((evt.endTime ?? Date.now()) - evt.startTime)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex justify-end mt-2">
                          <Button size="sm" variant="ghost" onClick={() => onDeleteRun(run.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="w-3 h-3 mr-1" /> Delete
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

// Active run card sub-component
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
  const [showEndForm, setShowEndForm] = useState(false);
  const elapsed = formatDuration(Date.now() - run.startTime);

  return (
    <div className="bg-secondary rounded-lg p-3 border border-success/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-success animate-pulse" />
            <span className="text-sm font-bold text-foreground truncate">{run.messageName}</span>
          </div>
          <div className="text-xs text-muted-foreground">{run.printerName} • Started {elapsed} ago</div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <div className={`text-lg font-bold tabular-nums ${
              oee.performance >= 85 ? 'text-success' : oee.performance >= 60 ? 'text-warning' : 'text-destructive'
            }`}>
              {oee.performance.toFixed(0)}%
            </div>
            <div className="text-[10px] text-muted-foreground">Performance</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2 mb-2">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{run.actualCount.toLocaleString()} / {run.targetCount.toLocaleString()}</span>
          <span>{Math.min(100, (run.actualCount / run.targetCount * 100)).toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              run.actualCount >= run.targetCount ? 'bg-success' : 'bg-primary'
            }`}
            style={{ width: `${Math.min(100, (run.actualCount / run.targetCount) * 100)}%` }}
          />
        </div>
      </div>

      {/* Active downtime warning */}
      {hasActiveDowntime && (
        <div className="flex items-center gap-2 bg-destructive/10 rounded px-2 py-1.5 mb-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span className="text-xs font-medium text-destructive">Downtime in progress</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-6 text-xs"
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
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1">
          <Input
            type="number"
            value={endCount}
            onChange={e => {
              setEndCount(e.target.value);
              onUpdateCount(e.target.value);
            }}
            className="h-7 text-sm"
            placeholder="Current count"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={onLogDowntime}
          disabled={hasActiveDowntime}
        >
          <ArrowDownCircle className="w-3 h-3 mr-1" /> Downtime
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs industrial-button-danger text-white border-0"
          onClick={() => onEnd(endCount)}
        >
          End Run
        </Button>
      </div>
    </div>
  );
}
