/**
 * Shift Report — production grouped by configurable shift windows.
 */

import { useMemo, useRef, useState } from 'react';
import {
  Clock, Settings, Sun, Sunset, Moon, Package, Activity, Timer,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, Legend,
} from 'recharts';
import type { ProductionRun } from '@/types/production';
import type { Printer } from '@/types/printer';
import type { DateScope, ShiftWindow } from '@/types/reportTemplates';
import { DEFAULT_SHIFTS } from '@/types/reportTemplates';
import { KpiCard } from './KpiCard';
import { ReportDownloadMenu } from './ReportDownloadMenu';
import { ChartShell } from './ReportCharts';
import {
  filterRuns, aggregate, groupByShift, formatDuration, formatNumber,
  describeDateScope,
} from '@/lib/reportAggregation';

const SHIFT_ICONS: Record<string, React.ElementType> = {
  day: Sun,
  swing: Sunset,
  night: Moon,
};

const STORAGE_KEY = 'codesync-shift-windows';

function loadShifts(): ShiftWindow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_SHIFTS;
}

function saveShifts(shifts: ShiftWindow[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(shifts)); } catch { /* ignore */ }
}

export function ShiftReport({
  runs, scope,
}: {
  runs: ProductionRun[];
  scope: DateScope;
  printers: Printer[];
}) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [shifts, setShifts] = useState<ShiftWindow[]>(loadShifts);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const filtered = useMemo(() => filterRuns(runs, scope), [runs, scope]);
  const total = useMemo(() => aggregate(filtered), [filtered]);

  const perShift = useMemo(() => {
    const groups = groupByShift(filtered, shifts);
    return shifts.map(s => {
      const entry = groups.get(s.id);
      const m = aggregate(entry?.runs ?? []);
      return {
        shift: s,
        produced: m.totalProduced,
        target: m.totalTarget,
        runTime: m.runTime,
        downtime: m.downtime,
        unitsPerHour: m.unitsPerHour,
        runCount: m.runCount,
        oee: m.oee,
      };
    });
  }, [filtered, shifts]);

  const chartData = useMemo(() => perShift.map(s => ({
    name: s.shift.name,
    produced: s.produced,
    target: s.target,
    rate: Number(s.unitsPerHour.toFixed(0)),
    color: s.shift.color,
  })), [perShift]);

  const handleSaveShifts = (next: ShiftWindow[]) => {
    setShifts(next);
    saveShifts(next);
  };

  return (
    <div className="space-y-4" ref={reportRef}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-black text-foreground tracking-tight">Shift Report</h2>
          <p className="text-xs text-muted-foreground">{describeDateScope(scope)} · {shifts.length} shift{shifts.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)} className="gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            <span className="text-xs">Configure Shifts</span>
          </Button>
          <ReportDownloadMenu
            title="Shift Report"
            subtitle={describeDateScope(scope)}
            getElement={() => reportRef.current}
            runs={filtered}
            disabled={filtered.length === 0}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card p-12 text-center">
          <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">No production runs in this range.</p>
        </div>
      ) : (
        <>
          {/* Top KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={Package} label="Total Produced" value={formatNumber(total.totalProduced)} unit="units" accent="primary" />
            <KpiCard icon={Timer} label="Total Run Time" value={formatDuration(total.runTime)} accent="success" />
            <KpiCard icon={Activity} label="Avg Throughput" value={total.unitsPerHour.toFixed(0)} unit="u/hr" accent="warning" />
            <KpiCard icon={Clock} label="Shifts Tracked" value={shifts.length} accent="accent" />
          </div>

          {/* Per-shift cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {perShift.map(s => {
              const Icon = SHIFT_ICONS[s.shift.id] ?? Clock;
              const attainPct = s.target > 0 ? (s.produced / s.target) * 100 : null;
              return (
                <div
                  key={s.shift.id}
                  className="rounded-xl border border-border/40 bg-gradient-to-br from-card to-secondary/20 p-4 shadow-sm relative overflow-hidden"
                >
                  <div
                    className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-15 blur-2xl"
                    style={{ background: s.shift.color }}
                  />
                  <div className="flex items-center gap-2.5 mb-3 relative z-10">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: `${s.shift.color}22`, color: s.shift.color }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-foreground">{s.shift.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {String(s.shift.startHour).padStart(2, '0')}:00 → {String(s.shift.endHour).padStart(2, '0')}:00
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 relative z-10">
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">Produced</div>
                      <div className="text-2xl font-black text-foreground tabular-nums tracking-tight">{formatNumber(s.produced)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">Run Time</div>
                      <div className="text-2xl font-black text-foreground tabular-nums tracking-tight">{formatDuration(s.runTime)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">Throughput</div>
                      <div className="text-base font-bold text-primary tabular-nums">{s.unitsPerHour.toFixed(0)} <span className="text-[10px] font-medium text-muted-foreground">u/hr</span></div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">Runs</div>
                      <div className="text-base font-bold text-foreground tabular-nums">{s.runCount}</div>
                    </div>
                  </div>

                  {attainPct !== null && (
                    <div className="mt-3 relative z-10">
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-muted-foreground font-semibold">Target Attainment</span>
                        <span className={`font-bold ${attainPct >= 100 ? 'text-success' : attainPct >= 80 ? 'text-warning' : 'text-destructive'}`}>
                          {attainPct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(100, attainPct)}%`,
                            background: attainPct >= 100 ? 'hsl(var(--success))' : s.shift.color,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Comparison chart */}
          <ChartShell title="Shift Comparison" subtitle="Production vs target per shift" icon={Clock}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '10px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="target" fill="hsl(var(--muted))" radius={[6, 6, 0, 0]} barSize={32} name="Target" />
                <Bar dataKey="produced" radius={[6, 6, 0, 0]} barSize={32} name="Produced">
                  {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartShell>
        </>
      )}

      <ShiftSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        shifts={shifts}
        onSave={handleSaveShifts}
      />
    </div>
  );
}

function ShiftSettingsDialog({
  open, onOpenChange, shifts, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shifts: ShiftWindow[];
  onSave: (s: ShiftWindow[]) => void;
}) {
  const [draft, setDraft] = useState<ShiftWindow[]>(shifts);

  const update = (id: string, updates: Partial<ShiftWindow>) => {
    setDraft(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  return (
    <Dialog open={open} onOpenChange={o => { setDraft(shifts); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Configure Shift Windows
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {draft.map(s => (
            <div key={s.id} className="rounded-lg border border-border/40 bg-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                <Input
                  value={s.name}
                  onChange={e => update(s.id, { name: e.target.value })}
                  className="h-8 text-sm font-semibold flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground w-12">Start</label>
                <Input
                  type="number"
                  min={0} max={23}
                  value={s.startHour}
                  onChange={e => update(s.id, { startHour: Math.max(0, Math.min(23, Number(e.target.value))) })}
                  className="h-8 w-20 text-sm tabular-nums"
                />
                <span className="text-xs text-muted-foreground">:00</span>
                <span className="text-xs text-muted-foreground mx-2">→</span>
                <label className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground w-8">End</label>
                <Input
                  type="number"
                  min={0} max={23}
                  value={s.endHour}
                  onChange={e => update(s.id, { endHour: Math.max(0, Math.min(23, Number(e.target.value))) })}
                  className="h-8 w-20 text-sm tabular-nums"
                />
                <span className="text-xs text-muted-foreground">:00</span>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => { onSave(draft); onOpenChange(false); }}
            className="industrial-button text-white border-0"
          >
            Save Shifts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
