import type { SharedSnapshot } from './types';
import { observedMetrics } from './observedMetrics';
const readings: SharedSnapshot['metrics'] = {};
const fields: Record<number, Record<string, { at: number; value: unknown }>> = {};
const listeners = new Set<() => void>();
export function recordMasterReply(id: number, raw: string) { recordMasterValues(id, observedMetrics(raw)); }
export function recordMasterValues(id: number, values: Record<string, unknown>) {
  if (!Object.keys(values).length) return;
  fields[id] ??= {};
  for (const [key, value] of Object.entries(values)) fields[id][key] = { at: Date.now(), value };
  listeners.forEach(fn => fn());
}
export function getMasterReadings() {
  for (const [id, entries] of Object.entries(fields)) {
    const valid = Object.entries(entries).filter(([, entry]) => Date.now() - entry.at <= 15000);
    if (valid.length) readings[Number(id)] = { observedAt: Math.min(...valid.map(([, entry]) => entry.at)), values: Object.fromEntries(valid.map(([key, entry]) => [key, entry.value])) };
    else delete readings[Number(id)];
  }
  return { ...readings };
}
export function subscribeMasterReadings(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
