/**
 * Consumption history tracker for predictive ordering.
 *
 * Logs every auto-deduction event with a timestamp and calculates
 * rolling burn rates (bottles per month) per consumable.
 * Predicts depletion dates and suggests reorder quantities.
 */

const HISTORY_KEY = 'codesync-consumption-history';
const FILTER_KEY = 'codesync-filter-config';

// ── Event log ──

export interface ConsumptionEvent {
  /** ISO timestamp */
  timestamp: string;
  /** Consumable ID */
  consumableId: string;
  /** Printer that triggered the deduction */
  printerId: number;
  /** Type of consumable */
  type: 'ink' | 'makeup';
  /** Quantity deducted (usually 1) */
  qty: number;
}

function loadHistory(): ConsumptionEvent[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(events: ConsumptionEvent[]) {
  try {
    // Keep last 12 months max to prevent unbounded growth
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    const trimmed = events.filter(e => new Date(e.timestamp) >= cutoff);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('[consumptionTracker] save failed:', e);
  }
}

/** Record a consumption event (call when auto-deducting stock). */
export function logConsumption(event: Omit<ConsumptionEvent, 'timestamp'>) {
  const history = loadHistory();
  history.push({ ...event, timestamp: new Date().toISOString() });
  saveHistory(history);
}

// ── Burn rate calculation ──

export interface BurnRate {
  consumableId: string;
  /** Bottles per 30-day period */
  bottlesPerMonth: number;
  /** Number of events used in calculation */
  sampleSize: number;
  /** Earliest event in window */
  firstEvent: string;
  /** Latest event in window */
  lastEvent: string;
}

/**
 * Calculate burn rate for a specific consumable.
 * Uses all events in the last `windowMonths` months (default 3).
 */
export function getBurnRate(consumableId: string, windowMonths = 3): BurnRate | null {
  const history = loadHistory();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - windowMonths);

  const events = history
    .filter(e => e.consumableId === consumableId && new Date(e.timestamp) >= cutoff)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (events.length < 2) return null;

  const first = new Date(events[0].timestamp);
  const last = new Date(events[events.length - 1].timestamp);
  const spanDays = Math.max(1, (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
  const totalQty = events.reduce((sum, e) => sum + e.qty, 0);
  const bottlesPerMonth = (totalQty / spanDays) * 30;

  return {
    consumableId,
    bottlesPerMonth,
    sampleSize: events.length,
    firstEvent: events[0].timestamp,
    lastEvent: events[events.length - 1].timestamp,
  };
}

/**
 * Get burn rate for a specific printer + consumable type.
 */
export function getPrinterBurnRate(printerId: number, type: 'ink' | 'makeup', windowMonths = 3): number | null {
  const history = loadHistory();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - windowMonths);

  const events = history
    .filter(e => e.printerId === printerId && e.type === type && new Date(e.timestamp) >= cutoff)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (events.length < 2) return null;

  const first = new Date(events[0].timestamp);
  const last = new Date(events[events.length - 1].timestamp);
  const spanDays = Math.max(1, (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
  const totalQty = events.reduce((sum, e) => sum + e.qty, 0);
  return (totalQty / spanDays) * 30;
}

// ── Predictions ──

export interface DepletionPrediction {
  consumableId: string;
  currentStock: number;
  burnRate: BurnRate;
  /** Days until stock reaches 0 */
  daysUntilEmpty: number;
  /** Days until stock reaches minimum (reorder point) */
  daysUntilReorder: number | null;
  /** Recommended stock (2 months of consumption) */
  recommendedStock: number;
  /** How many to order to reach recommended level */
  suggestedOrderQty: number;
  /** Human-readable depletion timeframe */
  depletionLabel: string;
}

export function getDepletionPrediction(
  consumableId: string,
  currentStock: number,
  minimumStock: number,
): DepletionPrediction | null {
  const burnRate = getBurnRate(consumableId);
  if (!burnRate || burnRate.bottlesPerMonth <= 0) return null;

  const dailyRate = burnRate.bottlesPerMonth / 30;
  const daysUntilEmpty = Math.max(0, Math.round(currentStock / dailyRate));
  const daysUntilReorder = currentStock > minimumStock
    ? Math.round((currentStock - minimumStock) / dailyRate)
    : 0;
  const recommendedStock = Math.ceil(burnRate.bottlesPerMonth * 2); // 2 months
  const suggestedOrderQty = Math.max(0, recommendedStock - currentStock);

  return {
    consumableId,
    currentStock,
    burnRate,
    daysUntilEmpty,
    daysUntilReorder: currentStock > minimumStock ? daysUntilReorder : null,
    recommendedStock,
    suggestedOrderQty,
    depletionLabel: formatDuration(daysUntilEmpty),
  };
}

/**
 * Aggregate prediction: how long will total stock of a type (ink/makeup) last
 * across all printers, given total burn rate.
 */
export function getAggregateDepletionDays(
  consumableIds: string[],
  stockByConsumable: Record<string, number>,
): number | null {
  let totalStock = 0;
  let totalDailyRate = 0;

  for (const id of consumableIds) {
    totalStock += stockByConsumable[id] ?? 0;
    const rate = getBurnRate(id);
    if (rate) totalDailyRate += rate.bottlesPerMonth / 30;
  }

  if (totalDailyRate <= 0) return null;
  return Math.round(totalStock / totalDailyRate);
}

// ── Helpers ──

export function formatDuration(days: number): string {
  if (days <= 0) return 'Now';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function formatDurationLong(days: number): string {
  if (days <= 0) return 'Depleted';
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  if (days < 14) return '1 week';
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  if (days < 60) return '1 month';
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

/** Get all consumption events (for debugging or detailed views). */
export function getConsumptionHistory(): ConsumptionEvent[] {
  return loadHistory();
}

/** Clear all consumption history. */
export function clearConsumptionHistory() {
  localStorage.removeItem(HISTORY_KEY);
}
