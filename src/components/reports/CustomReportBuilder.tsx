import { useState, useEffect } from 'react';
import { Save, X, Sliders, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  ALL_METRICS, ALL_VISUALIZATIONS, DEFAULT_SCOPE,
} from '@/types/reportTemplates';
import type {
  CustomReportTemplate, ReportMetricKey, ReportVisualization, ReportGroupBy,
} from '@/types/reportTemplates';
import { ReportTimeScope as ReportTimeScopeBar } from './ReportTimeScopeBar';
import type { Printer } from '@/types/printer';

const GROUP_OPTIONS: { key: ReportGroupBy; label: string }[] = [
  { key: 'printer', label: 'Printer / Line' },
  { key: 'shift', label: 'Shift' },
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'message', label: 'Message / Product' },
];

const DOWNTIME_REASONS = [
  { key: 'printer_error', label: 'Printer Error' },
  { key: 'ink_empty', label: 'Ink Empty' },
  { key: 'makeup_empty', label: 'Makeup Empty' },
  { key: 'manual_stop', label: 'Manual Stop' },
  { key: 'changeover', label: 'Changeover' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'jet_stopped', label: 'Jet Stopped' },
  { key: 'hv_disabled', label: 'HV Disabled' },
  { key: 'other', label: 'Other' },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  printers: Printer[];
  initial?: CustomReportTemplate | null;
  onSave: (template: Omit<CustomReportTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
}

const DEFAULTS = {
  metrics: ['produced', 'target', 'attainment', 'runTime', 'downtime', 'oee'] as ReportMetricKey[],
  visualizations: ['kpiCards', 'productionTrend', 'downtimePareto', 'messagePie'] as ReportVisualization[],
  groupBy: ['printer'] as ReportGroupBy[],
};

export function CustomReportBuilder({ open, onOpenChange, printers, initial, onSave }: Props) {
  const [name, setName] = useState('My Report');
  const [metrics, setMetrics] = useState<ReportMetricKey[]>(DEFAULTS.metrics);
  const [visualizations, setVisualizations] = useState<ReportVisualization[]>(DEFAULTS.visualizations);
  const [groupBy, setGroupBy] = useState<ReportGroupBy[]>(DEFAULTS.groupBy);
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const [messageFilter, setMessageFilter] = useState('');
  const [downtimeReasons, setDowntimeReasons] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      if (initial) {
        setName(initial.name);
        setMetrics(initial.metrics);
        setVisualizations(initial.visualizations);
        setGroupBy(initial.groupBy);
        setScope(initial.scope);
        setMessageFilter(initial.messageFilter ?? '');
        setDowntimeReasons(initial.downtimeReasons ?? []);
      } else {
        setName('My Report');
        setMetrics(DEFAULTS.metrics);
        setVisualizations(DEFAULTS.visualizations);
        setGroupBy(DEFAULTS.groupBy);
        setScope(DEFAULT_SCOPE);
        setMessageFilter('');
        setDowntimeReasons([]);
      }
    }
  }, [open, initial]);

  const toggle = <T extends string>(set: T[], v: T, fn: (s: T[]) => void) => {
    fn(set.includes(v) ? set.filter(x => x !== v) : [...set, v]);
  };

  const handleSave = () => {
    onSave({
      id: initial?.id,
      name: name.trim() || 'Untitled Report',
      metrics,
      visualizations,
      groupBy,
      scope,
      messageFilter: messageFilter.trim() || undefined,
      downtimeReasons: downtimeReasons.length > 0 ? downtimeReasons : undefined,
    });
    onOpenChange(false);
  };

  const reset = () => {
    setMetrics(DEFAULTS.metrics);
    setVisualizations(DEFAULTS.visualizations);
    setGroupBy(DEFAULTS.groupBy);
    setScope(DEFAULT_SCOPE);
    setMessageFilter('');
    setDowntimeReasons([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            {initial ? 'Edit Report Template' : 'New Custom Report'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Name */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Template Name</Label>
            <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Daily Production Recap" />
          </div>

          {/* Time scope */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Time Scope</Label>
            <div className="mt-1">
              <ReportTimeScopeBar scope={scope} onChange={setScope} printers={printers} />
            </div>
          </div>

          {/* Metrics */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Metrics ({metrics.length})</Label>
              <button
                onClick={() => setMetrics(metrics.length === ALL_METRICS.length ? [] : ALL_METRICS.map(m => m.key))}
                className="text-xs text-primary hover:underline"
              >
                {metrics.length === ALL_METRICS.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
              {ALL_METRICS.map(m => (
                <label
                  key={m.key}
                  className={cn(
                    'flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors',
                    metrics.includes(m.key) ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30'
                  )}
                >
                  <Checkbox
                    checked={metrics.includes(m.key)}
                    onCheckedChange={() => toggle(metrics, m.key, setMetrics)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-foreground">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">{m.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Visualizations */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Visualizations ({visualizations.length})</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
              {ALL_VISUALIZATIONS.map(v => (
                <label
                  key={v.key}
                  className={cn(
                    'flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors',
                    visualizations.includes(v.key) ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30'
                  )}
                >
                  <Checkbox
                    checked={visualizations.includes(v.key)}
                    onCheckedChange={() => toggle(visualizations, v.key, setVisualizations)}
                  />
                  <span className="text-xs font-semibold text-foreground">{v.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Group by */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Group By</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {GROUP_OPTIONS.map(g => (
                <button
                  key={g.key}
                  onClick={() => toggle(groupBy, g.key, setGroupBy)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                    groupBy.includes(g.key)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Message Filter</Label>
              <Input
                className="mt-1" value={messageFilter} onChange={e => setMessageFilter(e.target.value)}
                placeholder="Substring match (optional)"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Downtime Reasons</Label>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {DOWNTIME_REASONS.map(r => (
                  <button
                    key={r.key}
                    onClick={() => toggle(downtimeReasons, r.key, setDowntimeReasons)}
                    className={cn(
                      'px-2 py-1 rounded text-[11px] font-medium transition-colors',
                      downtimeReasons.includes(r.key)
                        ? 'bg-destructive text-destructive-foreground'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{downtimeReasons.length === 0 ? 'All reasons included' : `${downtimeReasons.length} selected`}</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          <Button onClick={handleSave} className="industrial-button text-white border-0">
            <Save className="w-4 h-4 mr-1" /> {initial ? 'Update' : 'Save'} Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
