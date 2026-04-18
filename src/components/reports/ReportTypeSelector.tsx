import { BarChart3, Activity, Clock, Sliders } from 'lucide-react';
import type { ReportType } from '@/types/reportTemplates';
import { cn } from '@/lib/utils';

const REPORT_TYPES: {
  id: ReportType;
  label: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  iconBg: string;
}[] = [
  {
    id: 'oee',
    label: 'OEE Report',
    description: 'Availability · Performance · Quality',
    icon: Activity,
    accent: 'from-primary/15 to-primary/5',
    iconBg: 'bg-primary/15 text-primary',
  },
  {
    id: 'production-summary',
    label: 'Production Summary',
    description: 'Units produced and run time per line',
    icon: BarChart3,
    accent: 'from-success/15 to-success/5',
    iconBg: 'bg-success/15 text-success',
  },
  {
    id: 'shift',
    label: 'Shift Report',
    description: 'Production grouped by shift window',
    icon: Clock,
    accent: 'from-warning/15 to-warning/5',
    iconBg: 'bg-warning/15 text-warning',
  },
  {
    id: 'custom',
    label: 'Custom Report',
    description: 'Build & save your own template',
    icon: Sliders,
    accent: 'from-accent/15 to-accent/5',
    iconBg: 'bg-accent/15 text-accent-foreground',
  },
];

export function ReportTypeSelector({
  value,
  onChange,
}: {
  value: ReportType;
  onChange: (t: ReportType) => void;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      {REPORT_TYPES.map(t => {
        const Icon = t.icon;
        const selected = value === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              'group relative rounded-xl border text-left p-3 transition-all overflow-hidden',
              selected
                ? 'border-primary/60 ring-2 ring-primary/30 bg-gradient-to-br ' + t.accent + ' shadow-md'
                : 'border-border/40 bg-card hover:border-primary/30 hover:shadow-sm',
            )}
          >
            {selected && (
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
            <div className="flex items-center gap-2.5">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', t.iconBg)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-foreground truncate">{t.label}</div>
                <div className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                  {t.description}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
