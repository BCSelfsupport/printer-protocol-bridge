import { forwardRef, useMemo, useState } from 'react';
import { Clock, Settings2, Sun, Sunset, Moon } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { ProductionRun } from '@/types/production';
import type { Printer } from '@/types/printer';
import type { ReportTimeScope, ReportShift } from '@/types/reportTemplates';
import { DEFAULT_SHIFTS } from '@/types/reportTemplates';
import {
  resolveScope, filterRuns, groupByShift, aggregate, formatDuration,
} from '@/lib/reportAggregation';

interface Props {
  runs: ProductionRun[];
  printers: Printer[];
  scope: ReportTimeScope;
}

const SHIFT_ICONS: Record<string, React.ElementType> = {
  day: Sun,
  swing: Sunset,
  night: Moon,
};

const STORAGE_KEY = 'codesync-shift-config';

function loadShifts(): ReportShift[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {/* ignore */}
  return DEFAULT_SHIFTS;
}

function saveShifts(shifts: ReportShift[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shifts));
  } catch {/* ignore */}
}

export const ShiftReport = forwardRef<HTMLDivElement, Props>(({ runs, scope }, ref) => {
  const [shifts, setShifts] = useState<ReportShift[]>(() => loadShifts());
  const [editOpen, setEditOpen] = useState(false);

  const range = useMemo(() => resolveScope(scope), [scope]);
  const filtered = useMemo(() => filterRuns(runs, range, scope.printerIds), [runs, range, scope.printerIds]);
  const grouped = useMemo(() => groupByShift(filtered, shifts), [filtered, shifts]);

  const shiftStats = shifts.map(s => {
    const rs = grouped.get(s.id) ?? [];
    const agg = aggregate(rs);
    return { shift: s, ...agg };
  });

  const chartData = shiftStats.map(s => ({
    name: s.shift.name,
    Produced: s.produced,
    Target: s.target,
    OEE: Number(s.oee.toFixed(1)),
  }));

  return (
    <div ref={ref} className="space-y-4 bg-background p-1">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Shifts: {shifts.map(s => `${s.name} ${String(s.startHour).padStart(2, '0')}:00–${String(s.endHour).padStart(2, '0')}:00`).join(' · ')}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
          <Settings2 className="w-3.5 h-3.5 mr-1" /> Configure Shifts
        </Button>
      </div>

      {/* Per-shift KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {shiftStats.map(s => {
          const Icon = SHIFT_ICONS[s.shift.id] ?? Clock;
          return (
            <div key={s.shift.id} className="rounded-2xl border bg-gradient-to-br from-primary/5 to-transparent p-4 md:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-base font-black text-foreground">{s.shift.name}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    {String(s.shift.startHour).padStart(2, '0')}:00 – {String(s.shift.endHour).padStart(2, '0')}:00
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-secondary/40 rounded-lg p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Produced</div>
                  <div className="text-xl font-black text-foreground tabular-nums">{s.produced.toLocaleString()}</div>
                </div>
                <div className="bg-secondary/40 rounded-lg p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Target</div>
                  <div className="text-xl font-black text-foreground tabular-nums">{s.target.toLocaleString()}</div>
                </div>
                <div className="bg-secondary/40 rounded-lg p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Run Time</div>
                  <div className="text-sm font-bold text-foreground">{formatDuration(s.runTime)}</div>
                </div>
                <div className="bg-secondary/40 rounded-lg p-2.5">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">OEE</div>
                  <div className="text-sm font-bold text-foreground">{s.oee.toFixed(1)}%</div>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground font-medium">
                {s.runCount} runs · {s.unitsPerHour.toFixed(0)} u/h
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison chart */}
      <div className="rounded-2xl border bg-card p-4 md:p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm md:text-base font-bold text-foreground">Shift Comparison</h3>
        </div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Target" fill="hsl(var(--muted))" radius={[6, 6, 0, 0]} barSize={32} />
              <Bar dataKey="Produced" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <ShiftConfigDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        shifts={shifts}
        onSave={(s) => { setShifts(s); saveShifts(s); setEditOpen(false); }}
      />
    </div>
  );
});
ShiftReport.displayName = 'ShiftReport';

function ShiftConfigDialog({ open, onOpenChange, shifts, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  shifts: ReportShift[]; onSave: (s: ReportShift[]) => void;
}) {
  const [draft, setDraft] = useState<ReportShift[]>(shifts);

  // sync when reopened
  useMemo(() => { if (open) setDraft(shifts); }, [open, shifts]);

  const update = (i: number, patch: Partial<ReportShift>) => {
    setDraft(d => d.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Configure Shifts</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {draft.map((s, i) => (
            <div key={s.id} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <Label className="text-xs">Name</Label>
                <Input className="mt-1 h-9" value={s.name} onChange={e => update(i, { name: e.target.value })} />
              </div>
              <div className="col-span-3">
                <Label className="text-xs">Start (h)</Label>
                <Input className="mt-1 h-9" type="number" min={0} max={23}
                  value={s.startHour} onChange={e => update(i, { startHour: Math.max(0, Math.min(23, Number(e.target.value))) })} />
              </div>
              <div className="col-span-3">
                <Label className="text-xs">End (h)</Label>
                <Input className="mt-1 h-9" type="number" min={0} max={23}
                  value={s.endHour} onChange={e => update(i, { endHour: Math.max(0, Math.min(23, Number(e.target.value))) })} />
              </div>
              <div className="col-span-1 text-center">
                <span className="text-[10px] text-muted-foreground">{s.endHour < s.startHour ? '↻' : ''}</span>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Tip: end-hour less than start-hour means the shift wraps midnight (e.g. 22 → 6).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(draft)} className="industrial-button text-white border-0">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
