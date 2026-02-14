import { useMemo, useState, useCallback } from 'react';
import { TrendingDown, TrendingUp, Clock, Filter, AlertTriangle, Calendar, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Consumable } from '@/types/consumable';
import { Printer, PrinterMetrics } from '@/types/printer';
import {
  getDepletionPrediction,
  getAggregateDepletionDays,
  getBurnRate,
  formatDurationLong,
  DepletionPrediction,
} from '@/lib/consumptionTracker';
import {
  getFilterStatus,
  getFilterConfig,
  recordFilterInfo,
  FilterStatus,
} from '@/lib/filterTracker';

// ── Aggregate Forecast Banner ──

interface ForecastBannerProps {
  consumables: Consumable[];
}

export function ForecastBanner({ consumables }: ForecastBannerProps) {
  const inkConsumables = consumables.filter(c => c.type === 'ink');
  const makeupConsumables = consumables.filter(c => c.type === 'makeup');

  const inkIds = inkConsumables.map(c => c.id);
  const makeupIds = makeupConsumables.map(c => c.id);

  const stockMap: Record<string, number> = {};
  consumables.forEach(c => { stockMap[c.id] = c.currentStock; });

  const inkDays = getAggregateDepletionDays(inkIds, stockMap);
  const makeupDays = getAggregateDepletionDays(makeupIds, stockMap);

  // Check if we have any burn data at all
  const hasAnyData = inkDays !== null || makeupDays !== null;
  if (!hasAnyData) return null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-3 py-2 bg-muted/30 border-b flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Stock Forecast
        </span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-3">
        {inkDays !== null && (
          <ForecastCard label="Total Ink" days={inkDays} />
        )}
        {makeupDays !== null && (
          <ForecastCard label="Total Makeup" days={makeupDays} />
        )}
      </div>
    </div>
  );
}

function ForecastCard({ label, days }: { label: string; days: number }) {
  const isUrgent = days <= 30;
  const isWarning = days <= 60;

  return (
    <div className={`rounded-md border p-2.5 ${
      isUrgent ? 'border-destructive/50 bg-destructive/5' :
      isWarning ? 'border-warning/50 bg-warning/5' :
      'bg-muted/20'
    }`}>
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className={`text-lg font-bold tabular-nums ${
          isUrgent ? 'text-destructive' :
          isWarning ? 'text-warning' :
          'text-foreground'
        }`}>
          {formatDurationLong(days)}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        based on usage history
      </div>
    </div>
  );
}

// ── Per-consumable prediction badge ──

interface PredictionBadgeProps {
  consumable: Consumable;
}

export function PredictionBadge({ consumable }: PredictionBadgeProps) {
  const prediction = useMemo(
    () => getDepletionPrediction(consumable.id, consumable.currentStock, consumable.minimumStock),
    [consumable.id, consumable.currentStock, consumable.minimumStock]
  );

  if (!prediction) return null;

  const isUrgent = prediction.daysUntilEmpty <= 30;
  const isWarning = prediction.daysUntilEmpty <= 60;

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <Clock className={`w-3 h-3 ${
        isUrgent ? 'text-destructive' : isWarning ? 'text-warning' : 'text-muted-foreground'
      }`} />
      <span className={`text-[11px] font-medium ${
        isUrgent ? 'text-destructive' : isWarning ? 'text-warning' : 'text-muted-foreground'
      }`}>
        {prediction.daysUntilEmpty <= 0
          ? 'Stock depleted'
          : `~${formatDurationLong(prediction.daysUntilEmpty)} remaining`}
      </span>
      {prediction.suggestedOrderQty > 0 && (
        <span className="text-[10px] text-muted-foreground">
          · order {prediction.suggestedOrderQty}
        </span>
      )}
    </div>
  );
}

// ── Reorder suggestion (smart) ──

interface SmartReorderProps {
  consumable: Consumable;
}

export function SmartReorderSuggestion({ consumable }: SmartReorderProps) {
  const prediction = useMemo(
    () => getDepletionPrediction(consumable.id, consumable.currentStock, consumable.minimumStock),
    [consumable.id, consumable.currentStock, consumable.minimumStock]
  );

  if (!prediction) return null;

  const shouldReorder = prediction.daysUntilReorder !== null
    ? prediction.daysUntilReorder <= 30
    : prediction.daysUntilEmpty <= 30;

  if (!shouldReorder) return null;

  const reorderUnit = consumable.reorderUnit || consumable.unit;
  const perUnit = consumable.bottlesPerReorderUnit || 1;
  const hasReorderUnit = consumable.reorderUnit && consumable.reorderUnit !== consumable.unit;
  const orderInUnits = hasReorderUnit
    ? Math.max(1, Math.ceil(prediction.suggestedOrderQty / perUnit))
    : prediction.suggestedOrderQty;

  return (
    <div className="rounded-md bg-warning/10 border border-warning/30 px-2.5 py-1.5 mt-1.5">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="w-3 h-3 text-warning flex-shrink-0" />
        <span className="text-[11px] font-semibold text-warning">
          Reorder now — suggest {orderInUnits} {reorderUnit}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground">
        2-month target: {prediction.recommendedStock} {consumable.unit}
      </span>
    </div>
  );
}

// ── Filter Status on Printer Card ──

interface PrinterFilterStatusProps {
  printer: Printer;
  pumpHours?: number; // from metrics.streamHours parsed to number
}

export function PrinterFilterStatus({ printer, pumpHours }: PrinterFilterStatusProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const config = getFilterConfig(printer.id);
  const [filterLife, setFilterLife] = useState(config?.filterLifeHours?.toString() || '2000');
  const [entryPumpHours, setEntryPumpHours] = useState(pumpHours?.toFixed(1) || '0');
  const [remainingHours, setRemainingHours] = useState(config?.remainingHoursAtEntry?.toString() || '2000');
  const [, forceUpdate] = useState(0);

  const FILTER_PRESETS = [2000, 5000, 10000];

  const status = useMemo(() => {
    if (pumpHours === undefined || pumpHours === null) return null;
    return getFilterStatus(printer.id, pumpHours);
  }, [printer.id, pumpHours]);

  const handleOpenDialog = useCallback(() => {
    // Pre-fill with current pump hours if available
    setEntryPumpHours(pumpHours?.toFixed(1) || '0');
    setFilterLife(config?.filterLifeHours?.toString() || '2000');
    setRemainingHours(config?.remainingHoursAtEntry?.toString() || '2000');
    setConfigOpen(true);
  }, [pumpHours, config]);

  const handleSelectPreset = useCallback((hours: number) => {
    setFilterLife(hours.toString());
    // If remaining hasn't been customized yet, default it to the full life
    setRemainingHours(hours.toString());
  }, []);

  const handleSave = useCallback(() => {
    const life = parseFloat(filterLife) || 2000;
    const pump = parseFloat(entryPumpHours) || 0;
    const remaining = parseFloat(remainingHours) || life;
    recordFilterInfo(printer.id, pump, remaining, life);
    setConfigOpen(false);
    forceUpdate(n => n + 1);
  }, [printer.id, filterLife, entryPumpHours, remainingHours]);

  return (
    <>
      <div className="px-3 pb-2">
        {status ? (
          <div className={`rounded-md border p-2 ${
            status.status === 'critical' ? 'border-destructive/50 bg-destructive/5' :
            status.status === 'warning' ? 'border-warning/50 bg-warning/5' :
            'bg-muted/20'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Filter className={`w-3 h-3 ${
                  status.status === 'critical' ? 'text-destructive' :
                  status.status === 'warning' ? 'text-warning' :
                  'text-muted-foreground'
                }`} />
                <span className="text-[11px] font-semibold text-foreground">Filter</span>
              </div>
              <span className={`text-[11px] font-bold tabular-nums ${
                status.status === 'critical' ? 'text-destructive' :
                status.status === 'warning' ? 'text-warning' :
                'text-foreground'
              }`}>
                {status.hoursRemaining.toFixed(0)}h remaining
              </span>
            </div>
            <Progress
              value={100 - status.percentUsed}
              className={`h-1.5 ${
                status.status === 'critical' ? '[&>div]:bg-destructive' :
                status.status === 'warning' ? '[&>div]:bg-warning' :
                '[&>div]:bg-primary'
              }`}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">
                {status.percentUsed}% used
              </span>
              {status.estimatedDaysRemaining !== null && (
                <span className="text-[10px] text-muted-foreground">
                  ~{formatDurationLong(status.estimatedDaysRemaining)}
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 text-[10px] px-1.5 mt-1 text-primary"
              onClick={handleOpenDialog}
            >
              Update / Reset
            </Button>
          </div>
        ) : config ? (
          <div className="flex items-center justify-center gap-1.5 py-1.5 text-success">
            <Filter className="w-3 h-3" />
            <span className="text-xs font-medium">Filter Tracking Active</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 text-[10px] px-1.5 text-primary"
              onClick={handleOpenDialog}
            >
              Edit
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs w-full"
            onClick={handleOpenDialog}
          >
            <Filter className="w-3 h-3 mr-1" />
            Set Up Filter Tracking
          </Button>
        )}
      </div>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Filter Tracking — {printer.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Filter size presets */}
            <div className="space-y-1.5">
              <Label className="text-xs">Filter Size</Label>
              <div className="flex gap-2">
                {FILTER_PRESETS.map(hours => (
                  <Button
                    key={hours}
                    size="sm"
                    variant={filterLife === hours.toString() ? 'default' : 'outline'}
                    className="flex-1 h-8 text-xs"
                    onClick={() => handleSelectPreset(hours)}
                  >
                    {hours.toLocaleString()}h
                  </Button>
                ))}
              </div>
            </div>

            {/* Current pump hours */}
            <div className="space-y-1.5">
              <Label className="text-xs">Current Pump Hours</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={entryPumpHours}
                onChange={e => setEntryPumpHours(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Read from the printer display or ^TM command.
                {pumpHours !== undefined && (
                  <> Live reading: <span className="font-mono font-bold">{pumpHours.toFixed(1)}</span>h</>
                )}
              </p>
            </div>

            {/* Remaining filter life */}
            <div className="space-y-1.5">
              <Label className="text-xs">Filter Life Remaining (hours)</Label>
              <Input
                type="number"
                min={0}
                value={remainingHours}
                onChange={e => setRemainingHours(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                As shown on the printer's filter life display.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>
              {config ? 'Update' : 'Start Tracking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Parse pump hours from the streamHours string in PrinterMetrics.
 * Format is typically "120.5" or "97:08" (HH:MM).
 */
export function parseStreamHoursToNumber(streamHours: string): number | null {
  if (!streamHours) return null;
  // Try HH:MM format
  const hhMm = streamHours.match(/^(\d+):(\d+)$/);
  if (hhMm) {
    return parseInt(hhMm[1], 10) + parseInt(hhMm[2], 10) / 60;
  }
  // Try decimal
  const num = parseFloat(streamHours);
  return isNaN(num) ? null : num;
}
