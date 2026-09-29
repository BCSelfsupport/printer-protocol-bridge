import { supabase } from '@/integrations/supabase/client';
import type { Printer } from '@/types/printer';

/** Job lookup configuration — which data source/column the sheet barcode maps to. */
export interface CableJobConfig {
  dataSourceId: string | null;
  /** Column whose value equals the job ID printed on the production sheet. */
  idColumn: string | null;
  /** Optional column naming the message to use; falls back to defaultMessage. */
  messageColumn: string | null;
  defaultMessage: string | null;
  /** Per-message mapping: column name -> 1-based field numbers. */
  mappings: Record<string, Record<string, number[]>>;
  requireConfirm: boolean;
  resetCountersOnJob: boolean;
  /** Length marking: set Custom Counter 1 to the start value on job load. */
  lengthStart: number;
  seedLengthCounter: boolean;
  operator: string;
}

export const DEFAULT_JOB_CONFIG: CableJobConfig = {
  dataSourceId: null,
  idColumn: null,
  messageColumn: null,
  defaultMessage: null,
  mappings: {},
  requireConfirm: true,
  resetCountersOnJob: true,
  lengthStart: 0,
  seedLengthCounter: false,
  operator: '',
};

const KEY = 'wirecable-job-config';

export function loadJobConfig(): CableJobConfig {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_JOB_CONFIG, ...JSON.parse(raw) } : DEFAULT_JOB_CONFIG;
  } catch {
    return DEFAULT_JOB_CONFIG;
  }
}
export function saveJobConfig(c: CableJobConfig) {
  localStorage.setItem(KEY, JSON.stringify(c));
}

export interface ResolvedJob {
  jobCode: string;
  messageName: string;
  values: Record<string, string>;
}

export type LookupResult =
  | { ok: true; job: ResolvedJob }
  | { ok: false; reason: string };

/** Look up a scanned sheet code in the configured job table. */
export async function lookupJob(code: string, cfg: CableJobConfig): Promise<LookupResult> {
  if (!cfg.dataSourceId || !cfg.idColumn) {
    return { ok: false, reason: 'Job table not set up — open the Job Setup tab.' };
  }
  const trimmed = code.trim();
  const { data, error } = await supabase
    .from('data_source_rows')
    .select('values')
    .eq('data_source_id', cfg.dataSourceId)
    .filter(`values->>${cfg.idColumn}`, 'eq', trimmed)
    .limit(2);
  if (error) return { ok: false, reason: error.message };
  let rows = data ?? [];
  if (rows.length === 0) {
    // Case-insensitive fallback (scanners sometimes send lowercase)
    const { data: ci } = await supabase
      .from('data_source_rows')
      .select('values')
      .eq('data_source_id', cfg.dataSourceId)
      .filter(`values->>${cfg.idColumn}`, 'ilike', trimmed)
      .limit(2);
    rows = ci ?? [];
  }
  if (rows.length === 0) return { ok: false, reason: `Job "${trimmed}" not found` };
  if (rows.length > 1) return { ok: false, reason: `More than one job matches "${trimmed}"` };
  const values = Object.fromEntries(
    Object.entries((rows[0].values ?? {}) as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v)]),
  );
  const messageName = (cfg.messageColumn && values[cfg.messageColumn]?.trim()) || cfg.defaultMessage || '';
  if (!messageName) return { ok: false, reason: 'No message set for this job.' };
  return { ok: true, job: { jobCode: trimmed, messageName: messageName.toUpperCase(), values } };
}

/** Apply a job row's values onto message fields using the column→field mapping. */
export function applyJobToFields<F extends { data: string; type?: string }>(
  fields: F[],
  mapping: Record<string, number[]> | undefined,
  values: Record<string, string>,
): F[] {
  if (!mapping) return fields;
  return fields.map((f, idx) => {
    const num = idx + 1;
    const col = Object.entries(mapping).find(([, nums]) => nums.includes(num))?.[0];
    if (!col) return f;
    const v = values[col] ?? '';
    if (f.type === 'barcode') {
      const prefix = f.data.match(/^(\[[^\]]+\])\s*/)?.[1] ?? '[QR]';
      return { ...f, data: `${prefix} ${v}` };
    }
    return { ...f, data: v };
  });
}

/** Match a scanned value to a printer label: "P3", "PRINTER 3", printer name, or IP. */
export function matchPrinterScan(code: string, printers: Printer[]): Printer | null {
  const c = code.trim().toUpperCase();
  const m = c.match(/^(?:P|PRN|PRINTER)[\s\-_:]*(\d+)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    return printers.find((p) => p.name.trim().toUpperCase() === `PRINTER ${n}`) ?? printers.find((p) => p.id === n) ?? null;
  }
  return printers.find((p) => p.name.trim().toUpperCase() === c || p.ipAddress === code.trim()) ?? null;
}

// ── Job log ─────────────────────────────────────────────────────────────
export interface CableJobLogRow {
  id: string;
  job_code: string;
  message_name: string;
  printer_id: number;
  printer_name: string | null;
  operator: string | null;
  unit: string;
  length_printed: number;
  print_count: number;
  status: string;
  error_message: string | null;
  started_at: string;
  ended_at: string | null;
  field_values: Record<string, string>;
}

export async function logJobStart(entry: {
  job_code: string; message_name: string; printer_id: number; printer_name: string;
  operator: string; data_source_id: string | null; field_values: Record<string, string>;
  unit: string; status: 'sent' | 'failed'; error_message?: string | null;
}): Promise<string | null> {
  const { data, error } = await supabase.from('cable_job_log').insert(entry).select('id').single();
  if (error) { console.warn('[cable_job_log] insert failed', error); return null; }
  return data.id;
}

export async function logJobEnd(id: string, lengthPrinted: number, printCount: number) {
  await supabase.from('cable_job_log').update({
    length_printed: lengthPrinted, print_count: printCount, ended_at: new Date().toISOString(), status: 'completed',
  }).eq('id', id);
}

export async function listJobLog(limit = 200): Promise<CableJobLogRow[]> {
  const { data } = await supabase.from('cable_job_log').select('*').order('started_at', { ascending: false }).limit(limit);
  return (data ?? []) as unknown as CableJobLogRow[];
}

export function jobLogToCsv(rows: CableJobLogRow[]): string {
  const head = ['Started', 'Ended', 'Job', 'Message', 'Printer', 'Operator', 'Length', 'Unit', 'Prints', 'Status'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [head.join(','), ...rows.map((r) => [
    r.started_at, r.ended_at ?? '', r.job_code, r.message_name, r.printer_name ?? r.printer_id,
    r.operator ?? '', r.length_printed, r.unit, r.print_count, r.status,
  ].map(esc).join(','))].join('\n');
}
