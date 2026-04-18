import { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Filter, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { DateScope, DateRangePreset, GroupByBucket } from '@/types/reportTemplates';
import type { Printer } from '@/types/printer';
import { describeDateScope } from '@/lib/reportAggregation';

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this-week', label: 'This Week' },
  { id: 'last-week', label: 'Last Week' },
  { id: 'last-7', label: 'Last 7 Days' },
  { id: 'last-30', label: 'Last 30 Days' },
  { id: 'last-90', label: 'Last 90 Days' },
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'all-time', label: 'All Time' },
];

const BUCKETS: { id: GroupByBucket; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

export function ReportTimeScope({
  scope,
  onChange,
  printers,
}: {
  scope: DateScope;
  onChange: (s: DateScope) => void;
  printers: Printer[];
}) {
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [printerPopoverOpen, setPrinterPopoverOpen] = useState(false);

  const printerLabel = useMemo(() => {
    if (!scope.printerIds || scope.printerIds.length === 0 || scope.printerIds.length === printers.length) {
      return `All Printers (${printers.length})`;
    }
    if (scope.printerIds.length === 1) {
      return printers.find(p => p.id === scope.printerIds![0])?.name ?? '1 printer';
    }
    return `${scope.printerIds.length} printers`;
  }, [scope.printerIds, printers]);

  const customRangeText = scope.preset === 'custom' && scope.start && scope.end
    ? `${format(new Date(scope.start), 'MMM d')} – ${format(new Date(scope.end), 'MMM d, yyyy')}`
    : describeDateScope(scope);

  const togglePrinter = (id: number) => {
    const current = scope.printerIds ?? printers.map(p => p.id);
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    onChange({ ...scope, printerIds: next.length === printers.length ? null : next });
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {/* Date range */}
        <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 font-medium">
              <CalendarIcon className="w-4 h-4 text-primary" />
              <span className="hidden sm:inline text-xs text-muted-foreground">Range:</span>
              <span className="text-sm">{customRangeText}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex">
              {/* Presets */}
              <div className="border-r border-border p-2 space-y-0.5 w-40">
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onChange({ ...scope, preset: p.id });
                      setDatePopoverOpen(false);
                    }}
                    className={cn(
                      'w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors',
                      scope.preset === p.id
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'hover:bg-secondary text-foreground',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => onChange({ ...scope, preset: 'custom' })}
                  className={cn(
                    'w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors',
                    scope.preset === 'custom'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'hover:bg-secondary text-foreground',
                  )}
                >
                  Custom Range…
                </button>
              </div>
              {scope.preset === 'custom' && (
                <Calendar
                  mode="range"
                  defaultMonth={scope.start ? new Date(scope.start) : undefined}
                  selected={{
                    from: scope.start ? new Date(scope.start) : undefined,
                    to: scope.end ? new Date(scope.end) : undefined,
                  }}
                  onSelect={(range) => {
                    onChange({
                      ...scope,
                      preset: 'custom',
                      start: range?.from?.getTime(),
                      end: range?.to ? new Date(range.to).setHours(23, 59, 59, 999) : undefined,
                    });
                  }}
                  numberOfMonths={2}
                  className={cn('p-3 pointer-events-auto')}
                />
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Group by */}
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background p-0.5">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-2">Group</span>
          {BUCKETS.map(b => (
            <button
              key={b.id}
              onClick={() => onChange({ ...scope, bucket: b.id })}
              className={cn(
                'text-xs font-semibold px-2.5 py-1 rounded-md transition-colors',
                scope.bucket === b.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
              )}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Printer filter */}
        <Popover open={printerPopoverOpen} onOpenChange={setPrinterPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 font-medium">
              <Filter className="w-4 h-4 text-primary" />
              <span className="text-sm">{printerLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-border">
              <span className="text-xs font-bold text-foreground">Filter Printers</span>
              <button
                onClick={() => onChange({ ...scope, printerIds: null })}
                className="text-[10px] text-primary hover:underline"
              >
                Reset
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {printers.length === 0 && (
                <div className="text-xs text-muted-foreground px-2 py-1.5">No printers configured</div>
              )}
              {printers.map(p => {
                const selected = !scope.printerIds || scope.printerIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
                  >
                    <Checkbox checked={selected} onCheckedChange={() => togglePrinter(p.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate font-mono">{p.ipAddress}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
