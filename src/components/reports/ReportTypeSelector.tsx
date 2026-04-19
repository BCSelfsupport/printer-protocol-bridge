import { BarChart3, Gauge, Package, Clock, Sliders } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReportType = 'oee' | 'production' | 'shift' | 'custom';

interface Props {
  value: ReportType;
  onChange: (v: ReportType) => void;
}

const TYPES: { key: ReportType; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'oee', label: 'OEE Report', icon: Gauge, desc: 'Availability · Performance · Quality' },
  { key: 'production', label: 'Production Summary', icon: Package, desc: 'How many · how long · what rate' },
  { key: 'shift', label: 'Shift Report', icon: Clock, desc: 'Day · Swing · Night totals' },
  { key: 'custom', label: 'Custom', icon: Sliders, desc: 'Pick metrics, group, save templates' },
];

export function ReportTypeSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {TYPES.map(t => {
        const Icon = t.icon;
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'group rounded-xl border-2 p-3 text-left transition-all relative overflow-hidden',
              active
                ? 'border-primary bg-primary/10 shadow-md shadow-primary/20'
                : 'border-border/40 bg-card hover:border-primary/40 hover:bg-primary/5'
            )}
          >
            {active && (
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-primary/20 blur-2xl" />
            )}
            <div className="flex items-center gap-2 mb-1 relative z-10">
              <div
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground group-hover:text-primary'
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className={cn('text-sm font-bold tracking-tight', active ? 'text-primary' : 'text-foreground')}>
                {t.label}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-tight relative z-10">{t.desc}</p>
          </button>
        );
      })}
    </div>
  );
}
