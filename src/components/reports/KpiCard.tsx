import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Accent = 'primary' | 'success' | 'warning' | 'destructive' | 'accent';

const ACCENT_STYLES: Record<Accent, { bg: string; border: string; icon: string; glow: string; text: string }> = {
  primary: {
    bg: 'from-primary/15 via-primary/5 to-transparent',
    border: 'border-primary/25 hover:border-primary/50',
    icon: 'text-primary',
    glow: 'bg-primary',
    text: 'text-primary',
  },
  success: {
    bg: 'from-success/15 via-success/5 to-transparent',
    border: 'border-success/25 hover:border-success/50',
    icon: 'text-success',
    glow: 'bg-success',
    text: 'text-success',
  },
  warning: {
    bg: 'from-warning/15 via-warning/5 to-transparent',
    border: 'border-warning/25 hover:border-warning/50',
    icon: 'text-warning',
    glow: 'bg-warning',
    text: 'text-warning',
  },
  destructive: {
    bg: 'from-destructive/15 via-destructive/5 to-transparent',
    border: 'border-destructive/25 hover:border-destructive/50',
    icon: 'text-destructive',
    glow: 'bg-destructive',
    text: 'text-destructive',
  },
  accent: {
    bg: 'from-accent/15 via-accent/5 to-transparent',
    border: 'border-accent/25 hover:border-accent/50',
    icon: 'text-accent-foreground',
    glow: 'bg-accent',
    text: 'text-foreground',
  },
};

export interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  unit?: string;
  sublabel?: string;
  accent?: Accent;
  /** small trend pill on the right, e.g. "+12% vs last week" */
  trend?: { label: string; positive: boolean };
}

export function KpiCard({ icon: Icon, label, value, unit, sublabel, accent = 'primary', trend }: KpiCardProps) {
  const s = ACCENT_STYLES[accent];
  return (
    <div className={cn(
      'rounded-2xl border backdrop-blur-sm bg-gradient-to-br p-4 md:p-5 transition-all duration-300 group relative overflow-hidden',
      s.bg, s.border,
    )}>
      {/* corner glow */}
      <div className={cn('absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-[0.07] blur-xl', s.glow)} />

      <div className="flex items-start gap-2.5 mb-3 relative z-10">
        <div className={cn('w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center border', s.bg, s.border)}>
          <Icon className={cn('w-4 h-4', s.icon)} />
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{label}</div>
          {sublabel && <div className="text-[10px] text-muted-foreground/70 truncate">{sublabel}</div>}
        </div>
        {trend && (
          <span className={cn(
            'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
            trend.positive ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
          )}>
            {trend.label}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1 relative z-10">
        <span className="text-2xl md:text-3xl font-black text-foreground tabular-nums tracking-tight">{value}</span>
        {unit && <span className={cn('text-sm font-bold', s.text)}>{unit}</span>}
      </div>
    </div>
  );
}
