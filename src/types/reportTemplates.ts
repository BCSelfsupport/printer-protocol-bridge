/**
 * Custom report template definitions.
 * Persisted in IndexedDB via useReportTemplates hook.
 */

export type ReportMetricKey =
  | 'produced'
  | 'target'
  | 'attainment'
  | 'runTime'
  | 'downtime'
  | 'downtimeByReason'
  | 'unitsPerHour'
  | 'oee'
  | 'availability'
  | 'performance'
  | 'runCount'
  | 'avgRunDuration'
  | 'topMessages';

export type ReportGroupBy =
  | 'printer'
  | 'shift'
  | 'day'
  | 'week'
  | 'month'
  | 'message';

export type ReportVisualization =
  | 'kpiCards'
  | 'productionTrend'
  | 'downtimePareto'
  | 'oeeTrend'
  | 'shiftComparison'
  | 'messagePie'
  | 'hourlyHeatmap';

export interface ReportShift {
  id: string;
  name: string;
  startHour: number; // 0-23
  endHour: number;   // 0-23 (can be < startHour to wrap midnight)
}

export const DEFAULT_SHIFTS: ReportShift[] = [
  { id: 'day', name: 'Day', startHour: 6, endHour: 14 },
  { id: 'swing', name: 'Swing', startHour: 14, endHour: 22 },
  { id: 'night', name: 'Night', startHour: 22, endHour: 6 },
];

export interface ReportTimeScope {
  /** Quick preset key, or 'custom' for custom range */
  preset:
    | 'today'
    | 'yesterday'
    | 'thisWeek'
    | 'last7'
    | 'last30'
    | 'last90'
    | 'thisMonth'
    | 'lastMonth'
    | 'custom';
  customStart?: number; // epoch ms
  customEnd?: number;   // epoch ms
  /** Bucket size for trend charts */
  bucket: 'day' | 'week' | 'month';
  /** All printers if empty */
  printerIds: number[];
}

export interface CustomReportTemplate {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  metrics: ReportMetricKey[];
  groupBy: ReportGroupBy[];
  visualizations: ReportVisualization[];
  scope: ReportTimeScope;
  /** Optional message-name filter (substring match) */
  messageFilter?: string;
  /** Optional downtime reason filter; empty = all */
  downtimeReasons?: string[];
}

export const ALL_METRICS: { key: ReportMetricKey; label: string; description: string }[] = [
  { key: 'produced', label: 'Produced', description: 'Total units actually produced' },
  { key: 'target', label: 'Target', description: 'Total target count' },
  { key: 'attainment', label: 'Attainment %', description: 'Produced / Target' },
  { key: 'runTime', label: 'Run Time', description: 'Total productive run time' },
  { key: 'downtime', label: 'Downtime', description: 'Total downtime duration' },
  { key: 'downtimeByReason', label: 'Downtime by Reason', description: 'Pareto of downtime reasons' },
  { key: 'unitsPerHour', label: 'Units / Hour', description: 'Average production rate' },
  { key: 'oee', label: 'OEE', description: 'Overall Equipment Effectiveness' },
  { key: 'availability', label: 'Availability', description: 'Run time / planned time' },
  { key: 'performance', label: 'Performance', description: 'Actual / target' },
  { key: 'runCount', label: 'Run Count', description: 'Number of runs in period' },
  { key: 'avgRunDuration', label: 'Avg Run Duration', description: 'Mean run length' },
  { key: 'topMessages', label: 'Top Messages', description: 'Most-produced products' },
];

export const ALL_VISUALIZATIONS: { key: ReportVisualization; label: string }[] = [
  { key: 'kpiCards', label: 'KPI Cards' },
  { key: 'productionTrend', label: 'Production Trend' },
  { key: 'downtimePareto', label: 'Downtime Pareto' },
  { key: 'oeeTrend', label: 'OEE Trend' },
  { key: 'shiftComparison', label: 'Shift Comparison' },
  { key: 'messagePie', label: 'Message Breakdown' },
  { key: 'hourlyHeatmap', label: 'Hourly Heatmap' },
];

export const DEFAULT_SCOPE: ReportTimeScope = {
  preset: 'last7',
  bucket: 'day',
  printerIds: [],
};
