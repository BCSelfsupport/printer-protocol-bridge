/**
 * Pure aggregation utilities for production reports.
 * No React, no IO — just data → metrics.
 */

import type { ProductionRun, OEEMetrics } from '@/types/production';
import { calculateOEE } from '@/types/production';
import type { ReportShift, ReportTimeScope } from '@/types/reportTemplates';

export interface ResolvedRange {
  start: number;
  end: number;
  label: string;
}

export function resolveScope(scope: ReportTimeScope, now = Date.now()): ResolvedRange {
  const d = new Date(now);
  const startOfDay = (date: Date) => {
    const x = new Date(date);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const endOfDay = (date: Date) => {
    const x = new Date(date);
    x.setHours(23, 59, 59, 999);
    return x.getTime();
  };

  switch (scope.preset) {
    case 'today':
      return { start: startOfDay(d), end: endOfDay(d), label: 'Today' };
    case 'yesterday': {
      const y = new Date(d);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y), label: 'Yesterday' };
    }
    case 'thisWeek': {
      const w = new Date(d);
      const diff = (w.getDay() + 6) % 7; // Mon-start
      w.setDate(w.getDate() - diff);
      return { start: startOfDay(w), end: endOfDay(d), label: 'This Week' };
    }
    case 'last7':
      return { start: now - 7 * 86_400_000, end: now, label: 'Last 7 Days' };
    case 'last30':
      return { start: now - 30 * 86_400_000, end: now, label: 'Last 30 Days' };
    case 'last90':
      return { start: now - 90 * 86_400_000, end: now, label: 'Last 90 Days' };
    case 'thisMonth': {
      const m = new Date(d.getFullYear(), d.getMonth(), 1);
      return { start: m.getTime(), end: endOfDay(d), label: 'This Month' };
    }
    case 'lastMonth': {
      const ms = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const me = new Date(d.getFullYear(), d.getMonth(), 0);
      return { start: ms.getTime(), end: endOfDay(me), label: 'Last Month' };
    }
    case 'custom':
      return {
        start: scope.customStart ?? now - 7 * 86_400_000,
        end: scope.customEnd ?? now,
        label: 'Custom Range',
      };
  }
}

/** Filter runs to those overlapping the range and matching printer filter. */
export function filterRuns(
  runs: ProductionRun[],
  range: ResolvedRange,
  printerIds: number[]
): ProductionRun[] {
  return runs.filter(r => {
    const end = r.endTime ?? Date.now();
    const overlaps = end >= range.start && r.startTime <= range.end;
    const printerMatch = printerIds.length === 0 || printerIds.includes(r.printerId);
    return overlaps && printerMatch;
  });
}

export interface AggregateSummary {
  produced: number;
  target: number;
  attainment: number; // 0-100
  runTime: number; // ms
  downtime: number; // ms
  unitsPerHour: number;
  oee: number;
  availability: number;
  performance: number;
  runCount: number;
  avgRunDuration: number; // ms
}

export function aggregate(runs: ProductionRun[]): AggregateSummary {
  if (runs.length === 0) {
    return {
      produced: 0, target: 0, attainment: 0,
      runTime: 0, downtime: 0, unitsPerHour: 0,
      oee: 0, availability: 0, performance: 0,
      runCount: 0, avgRunDuration: 0,
    };
  }

  const oees = runs.map(r => calculateOEE(r));
  const produced = runs.reduce((s, r) => s + r.actualCount, 0);
  const target = runs.reduce((s, r) => s + r.targetCount, 0);
  const runTime = oees.reduce((s, o) => s + o.runTime, 0);
  const downtime = oees.reduce((s, o) => s + o.totalDowntime, 0);
  const totalDuration = oees.reduce(
    (s, r) => s + ((runs.find(x => x === undefined) ? 0 : 0) + r.plannedTime),
    0
  );
  const completed = oees.filter((_, i) => runs[i].endTime !== null);
  const source = completed.length > 0 ? completed : oees;
  const avg = (field: keyof OEEMetrics) =>
    source.reduce((s, o) => s + (o[field] as number), 0) / source.length;

  return {
    produced,
    target,
    attainment: target > 0 ? (produced / target) * 100 : 0,
    runTime,
    downtime,
    unitsPerHour: runTime > 0 ? (produced / (runTime / 3_600_000)) : 0,
    oee: avg('oee'),
    availability: avg('availability'),
    performance: avg('performance'),
    runCount: runs.length,
    avgRunDuration: totalDuration / runs.length,
  };
}

/** Bucket runs by day/week/month and return time-series. */
export interface TimeBucket {
  key: string;       // e.g. "2024-01-15"
  start: number;     // ms
  label: string;     // human label
  produced: number;
  target: number;
  runTime: number;
  downtime: number;
  oee: number;
  runCount: number;
}

function bucketKey(ts: number, bucket: 'day' | 'week' | 'month'): { key: string; start: number; label: string } {
  const d = new Date(ts);
  if (bucket === 'day') {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return { key: k, start, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
  }
  if (bucket === 'week') {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const k = `W-${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
    return { key: k, start: monday.getTime(), label: `Wk of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` };
  }
  // month
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return { key: k, start, label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) };
}

export function bucketRuns(
  runs: ProductionRun[],
  bucket: 'day' | 'week' | 'month'
): TimeBucket[] {
  const map = new Map<string, TimeBucket>();
  for (const run of runs) {
    const oee = calculateOEE(run);
    const { key, start, label } = bucketKey(run.startTime, bucket);
    const existing = map.get(key);
    if (existing) {
      existing.produced += run.actualCount;
      existing.target += run.targetCount;
      existing.runTime += oee.runTime;
      existing.downtime += oee.totalDowntime;
      existing.oee = (existing.oee * existing.runCount + oee.oee) / (existing.runCount + 1);
      existing.runCount += 1;
    } else {
      map.set(key, {
        key, start, label,
        produced: run.actualCount,
        target: run.targetCount,
        runTime: oee.runTime,
        downtime: oee.totalDowntime,
        oee: oee.oee,
        runCount: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.start - b.start);
}

/** Group runs by printer */
export function groupByPrinter(runs: ProductionRun[]): Map<number, ProductionRun[]> {
  const map = new Map<number, ProductionRun[]>();
  for (const r of runs) {
    const list = map.get(r.printerId) ?? [];
    list.push(r);
    map.set(r.printerId, list);
  }
  return map;
}

/** Group runs by message name */
export function groupByMessage(runs: ProductionRun[]): Map<string, ProductionRun[]> {
  const map = new Map<string, ProductionRun[]>();
  for (const r of runs) {
    const list = map.get(r.messageName) ?? [];
    list.push(r);
    map.set(r.messageName, list);
  }
  return map;
}

/** Determine which shift a timestamp falls into */
export function shiftForTime(ts: number, shifts: ReportShift[]): ReportShift | null {
  const hour = new Date(ts).getHours();
  for (const s of shifts) {
    if (s.startHour < s.endHour) {
      if (hour >= s.startHour && hour < s.endHour) return s;
    } else {
      // Wraps midnight
      if (hour >= s.startHour || hour < s.endHour) return s;
    }
  }
  return null;
}

/** Group runs by shift (uses run start time) */
export function groupByShift(
  runs: ProductionRun[],
  shifts: ReportShift[]
): Map<string, ProductionRun[]> {
  const map = new Map<string, ProductionRun[]>();
  for (const r of runs) {
    const s = shiftForTime(r.startTime, shifts);
    if (!s) continue;
    const list = map.get(s.id) ?? [];
    list.push(r);
    map.set(s.id, list);
  }
  return map;
}

/** Aggregate downtime events by reason. */
export interface DowntimeReasonBucket {
  reason: string;
  totalMs: number;
  count: number;
}

export function downtimeByReason(runs: ProductionRun[]): DowntimeReasonBucket[] {
  const map = new Map<string, DowntimeReasonBucket>();
  const now = Date.now();
  for (const run of runs) {
    for (const evt of run.downtimeEvents) {
      const ms = (evt.endTime ?? now) - evt.startTime;
      const existing = map.get(evt.reason);
      if (existing) {
        existing.totalMs += ms;
        existing.count += 1;
      } else {
        map.set(evt.reason, { reason: evt.reason, totalMs: ms, count: 1 });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalMs - a.totalMs);
}

/** Top N messages by produced count */
export interface MessageBucket {
  messageName: string;
  produced: number;
  target: number;
  runCount: number;
}

export function topMessages(runs: ProductionRun[], limit = 10): MessageBucket[] {
  const grouped = groupByMessage(runs);
  const list: MessageBucket[] = [];
  for (const [name, rs] of grouped) {
    list.push({
      messageName: name,
      produced: rs.reduce((s, r) => s + r.actualCount, 0),
      target: rs.reduce((s, r) => s + r.targetCount, 0),
      runCount: rs.length,
    });
  }
  return list.sort((a, b) => b.produced - a.produced).slice(0, limit);
}

/** Hourly heatmap: rows = day-of-week, cols = hour-of-day, value = produced */
export function hourlyHeatmap(runs: ProductionRun[]): number[][] {
  // 7 rows × 24 cols
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of runs) {
    const d = new Date(r.startTime);
    const dow = (d.getDay() + 6) % 7; // Mon=0
    const hour = d.getHours();
    grid[dow][hour] += r.actualCount;
  }
  return grid;
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

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
