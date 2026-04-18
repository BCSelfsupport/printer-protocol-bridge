/**
 * Pure aggregation helpers for production reports.
 * Filter runs by date / printer, bucket by day/week/month/shift, compute metrics.
 */

import type { ProductionRun } from '@/types/production';
import { calculateOEE } from '@/types/production';
import type {
  DateScope, DateRangePreset, GroupByBucket, ShiftWindow,
} from '@/types/reportTemplates';

/* ---------- Date range resolution ---------- */

export function resolveDateRange(scope: DateScope): { start: number; end: number } {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  switch (scope.preset) {
    case 'today':
      return { start: startOfToday.getTime(), end: endOfToday.getTime() };
    case 'yesterday':
      return {
        start: startOfToday.getTime() - 24 * 60 * 60 * 1000,
        end: startOfToday.getTime(),
      };
    case 'this-week': {
      const d = new Date(startOfToday);
      const day = d.getDay(); // 0 = Sun
      d.setDate(d.getDate() - day);
      return { start: d.getTime(), end: now };
    }
    case 'last-week': {
      const d = new Date(startOfToday);
      const day = d.getDay();
      const startOfThisWeek = new Date(d);
      startOfThisWeek.setDate(d.getDate() - day);
      const startOfLastWeek = new Date(startOfThisWeek);
      startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);
      return { start: startOfLastWeek.getTime(), end: startOfThisWeek.getTime() };
    }
    case 'last-7':
      return { start: now - 7 * 24 * 60 * 60 * 1000, end: now };
    case 'last-30':
      return { start: now - 30 * 24 * 60 * 60 * 1000, end: now };
    case 'last-90':
      return { start: now - 90 * 24 * 60 * 60 * 1000, end: now };
    case 'this-month': {
      const d = new Date(startOfToday);
      d.setDate(1);
      return { start: d.getTime(), end: now };
    }
    case 'last-month': {
      const d = new Date(startOfToday);
      d.setDate(1);
      const startOfThis = d.getTime();
      d.setMonth(d.getMonth() - 1);
      return { start: d.getTime(), end: startOfThis };
    }
    case 'all-time':
      return { start: 0, end: now };
    case 'custom':
      return {
        start: scope.start ?? 0,
        end: scope.end ?? now,
      };
  }
}

export function describeDateScope(scope: DateScope): string {
  if (scope.preset === 'custom' && scope.start && scope.end) {
    return `${new Date(scope.start).toLocaleDateString()} → ${new Date(scope.end).toLocaleDateString()}`;
  }
  const labels: Record<DateRangePreset, string> = {
    'today': 'Today',
    'yesterday': 'Yesterday',
    'this-week': 'This Week',
    'last-week': 'Last Week',
    'last-7': 'Last 7 Days',
    'last-30': 'Last 30 Days',
    'last-90': 'Last 90 Days',
    'this-month': 'This Month',
    'last-month': 'Last Month',
    'all-time': 'All Time',
    'custom': 'Custom Range',
  };
  return labels[scope.preset];
}

/* ---------- Filtering ---------- */

export function filterRuns(runs: ProductionRun[], scope: DateScope): ProductionRun[] {
  const { start, end } = resolveDateRange(scope);
  return runs.filter(r => {
    if (scope.printerIds && !scope.printerIds.includes(r.printerId)) return false;
    const runEnd = r.endTime ?? Date.now();
    // Include run if it overlaps the window at all
    return runEnd >= start && r.startTime <= end;
  });
}

/* ---------- Bucketing ---------- */

export function bucketKey(ts: number, bucket: GroupByBucket): string {
  const d = new Date(ts);
  if (bucket === 'day') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (bucket === 'week') {
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  // month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function bucketLabel(key: string, bucket: GroupByBucket): string {
  if (bucket === 'day') {
    const d = new Date(key);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (bucket === 'week') return key.replace(/-W/, ' wk ');
  // month
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/* ---------- Shift assignment ---------- */

export function shiftForTimestamp(ts: number, shifts: ShiftWindow[]): ShiftWindow | null {
  const hour = new Date(ts).getHours();
  for (const s of shifts) {
    if (s.startHour === s.endHour) continue;
    if (s.startHour < s.endHour) {
      if (hour >= s.startHour && hour < s.endHour) return s;
    } else {
      // wrap (e.g. 22 → 6)
      if (hour >= s.startHour || hour < s.endHour) return s;
    }
  }
  return null;
}

/* ---------- Core metrics ---------- */

export interface AggregateMetrics {
  totalProduced: number;
  totalTarget: number;
  attainmentPct: number;
  runTime: number;        // ms
  downtime: number;       // ms
  unitsPerHour: number;
  oee: number;
  availability: number;
  performance: number;
  runCount: number;
  avgRunDuration: number; // ms
  downtimeByReason: { reason: string; ms: number }[];
  topMessages: { name: string; count: number; produced: number }[];
}

export function aggregate(runs: ProductionRun[]): AggregateMetrics {
  if (runs.length === 0) {
    return {
      totalProduced: 0, totalTarget: 0, attainmentPct: 0,
      runTime: 0, downtime: 0, unitsPerHour: 0,
      oee: 0, availability: 0, performance: 0,
      runCount: 0, avgRunDuration: 0,
      downtimeByReason: [], topMessages: [],
    };
  }

  const oees = runs.map(r => calculateOEE(r));
  const totalProduced = runs.reduce((s, r) => s + r.actualCount, 0);
  const totalTarget = runs.reduce((s, r) => s + r.targetCount, 0);
  const runTime = oees.reduce((s, o) => s + o.runTime, 0);
  const downtime = oees.reduce((s, o) => s + o.totalDowntime, 0);
  const plannedTime = oees.reduce((s, o) => s + o.plannedTime, 0);
  const completed = oees.filter((_, i) => runs[i].endTime !== null);
  const sourceForAvg = completed.length > 0 ? completed : oees;

  // downtime by reason
  const reasonMap = new Map<string, number>();
  runs.forEach(r => {
    r.downtimeEvents.forEach(e => {
      const ms = (e.endTime ?? Date.now()) - e.startTime;
      reasonMap.set(e.reason, (reasonMap.get(e.reason) ?? 0) + ms);
    });
  });
  const downtimeByReason = Array.from(reasonMap.entries())
    .map(([reason, ms]) => ({ reason, ms }))
    .sort((a, b) => b.ms - a.ms);

  // top messages
  const msgMap = new Map<string, { count: number; produced: number }>();
  runs.forEach(r => {
    const existing = msgMap.get(r.messageName) ?? { count: 0, produced: 0 };
    msgMap.set(r.messageName, {
      count: existing.count + 1,
      produced: existing.produced + r.actualCount,
    });
  });
  const topMessages = Array.from(msgMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.produced - a.produced)
    .slice(0, 10);

  const avg = (sel: (o: typeof oees[0]) => number) =>
    sourceForAvg.length > 0 ? sourceForAvg.reduce((s, o) => s + sel(o), 0) / sourceForAvg.length : 0;

  return {
    totalProduced,
    totalTarget,
    attainmentPct: totalTarget > 0 ? (totalProduced / totalTarget) * 100 : 0,
    runTime,
    downtime,
    unitsPerHour: runTime > 0 ? totalProduced / (runTime / 3600000) : 0,
    oee: avg(o => o.oee),
    availability: avg(o => o.availability),
    performance: avg(o => o.performance),
    runCount: runs.length,
    avgRunDuration: plannedTime / runs.length,
    downtimeByReason,
    topMessages,
  };
}

/* ---------- Group by helpers ---------- */

export function groupByPrinter(runs: ProductionRun[]): Map<number, ProductionRun[]> {
  const map = new Map<number, ProductionRun[]>();
  runs.forEach(r => {
    const arr = map.get(r.printerId) ?? [];
    arr.push(r);
    map.set(r.printerId, arr);
  });
  return map;
}

export function groupByShift(
  runs: ProductionRun[],
  shifts: ShiftWindow[],
): Map<string, { shift: ShiftWindow; runs: ProductionRun[] }> {
  const map = new Map<string, { shift: ShiftWindow; runs: ProductionRun[] }>();
  shifts.forEach(s => map.set(s.id, { shift: s, runs: [] }));
  runs.forEach(r => {
    const s = shiftForTimestamp(r.startTime, shifts);
    if (s) map.get(s.id)!.runs.push(r);
  });
  return map;
}

export function groupByBucket(
  runs: ProductionRun[],
  bucket: GroupByBucket,
): Map<string, ProductionRun[]> {
  const map = new Map<string, ProductionRun[]>();
  runs.forEach(r => {
    const k = bucketKey(r.startTime, bucket);
    const arr = map.get(k) ?? [];
    arr.push(r);
    map.set(k, arr);
  });
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export function groupByMessage(runs: ProductionRun[]): Map<string, ProductionRun[]> {
  const map = new Map<string, ProductionRun[]>();
  runs.forEach(r => {
    const arr = map.get(r.messageName) ?? [];
    arr.push(r);
    map.set(r.messageName, arr);
  });
  return map;
}

/* ---------- Hourly heatmap ---------- */

export interface HourlyCell {
  /** 0=Sunday … 6=Saturday */
  weekday: number;
  /** 0-23 */
  hour: number;
  produced: number;
}

export function hourlyHeatmap(runs: ProductionRun[]): HourlyCell[] {
  const cells = new Map<string, HourlyCell>();
  runs.forEach(r => {
    if (r.actualCount === 0) return;
    const startHour = new Date(r.startTime).getHours();
    const startWeekday = new Date(r.startTime).getDay();
    const k = `${startWeekday}-${startHour}`;
    const existing = cells.get(k) ?? { weekday: startWeekday, hour: startHour, produced: 0 };
    existing.produced += r.actualCount;
    cells.set(k, existing);
  });
  return Array.from(cells.values());
}

/* ---------- Formatting helpers ---------- */

export function formatDuration(ms: number): string {
  if (ms < 1000) return '0s';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export const DOWNTIME_LABELS: Record<string, string> = {
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

export function downtimeLabel(reason: string): string {
  return DOWNTIME_LABELS[reason] ?? reason;
}
