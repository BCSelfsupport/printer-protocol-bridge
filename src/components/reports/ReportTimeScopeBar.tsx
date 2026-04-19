import { useState } from 'react';
import { CalendarIcon, Filter, Check } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ReportTimeScope } from '@/types/reportTemplates';
import type { Printer } from '@/types/printer';
import { resolveScope } from '@/lib/reportAggregation';

interface Props {
  scope: ReportTimeScope;
  onChange: (scope: ReportTimeScope) => void;
  printers: Printer[];
  showBucket?: boolean;
}

const PRESETS: { key: ReportTimeScope['preset']; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'thisWeek', label: 'This Week' },
  { key: 'last7', label: 'Last 7d' },
  { key: 'last30', label: 'Last 30d' },
  { key: 'last90', label: 'Last 90d' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
];

export function ReportTimeScope({ scope, onChange, printers, showBucket = true }: Props) {
  const [printerOpen, setPrinterOpen] = useState(false);
  const range = resolveScope(scope);

  const togglePrinter = (id: number) => {
    const set = new Set(scope.printerIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ ...scope, printerIds: Array.from(set) });
  };

  const printerLabel =
    scope.printerIds.length === 0
      ? 'All Printers'
      : scope.printerIds.length === 1
      ? printers.find(p => p.id === scope.printerIds[0])?.name ?? '1 selected'
      : `${scope.printerIds.length} selected`;

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      {/* Preset chips */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => onChange({ ...scope, preset: p.key })}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
              scope.preset === p.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        ))}

        {/* Custom range */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1',
                scope.preset === 'custom'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
              )}
            >
              <CalendarIcon className="w-3 h-3" />
              {scope.preset === 'custom' && scope.customStart && scope.customEnd
                ? `${format(scope.customStart, 'MMM d')} – ${format(scope.customEnd, 'MMM d')}`
                : 'Custom'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={
                scope.customStart && scope.customEnd
                  ? { from: new Date(scope.customStart), to: new Date(scope.customEnd) }
                  : undefined
              }
              onSelect={(range) => {
                if (range?.from && range?.to) {
                  onChange({
                    ...scope,
                    preset: 'custom',
                    customStart: range.from.getTime(),
                    customEnd: range.to.getTime(),
                  });
                }
              }}
              numberOfMonths={2}
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-border/40">
        {/* Printers */}
        <div className="flex-1 min-w-[180px]">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Printers</Label>
          <Popover open={printerOpen} onOpenChange={setPrinterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-start mt-1 h-9 font-normal">
                <Filter className="w-3.5 h-3.5 mr-2" />
                {printerLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1">
              <button
                onClick={() => onChange({ ...scope, printerIds: [] })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-secondary text-left"
              >
                <span className="w-4 h-4 flex items-center justify-center">
                  {scope.printerIds.length === 0 && <Check className="w-3.5 h-3.5 text-primary" />}
                </span>
                <span className="font-semibold">All Printers</span>
              </button>
              <div className="border-t border-border/40 my-1" />
              {printers.map(p => (
                <button
                  key={p.id}
                  onClick={() => togglePrinter(p.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-secondary text-left"
                >
                  <span className="w-4 h-4 flex items-center justify-center">
                    {scope.printerIds.includes(p.id) && <Check className="w-3.5 h-3.5 text-primary" />}
                  </span>
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        {/* Bucket */}
        {showBucket && (
          <div className="min-w-[120px]">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Group by</Label>
            <Select value={scope.bucket} onValueChange={(v: 'day' | 'week' | 'month') => onChange({ ...scope, bucket: v })}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Range readout */}
        <div className="ml-auto text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Range</div>
          <div className="text-xs font-semibold text-foreground tabular-nums mt-1">
            {format(range.start, 'MMM d')} – {format(range.end, 'MMM d, yyyy')}
          </div>
        </div>
      </div>
    </div>
  );
}
