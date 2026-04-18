/**
 * Report templates: configuration types for the customizable production report builder.
 */

export type ReportType = 'oee' | 'production-summary' | 'shift' | 'custom';

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'last-week'
  | 'last-7'
  | 'last-30'
  | 'last-90'
  | 'this-month'
  | 'last-month'
  | 'all-time'
  | 'custom';

export type GroupByBucket = 'day' | 'week' | 'month';

export interface DateScope {
  preset: DateRangePreset;
  /** epoch ms — only honored when preset === 'custom' */
  start?: number;
  /** epoch ms — only honored when preset === 'custom' */
  end?: number;
  bucket: GroupByBucket;
  /** null = all printers */
  printerIds: number[] | null;
}

export interface ShiftWindow {
  id: string;
  name: string;
  /** 0-23 */
  startHour: number;
  /** 0-23, exclusive (handles wrap, e.g. 22 → 6) */
  endHour: number;
  color: string;
}

export const DEFAULT_SHIFTS: ShiftWindow[] = [
  { id: 'day', name: 'Day', startHour: 6, endHour: 14, color: 'hsl(var(--warning))' },
  { id: 'swing', name: 'Swing', startHour: 14, endHour: 22, color: 'hsl(var(--primary))' },
  { id: 'night', name: 'Night', startHour: 22, endHour: 6, color: 'hsl(var(--industrial-dark))' },
];

export type CustomMetric =
  | 'totalProduced'
  | 'totalTarget'
  | 'attainmentPct'
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

export type CustomGrouping = 'printer' | 'shift' | 'day' | 'week' | 'message' | 'combined';

export type CustomVisualization =
  | 'kpiCards'
  | 'productionTrend'
  | 'downtimePareto'
  | 'oeeTrend'
  | 'shiftComparison'
  | 'messageBreakdown'
  | 'hourlyHeatmap';

export interface CustomReportConfig {
  metrics: CustomMetric[];
  grouping: CustomGrouping;
  visualizations: CustomVisualization[];
  /** Optional message-name filter; empty = all */
  messageFilter: string[];
  /** Optional downtime-reason filter; empty = all */
  downtimeReasonFilter: string[];
}

export const DEFAULT_CUSTOM_CONFIG: CustomReportConfig = {
  metrics: ['totalProduced', 'runTime', 'downtime', 'unitsPerHour', 'oee'],
  grouping: 'printer',
  visualizations: ['kpiCards', 'productionTrend', 'downtimePareto'],
  messageFilter: [],
  downtimeReasonFilter: [],
};

export interface SavedReportTemplate {
  id: string;
  name: string;
  config: CustomReportConfig;
  scope: DateScope;
  createdAt: number;
  updatedAt: number;
}

export const METRIC_LABELS: Record<CustomMetric, string> = {
  totalProduced: 'Total Produced',
  totalTarget: 'Total Target',
  attainmentPct: 'Target Attainment %',
  runTime: 'Run Time',
  downtime: 'Downtime',
  downtimeByReason: 'Downtime by Reason',
  unitsPerHour: 'Units / Hour',
  oee: 'OEE %',
  availability: 'Availability %',
  performance: 'Performance %',
  runCount: 'Run Count',
  avgRunDuration: 'Avg Run Duration',
  topMessages: 'Top Messages',
};

export const VISUALIZATION_LABELS: Record<CustomVisualization, string> = {
  kpiCards: 'KPI Summary Cards',
  productionTrend: 'Production Trend Line',
  downtimePareto: 'Downtime Pareto Chart',
  oeeTrend: 'OEE Trend Line',
  shiftComparison: 'Shift Comparison Bars',
  messageBreakdown: 'Message Breakdown Pie',
  hourlyHeatmap: 'Hourly Production Heatmap',
};

export const GROUPING_LABELS: Record<CustomGrouping, string> = {
  printer: 'Per Printer',
  shift: 'Per Shift',
  day: 'Per Day',
  week: 'Per Week',
  message: 'Per Message',
  combined: 'Combined Total',
};
