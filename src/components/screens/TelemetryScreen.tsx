import { useState, useEffect, useCallback } from 'react';
import { 
  Building2, Activity, AlertTriangle, 
  ChevronRight, RefreshCw, Thermometer, 
  Droplets, Gauge, Zap, Clock, Upload, 
  CheckCircle2, XCircle, Loader2, Database,
  ArrowUpCircle, History, Wifi, WifiOff, MapPin,
  Mail, Server, Cpu, BarChart3, Signal, Key,
  Home, ArrowLeft, Radio, Sun, Moon, Trash2, Plus, Pencil, Check, X
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// ════════════════════════════════════ Types ════════════════════════════════════

interface FleetSite {
  id: string;
  name: string;
  company: string | null;
  location: string | null;
  contact_email: string | null;
  license_id: string | null;
  licenses: { product_key: string; tier: string; created_at: string } | null;
  fleet_printers: FleetPrinter[];
}

interface FleetPrinter {
  id: string;
  name: string;
  ip_address: string;
  port: number;
  firmware_version: string | null;
  serial_number: string | null;
  last_seen: string | null;
  status: string;
}

interface FleetTelemetry {
  pressure: number;
  viscosity: number;
  modulation: number;
  charge: number;
  rps: number;
  phase_qual: number;
  ink_level: string;
  makeup_level: string;
  printhead_temp: number;
  electronics_temp: number;
  power_hours: string;
  stream_hours: string;
  hv_on: boolean;
  jet_running: boolean;
  print_count: number;
  current_message: string;
  recorded_at: string;
  filter_hours_remaining: number | null;
}

interface TelemetrySnapshot {
  recorded_at: string;
  viscosity: number | null;
  phase_qual: number | null;
  pressure: number | null;
  modulation: number | null;
  rps: number | null;
}

interface FleetEvent {
  id: string;
  event_type: string;
  severity: string;
  message: string;
  occurred_at: string;
  category: string;
  metadata: { previous?: number; current?: number; previous_level?: string; current_level?: string } | null;
}

interface Firmware {
  id: string;
  version: string;
  release_notes: string | null;
  file_size: number | null;
  is_latest: boolean;
}

// ════════════════════════════════════ Helpers ════════════════════════════════════

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ════════════════════════════════════ Branding ════════════════════════════════════

function FleetTelemetryLogo({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="flex items-center gap-3">
      {/* Icon matching CodeSync's blue/emerald palette */}
      <div className={cn(
        "relative rounded-xl flex items-center justify-center overflow-hidden",
        size === 'lg' ? "w-11 h-11" : size === 'md' ? "w-9 h-9" : "w-7 h-7"
      )}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-500 to-emerald-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        <Signal className={cn("text-white relative z-10", size === 'lg' ? "w-6 h-6" : size === 'md' ? "w-5 h-5" : "w-4 h-4")} />
      </div>
      <div className="flex flex-col leading-none">
        <div className="flex items-start">
          <span className={cn(
            "font-bold italic text-blue-600",
            size === 'lg' ? "text-xl" : size === 'md' ? "text-base" : "text-sm"
          )}>Fleet</span>
          <span className={cn(
            "font-bold italic text-emerald-500",
            size === 'lg' ? "text-xl" : size === 'md' ? "text-base" : "text-sm"
          )}>Telemetry</span>
          <span className={cn(
            "font-normal text-muted-foreground leading-none ml-0.5",
            size === 'lg' ? "text-xs mt-0.5" : "text-[8px] mt-px"
          )}>™</span>
        </div>
        <span className={cn(
          "text-muted-foreground tracking-[0.2em] uppercase font-medium",
          size === 'lg' ? "text-[10px] mt-0.5" : "text-[8px]"
        )}>
          by CodeSync
        </span>
      </div>
    </div>
  );
}

// ════════════════════════════════════ Sub-components ════════════════════════════════════

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/20 transition-colors"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4 text-foreground" /> : <Moon className="w-4 h-4 text-foreground" />}
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <div className="relative">
      <div className={cn(
        "w-3 h-3 rounded-full",
        status === 'online' && "bg-emerald-500",
        status === 'offline' && "bg-muted-foreground/30",
        status === 'error' && "bg-red-500"
      )} />
      {status === 'online' && (
        <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-30" />
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, subtitle }: { 
  label: string; value: number | string; icon: React.ElementType; color: string; subtitle?: string 
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="text-3xl font-bold text-foreground tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{label}</div>
      {subtitle && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{subtitle}</div>}
    </div>
  );
}

function MetricRow({ label, value, unit, status }: { label: string; value: string | number; unit?: string; status?: 'good' | 'warn' | 'error' }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn(
        "font-mono text-sm font-semibold",
        status === 'good' && "text-emerald-600",
        status === 'warn' && "text-amber-500",
        status === 'error' && "text-red-500",
        !status && "text-foreground"
      )}>
        {value}{unit && <span className="text-muted-foreground/50 ml-1 text-xs font-normal">{unit}</span>}
      </span>
    </div>
  );
}

// ════════════════════════════════════ Event Log Table ════════════════════════════════════

// Categories match the printer's native Event Log tabs per v2.6 manual
type EventCategory = 'all' | 'event' | 'viscosity' | 'phase' | 'smartfill' | 'filter';

const EVENT_CATEGORIES: { key: EventCategory; label: string; icon: string; description: string }[] = [
  { key: 'all', label: 'All', icon: '📋', description: 'All logged events' },
  { key: 'event', label: 'Event', icon: '⚡', description: 'Faults, starts, stops, scripts' },
  { key: 'viscosity', label: 'Viscosity', icon: '💧', description: 'Viscosity tracking & makeup adds' },
  { key: 'phase', label: 'Phase', icon: '📊', description: 'Phase quality, point, width' },
  { key: 'smartfill', label: 'SmartFill', icon: '🔋', description: 'Ink & makeup level changes' },
  { key: 'filter', label: 'Filter', icon: '🔧', description: 'Filter life tracking' },
];

// Map event_type to a human-readable label matching the printer's HMI style
function getEventLabel(evt: FleetEvent): string {
  switch (evt.event_type) {
    case 'jet_start': return 'Jet Start';
    case 'jet_stop': return 'Jet Stop';
    case 'hv_on': return 'HV On';
    case 'hv_off': return 'HV Off';
    case 'pressure_fault': return 'Pressure';
    case 'modulation_change': return 'Modulation';
    case 'viscosity_add': return 'Viscosity Add';
    case 'viscosity_change': return 'Viscosity';
    case 'phase_quality_change': return 'Phase Quality';
    case 'phase_quality_low': return 'Phase Quality';
    case 'ink_level_change': return 'Ink Level';
    case 'ink_fill': return 'Ink Fill';
    case 'makeup_level_change': return 'Makeup Level';
    case 'makeup_fill': return 'Makeup Fill';
    case 'filter_warning': return 'Filter Warning';
    case 'filter_expired': return 'Filter Expired';
    case 'filter_replaced': return 'Filter Replaced';
    // Legacy event types from before the rebuild
    case 'viscosity_drift': return 'Viscosity';
    case 'pressure_drift': return 'Pressure';
    case 'modulation_drift': return 'Modulation';
    default: return evt.event_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

// Map severity to status label matching the printer's HMI (Event/Warning/Fault)
function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'warning': return 'Warning';
    case 'error': return 'Fault';
    default: return 'Event';
  }
}

function EventLogTable({ events, telemetryHistory }: { events: FleetEvent[]; telemetryHistory: TelemetrySnapshot[] }) {
  const [category, setCategory] = useState<EventCategory>('all');
  
  // Filter by category — use the category field if available, otherwise infer from event_type
  const filtered = category === 'all' 
    ? events 
    : events.filter(e => {
        if (e.category && e.category !== 'event') return e.category === category;
        if (category === 'event') return ['jet_start', 'jet_stop', 'hv_on', 'hv_off', 'pressure_fault', 'pressure_drift', 'modulation_change', 'modulation_drift'].includes(e.event_type);
        if (category === 'viscosity') return ['viscosity_drift', 'viscosity_add', 'viscosity_change'].includes(e.event_type);
        if (category === 'phase') return ['phase_quality_low', 'phase_quality_change'].includes(e.event_type);
        if (category === 'smartfill') return ['ink_level_change', 'ink_fill', 'makeup_level_change', 'makeup_fill'].includes(e.event_type);
        if (category === 'filter') return ['filter_warning', 'filter_expired', 'filter_replaced'].includes(e.event_type);
        return e.category === category;
      });

  // Build viscosity readings from telemetry history (sorted newest first from server)
  const viscosityReadings = telemetryHistory
    .filter(t => t.viscosity != null)
    .map((t, i, arr) => {
      const prev = arr[i + 1]; // next in array = previous in time (descending order)
      let trend: 'rising' | 'falling' | 'steady' = 'steady';
      if (prev?.viscosity != null && t.viscosity != null) {
        const delta = t.viscosity - prev.viscosity;
        if (delta > 0.01) trend = 'rising';
        else if (delta < -0.01) trend = 'falling';
      }
      return { ...t, trend };
    });

  // Build phase readings from telemetry history
  // Quality = phase_qual from ^SU (PhaseQual[xx%])
  // Efficiency = ratio of current quality to peak quality in the dataset (how close to best performance)
  const peakPhaseQual = Math.max(...telemetryHistory.filter(t => t.phase_qual != null).map(t => t.phase_qual!), 100);
  const phaseReadings = telemetryHistory
    .filter(t => t.phase_qual != null)
    .map((t, i, arr) => {
      const prev = arr[i + 1];
      let trend: 'rising' | 'falling' | 'steady' = 'steady';
      if (prev?.phase_qual != null && t.phase_qual != null) {
        const delta = t.phase_qual - prev.phase_qual;
        if (delta > 1) trend = 'rising';
        else if (delta < -1) trend = 'falling';
      }
      const efficiency = peakPhaseQual > 0 ? Math.round((t.phase_qual! / peakPhaseQual) * 100) : 0;
      return { ...t, trend, efficiency };
    });

  const severityColor = (s: string) => {
    if (s === 'warning') return 'text-amber-500';
    if (s === 'error') return 'text-red-500';
    return 'text-blue-500';
  };

  const severityBg = (s: string) => {
    if (s === 'warning') return 'bg-amber-500/10';
    if (s === 'error') return 'bg-red-500/10';
    return 'bg-blue-500/5';
  };

  // Count helper for category tabs
  const getCategoryCount = (catKey: EventCategory) => {
    if (catKey === 'all') return events.length;
    if (catKey === 'viscosity') return viscosityReadings.length;
    if (catKey === 'phase') return phaseReadings.length;
    return events.filter(e => {
      if (e.category && e.category !== 'event') return e.category === catKey;
      if (catKey === 'event') return ['jet_start', 'jet_stop', 'hv_on', 'hv_off', 'pressure_fault', 'pressure_drift', 'modulation_change', 'modulation_drift'].includes(e.event_type);
      if (catKey === 'phase') return ['phase_quality_low', 'phase_quality_change'].includes(e.event_type);
      if (catKey === 'smartfill') return ['ink_level_change', 'ink_fill', 'makeup_level_change', 'makeup_fill'].includes(e.event_type);
      if (catKey === 'filter') return ['filter_warning', 'filter_expired', 'filter_replaced'].includes(e.event_type);
      return e.category === catKey;
    }).length;
  };

  return (
    <div className="space-y-4">
      {/* Category tabs — matching printer's native Event Log bottom nav */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 overflow-x-auto">
        {EVENT_CATEGORIES.map(cat => {
          const count = getCategoryCount(cat.key);
          return (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              title={cat.description}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5",
                category === cat.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <span>{cat.icon}</span>
              {cat.label}
              {count > 0 && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-mono",
                  category === cat.key ? "bg-primary-foreground/20" : "bg-muted-foreground/15"
                )}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Viscosity tab: shows telemetry readings, not events ── */}
      {category === 'viscosity' ? (
        viscosityReadings.length > 0 ? (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 border-b border-border">
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Date</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Time</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Viscosity (cP)</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {viscosityReadings.map((row, i) => {
                    const d = new Date(row.recorded_at);
                    const date = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                    const time = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const trendIcon = row.trend === 'rising' ? '↑' : row.trend === 'falling' ? '↓' : '→';
                    const trendLabel = row.trend === 'rising' ? 'Rising' : row.trend === 'falling' ? 'Falling' : 'Steady';
                    const trendColor = row.trend === 'rising' ? 'text-red-500' : row.trend === 'falling' ? 'text-blue-500' : 'text-muted-foreground';

                    return (
                      <tr key={`visc-${i}`} className={cn(
                        "border-b border-border/40 last:border-0 transition-colors hover:bg-muted/30",
                        i % 2 === 0 ? 'bg-card' : 'bg-card/60'
                      )}>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{date}</td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{time}</td>
                        <td className="px-4 py-2 font-mono text-sm font-semibold text-foreground">
                          {row.viscosity?.toFixed(2)}
                        </td>
                        <td className="px-4 py-2">
                          <span className={cn("text-xs font-medium", trendColor)}>
                            {trendIcon} {trendLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-16 bg-card border border-border rounded-xl">
            No viscosity readings recorded yet. Readings are logged every 30 seconds when the printer is connected.
          </div>
        )
      ) : (
        /* ── Standard event table for all other tabs ── */
        filtered.length > 0 ? (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 border-b border-border">
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Date</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Time</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Status</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Event</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((evt, i) => {
                    const d = new Date(evt.occurred_at);
                    const date = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                    const time = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const statusLabel = getSeverityLabel(evt.severity);
                    const eventLabel = getEventLabel(evt);

                    return (
                      <tr key={evt.id} className={cn(
                        "border-b border-border/40 last:border-0 transition-colors hover:bg-muted/30",
                        i % 2 === 0 ? 'bg-card' : 'bg-card/60'
                      )}>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{date}</td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{time}</td>
                        <td className="px-4 py-2">
                          <Badge className={cn(
                            "text-[10px] font-semibold border-0",
                            severityBg(evt.severity),
                            severityColor(evt.severity)
                          )}>
                            {statusLabel}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-medium text-foreground">{eventLabel}</span>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground max-w-[300px] truncate" title={evt.message}>
                          {evt.message}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-16 bg-card border border-border rounded-xl">
            No {EVENT_CATEGORIES.find(c => c.key === category)?.label || ''} events recorded
          </div>
        )
      )}
    </div>
  );
}

// ════════════════════════════════════ OTA Simulator ════════════════════════════════════

function FirmwareUpdatePanel({ printer, firmware }: { printer: FleetPrinter; firmware: Firmware[] }) {
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [completed, setCompleted] = useState(false);
  const [selectedFw, setSelectedFw] = useState<Firmware | null>(null);

  const latestFw = firmware.find(f => f.is_latest);
  const needsUpdate = latestFw && printer.firmware_version !== latestFw.version;
  const targetFw = selectedFw || latestFw;

  const simulateUpdate = useCallback(() => {
    if (!targetFw) return;
    setUpdating(true);
    setProgress(0);
    setCompleted(false);

    const stages = [
      { name: 'Establishing secure TLS connection...', end: 5 },
      { name: 'Authenticating device credentials...', end: 8 },
      { name: 'Validating firmware package integrity...', end: 12 },
      { name: 'Backing up current configuration...', end: 18 },
      { name: 'Erasing flash sectors (0x08000000)...', end: 28 },
      { name: 'Uploading firmware binary via J-Link OTA...', end: 85 },
      { name: 'Verifying SHA-256 checksum...', end: 92 },
      { name: 'Writing boot sector & jump table...', end: 97 },
      { name: 'Restarting printer MCU...', end: 100 },
    ];

    let currentStageIdx = 0;
    let currentProgress = 0;

    const interval = setInterval(() => {
      const currentStage = stages[currentStageIdx];
      if (!currentStage) {
        clearInterval(interval);
        setStage('✓ Firmware update complete — printer restarting');
        setCompleted(true);
        setUpdating(false);
        return;
      }
      setStage(currentStage.name);
      if (currentProgress < currentStage.end) {
        const increment = currentStageIdx === 5 ? 0.4 : 1.5;
        currentProgress = Math.min(currentProgress + increment, currentStage.end);
        setProgress(Math.round(currentProgress));
      } else {
        currentStageIdx++;
      }
    }, 80);

    return () => clearInterval(interval);
  }, [targetFw]);

  return (
    <div className="space-y-5">
      {/* Current vs Target */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Installed</div>
          <div className="text-2xl font-mono font-bold text-foreground">{printer.firmware_version || '?'}</div>
          <div className="text-[11px] text-muted-foreground mt-1">Current firmware</div>
        </div>
        <div className="bg-card border border-primary/20 rounded-2xl p-5">
          <div className="text-[10px] text-primary uppercase tracking-widest mb-2">Latest Available</div>
          <div className="text-2xl font-mono font-bold text-primary">{latestFw?.version || '—'}</div>
          <div className="text-[11px] text-muted-foreground mt-1">Stable release</div>
        </div>
      </div>

      {completed ? (
        <div className="flex items-center gap-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5">
          <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-base font-semibold text-emerald-600">Update Successful</p>
            <p className="text-sm text-muted-foreground">Firmware {targetFw?.version} installed successfully. Printer restarting...</p>
          </div>
        </div>
      ) : updating ? (
        <div className="bg-card border border-primary/20 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-semibold text-foreground">OTA Update in Progress</span>
            </div>
            <span className="text-xl font-mono font-bold text-primary">{progress}%</span>
          </div>
          <Progress value={progress} className="h-3" />
          <p className="text-xs text-muted-foreground font-mono bg-muted/50 px-3 py-2 rounded-lg">{stage}</p>
          {progress > 20 && progress < 85 && (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>↑ Transfer: {(0.6 + Math.random() * 0.5).toFixed(1)} MB/s</span>
              <span>ETA: {Math.ceil((100 - progress) * 0.1)}s remaining</span>
            </div>
          )}
        </div>
      ) : (
        <>
          {needsUpdate && (
            <Button onClick={simulateUpdate} disabled={printer.status === 'offline'} size="lg" className="w-full h-12 text-sm font-semibold">
              <Upload className="w-5 h-5 mr-2" />
              Deploy {targetFw?.version} via OTA
            </Button>
          )}
          {!needsUpdate && !selectedFw && (
            <div className="flex items-center gap-3 justify-center py-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <span className="text-sm text-emerald-600 font-medium">Running latest firmware</span>
            </div>
          )}
        </>
      )}

      {/* Version selector */}
      {firmware.length > 1 && !updating && !completed && (
        <div className="space-y-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest">All Versions</div>
          <div className="grid grid-cols-1 gap-2">
            {firmware.filter(f => f.version !== printer.firmware_version).map(fw => (
              <button
                key={fw.id}
                onClick={() => setSelectedFw(fw)}
                className={cn(
                  "text-left p-4 rounded-xl border transition-all",
                  selectedFw?.id === fw.id
                    ? "bg-primary/5 border-primary/30 shadow-sm"
                    : "bg-card border-border hover:border-primary/20 hover:shadow-sm"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-foreground">{fw.version}</span>
                    {fw.is_latest && <Badge className="text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/20 px-1.5 py-0">LATEST</Badge>}
                  </div>
                  {fw.file_size && <span className="text-xs text-muted-foreground">{(fw.file_size / 1024 / 1024).toFixed(1)} MB</span>}
                </div>
                {fw.release_notes && <p className="text-xs text-muted-foreground mt-1.5">{fw.release_notes}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════ Live Network Animation ════════════════════════════════════

function NetworkAnimation() {
  return (
    <svg viewBox="0 0 200 120" className="w-48 h-28 opacity-80">
      {/* Lines */}
      {[
        [100,60,40,30], [100,60,160,30], [100,60,50,90], [100,60,150,90],
        [40,30,20,60], [160,30,180,60], [50,90,30,110], [150,90,170,110],
      ].map(([x1,y1,x2,y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-emerald-500/30" strokeWidth="1.5">
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
        </line>
      ))}
      {/* Nodes */}
      {[
        {x:100,y:60,r:8,c:'fill-blue-500'}, {x:40,y:30,r:5,c:'fill-blue-400'}, {x:160,y:30,r:5,c:'fill-blue-400'},
        {x:50,y:90,r:4,c:'fill-emerald-500'}, {x:150,y:90,r:4,c:'fill-emerald-500'},
        {x:20,y:60,r:3,c:'fill-emerald-400'}, {x:180,y:60,r:3,c:'fill-emerald-400'},
        {x:30,y:110,r:3,c:'fill-blue-300'}, {x:170,y:110,r:3,c:'fill-blue-300'},
      ].map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={n.r} className={n.c}>
            <animate attributeName="opacity" values="0.6;1;0.6" dur={`${1.5 + i * 0.2}s`} repeatCount="indefinite" />
          </circle>
          {i === 0 && (
            <circle cx={n.x} cy={n.y} r={n.r} className="stroke-blue-400/30" fill="none" strokeWidth="1.5">
              <animate attributeName="r" values="8;20;30" dur="2.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0;0" dur="2.5s" repeatCount="indefinite" />
            </circle>
          )}
        </g>
      ))}
    </svg>
  );
}

// ════════════════════════════════════ Main Screen ════════════════════════════════════

interface TelemetryScreenProps {
  onHome: () => void;
}

export function TelemetryScreen({ onHome }: TelemetryScreenProps) {
  const [sites, setSites] = useState<FleetSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<FleetSite | null>(null);
  const [selectedPrinter, setSelectedPrinter] = useState<FleetPrinter | null>(null);
  const [telemetry, setTelemetry] = useState<FleetTelemetry | null>(null);
  const [events, setEvents] = useState<FleetEvent[]>([]);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetrySnapshot[]>([]);
  const [firmware, setFirmware] = useState<Firmware[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showAddSite, setShowAddSite] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteCompany, setNewSiteCompany] = useState('');
  const [newSiteLocation, setNewSiteLocation] = useState('');
  const [newSiteEmail, setNewSiteEmail] = useState('');
  const [newSiteLicenseKey, setNewSiteLicenseKey] = useState('');
  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [newPrinterName, setNewPrinterName] = useState('');
  const [newPrinterIp, setNewPrinterIp] = useState('');
  const [newPrinterPort, setNewPrinterPort] = useState('23');
  // Edit site state
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editLicenseKey, setEditLicenseKey] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const fleetCall = useCallback(async (action: string, params?: Record<string, string>, body?: any) => {
    const query = new URLSearchParams({ action, ...(params || {}) }).toString();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fleet-monitoring?${query}`,
      {
        method: 'POST',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body || {}),
      }
    );

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || `Fleet request failed (${res.status})`);
    }
    return json;
  }, []);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    try {
      const json = await fleetCall('sites');
      const allSites = (json.sites || []) as FleetSite[];
      allSites.sort((a, b) => {
        const da = a.licenses?.created_at ? new Date(a.licenses.created_at).getTime() : Infinity;
        const db = b.licenses?.created_at ? new Date(b.licenses.created_at).getTime() : Infinity;
        return da - db;
      });
      setSites(allSites);
    } catch (err) {
      console.error('Fleet fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [fleetCall]);

  const fetchPrinterDetail = useCallback(async (printer: FleetPrinter) => {
    setDetailLoading(true);
    try {
      const [detail, fw, sitesJson] = await Promise.all([
        fleetCall('printer-detail', { printerId: printer.id }),
        fleetCall('firmware-list'),
        fleetCall('sites'),
      ]);
      setTelemetry(detail.telemetry || null);
      setEvents(detail.events || []);
      setTelemetryHistory(detail.telemetry_history || []);
      setFirmware(fw.firmware || []);
      // Update sites and refresh selectedPrinter/selectedSite from fresh data
      const freshSites = sitesJson.sites || [];
      setSites(freshSites);
      for (const site of freshSites) {
        const freshPrinter = site.fleet_printers?.find((p: FleetPrinter) => p.id === printer.id);
        if (freshPrinter) {
          setSelectedPrinter(freshPrinter);
          setSelectedSite(site);
          break;
        }
      }
    } catch (err) {
      console.error('Printer detail fetch error:', err);
    } finally {
      setDetailLoading(false);
    }
  }, [fleetCall]);

  const seedDemoData = useCallback(async () => {
    setSeeding(true);
    try {
      const json = await fleetCall('seed-demo');
      if (json.success) await fetchSites();
    } catch (err) {
      console.error('Seed error:', err);
    } finally {
      setSeeding(false);
    }
  }, [fleetCall, fetchSites]);

  const handleDeleteSite = useCallback(async (siteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this site and all its printers/data? This cannot be undone.')) return;
    try {
      await fleetCall('delete-site', undefined, { site_id: siteId });
      await fetchSites();
    } catch (err) {
      console.error('Delete site error:', err);
    }
  }, [fleetCall, fetchSites]);

  const handleAddSite = useCallback(async () => {
    if (!newSiteName.trim()) return;
    setFormLoading(true);
    try {
      await fleetCall('add-site', undefined, {
        name: newSiteName.trim(),
        company: newSiteName.trim(),
        location: newSiteLocation.trim() || undefined,
        contact_email: newSiteEmail.trim() || undefined,
        license_key: newSiteLicenseKey.trim() || undefined,
      });
      setShowAddSite(false);
      setNewSiteName(''); setNewSiteCompany(''); setNewSiteLocation(''); setNewSiteEmail(''); setNewSiteLicenseKey('');
      await fetchSites();
    } catch (err: any) {
      console.error('Add site error:', err);
      alert(err?.message || 'Failed to add site');
    } finally {
      setFormLoading(false);
    }
  }, [fleetCall, fetchSites, newSiteName, newSiteCompany, newSiteLocation, newSiteEmail, newSiteLicenseKey]);

  const startEditSite = (site: FleetSite, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSiteId(site.id);
    setEditName(site.name);
    setEditCompany(site.company || '');
    setEditLocation(site.location || '');
    setEditEmail(site.contact_email || '');
    setEditLicenseKey(site.licenses?.product_key || '');
  };

  const handleEditSite = useCallback(async () => {
    if (!editingSiteId || !editName.trim()) return;
    setEditLoading(true);
    try {
      const result = await fleetCall('edit-site', undefined, {
        site_id: editingSiteId,
        name: editName.trim(),
        company: editCompany.trim() || null,
        location: editLocation.trim() || null,
        contact_email: editEmail.trim() || null,
        license_key: editLicenseKey.trim() || '',
      });
      setEditingSiteId(null);
      await fetchSites();
      // If we're inside a site detail, update selectedSite
      if (selectedSite?.id === editingSiteId && result.site) {
        setSelectedSite(result.site);
      }
    } catch (err: any) {
      console.error('Edit site error:', err);
      alert(err?.message || 'Failed to update site');
    } finally {
      setEditLoading(false);
    }
  }, [fleetCall, fetchSites, editingSiteId, editName, editCompany, editLocation, editEmail, editLicenseKey, selectedSite]);

  const handleAddPrinter = useCallback(async () => {
    if (!selectedSite || !newPrinterName.trim() || !newPrinterIp.trim()) return;
    setFormLoading(true);
    try {
      await fleetCall('add-printer', undefined, {
        site_id: selectedSite.id,
        name: newPrinterName.trim(),
        ip_address: newPrinterIp.trim(),
        port: parseInt(newPrinterPort) || 23,
      });
      setShowAddPrinter(false);
      setNewPrinterName(''); setNewPrinterIp(''); setNewPrinterPort('23');
      await fetchSites();
      // Refresh selectedSite from updated sites
      const freshSites = await fleetCall('sites');
      const freshSite = freshSites.sites?.find((s: FleetSite) => s.id === selectedSite.id);
      if (freshSite) setSelectedSite(freshSite);
    } catch (err) {
      console.error('Add printer error:', err);
    } finally {
      setFormLoading(false);
    }
  }, [fleetCall, fetchSites, selectedSite, newPrinterName, newPrinterIp, newPrinterPort]);

  const handleDeletePrinter = useCallback(async (printerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this printer and all its telemetry data?')) return;
    try {
      await fleetCall('delete-printer', undefined, { printer_id: printerId });
      await fetchSites();
      if (selectedSite) {
        const freshSites = await fleetCall('sites');
        const freshSite = freshSites.sites?.find((s: FleetSite) => s.id === selectedSite.id);
        if (freshSite) setSelectedSite(freshSite);
      }
    } catch (err) {
      console.error('Delete printer error:', err);
    }
  }, [fleetCall, fetchSites, selectedSite]);

  useEffect(() => {
    void fetchSites();
  }, [fetchSites]);

  const handleSelectPrinter = (printer: FleetPrinter) => {
    setSelectedPrinter(printer);
    fetchPrinterDetail(printer);
  };

  const totalPrinters = sites.reduce((sum, s) => sum + s.fleet_printers.length, 0);
  const onlinePrinters = sites.reduce((sum, s) => sum + s.fleet_printers.filter(p => p.status === 'online').length, 0);
  const errorPrinters = sites.reduce((sum, s) => sum + s.fleet_printers.filter(p => p.status === 'error').length, 0);
  const offlinePrinters = totalPrinters - onlinePrinters - errorPrinters;

  // ─────────── Printer Detail View ───────────
  if (selectedPrinter) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Header bar */}
        <div className="border-b border-border bg-card/80 backdrop-blur-sm px-4 md:px-8 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => { setSelectedPrinter(null); setTelemetry(null); setEvents([]); setTelemetryHistory([]); }}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to {selectedSite?.name || 'sites'}
              </button>
              <div className="h-5 w-px bg-border" />
              <div className="flex items-center gap-2.5">
                <StatusDot status={selectedPrinter.status} />
                <span className="text-lg font-semibold text-foreground">{selectedPrinter.name}</span>
                <Badge variant="outline" className="text-[10px] font-mono capitalize">{selectedPrinter.status}</Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => fetchPrinterDetail(selectedPrinter)} disabled={detailLoading}>
                <RefreshCw className={cn("w-4 h-4 mr-1.5", detailLoading && "animate-spin")} />
                Refresh
              </Button>
              <ThemeToggle />
              <FleetTelemetryLogo size="sm" />
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
            {/* Info cards row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'IP Address', value: `${selectedPrinter.ip_address}:${selectedPrinter.port}`, icon: Wifi, bg: 'bg-blue-500/10 text-blue-600' },
                { label: 'Serial', value: selectedPrinter.serial_number || 'N/A', icon: Cpu, bg: 'bg-muted text-muted-foreground' },
                { label: 'Firmware', value: selectedPrinter.firmware_version || '?', icon: Server, bg: 'bg-emerald-500/10 text-emerald-600' },
                { label: 'Last Seen', value: selectedPrinter.last_seen ? getRelativeTime(selectedPrinter.last_seen) : 'Never', icon: Clock, bg: 'bg-amber-500/10 text-amber-600' },
              ].map(item => (
                <div key={item.label} className="bg-card border border-border rounded-2xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", item.bg)}>
                      <item.icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{item.label}</span>
                  </div>
                  <span className="text-base font-mono font-bold text-foreground">{item.value}</span>
                </div>
              ))}
            </div>

            {detailLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading telemetry data...</span>
              </div>
            ) : (
              <Tabs defaultValue="live" className="w-full">
                <TabsList className="w-full max-w-lg grid grid-cols-3 h-11">
                  <TabsTrigger value="live" className="text-sm gap-1.5">
                    <Activity className="w-4 h-4" />Live Telemetry
                  </TabsTrigger>
                  <TabsTrigger value="events" className="text-sm gap-1.5">
                    <History className="w-4 h-4" />Event Log
                  </TabsTrigger>
                  <TabsTrigger value="firmware" className="text-sm gap-1.5">
                    <ArrowUpCircle className="w-4 h-4" />OTA Update
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="live" className="mt-6">
                  {telemetry ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Subsystems */}
                      <div className="bg-card border border-border rounded-2xl p-5">
                        <h4 className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" /> Subsystem Status
                        </h4>
                        <div className="flex gap-3">
                          {[
                            { label: 'High Voltage', on: telemetry.hv_on },
                            { label: 'Ink Jet', on: telemetry.jet_running },
                          ].map(s => (
                            <div key={s.label} className={cn(
                              "flex-1 px-4 py-3 rounded-xl text-center font-semibold text-sm border transition-colors",
                              s.on 
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" 
                                : "bg-muted text-muted-foreground border-border"
                            )}>
                              <div className={cn("w-2.5 h-2.5 rounded-full mx-auto mb-1.5", s.on ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                              {s.label}
                              <div className="text-[10px] mt-0.5 font-mono">{s.on ? 'ACTIVE' : 'OFF'}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Diagnostics */}
                      <div className="bg-card border border-border rounded-2xl p-5">
                        <h4 className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-1.5">
                          <Gauge className="w-3.5 h-3.5" /> Diagnostics
                        </h4>
                        <MetricRow label="Pressure" value={telemetry.pressure.toFixed(1)} unit="PSI" 
                          status={telemetry.pressure >= 38 && telemetry.pressure <= 45 ? 'good' : 'warn'} />
                        <MetricRow label="Viscosity" value={telemetry.viscosity.toFixed(2)} unit="cP" />
                        <MetricRow label="RPS" value={telemetry.rps.toFixed(1)} unit="rev/s" 
                          status={telemetry.rps > 0 ? 'good' : 'warn'} />
                        <MetricRow label="Modulation" value={telemetry.modulation} unit="V" />
                        <MetricRow label="Charge" value={telemetry.charge} unit="%"
                          status={telemetry.charge >= 90 ? 'good' : telemetry.charge >= 70 ? 'warn' : 'error'} />
                        <MetricRow label="Phase Qual" value={telemetry.phase_qual} unit="%"
                          status={telemetry.phase_qual >= 80 ? 'good' : 'warn'} />
                      </div>

                      {/* Temperature */}
                      <div className="bg-card border border-border rounded-2xl p-5">
                        <h4 className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-1.5">
                          <Thermometer className="w-3.5 h-3.5" /> Temperature
                        </h4>
                        <MetricRow label="Printhead" value={telemetry.printhead_temp.toFixed(1)} unit="°C" />
                        <MetricRow label="Electronics" value={telemetry.electronics_temp.toFixed(1)} unit="°C" />
                      </div>

                      {/* Consumables */}
                      <div className="bg-card border border-border rounded-2xl p-5">
                        <h4 className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-1.5">
                          <Droplets className="w-3.5 h-3.5" /> Consumables
                        </h4>
                        {[
                          { label: 'Ink Level', level: telemetry.ink_level },
                          { label: 'Makeup Level', level: telemetry.makeup_level },
                        ].map(c => (
                          <div key={c.label} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                            <span className="text-sm text-muted-foreground">{c.label}</span>
                            <Badge className={cn(
                              "text-xs font-mono font-bold",
                              (c.level === 'FULL' || c.level === 'GOOD') ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
                              c.level === 'LOW' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
                              'bg-red-500/10 text-red-500 border-red-500/30'
                            )}>{c.level}</Badge>
                          </div>
                        ))}
                        {/* Filter Life */}
                        <div className="flex items-center justify-between py-2 border-t border-border/40 mt-1">
                          <span className="text-sm text-muted-foreground">Filter Life</span>
                          {telemetry.filter_hours_remaining != null ? (
                            <Badge className={cn(
                              "text-xs font-mono font-bold",
                              telemetry.filter_hours_remaining > 500 ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
                              telemetry.filter_hours_remaining > 200 ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
                              'bg-red-500/10 text-red-500 border-red-500/30'
                            )}>{telemetry.filter_hours_remaining.toLocaleString()}h</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono">N/A</span>
                          )}
                        </div>
                      </div>

                      {/* Runtime */}
                      <div className="bg-card border border-border rounded-2xl p-5 md:col-span-2">
                        <h4 className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-1.5">
                          <BarChart3 className="w-3.5 h-3.5" /> Runtime Statistics
                        </h4>
                        <div className="grid grid-cols-2 gap-x-8">
                          <MetricRow label="Power Hours" value={telemetry.power_hours} />
                          <MetricRow label="Stream Hours" value={telemetry.stream_hours} />
                          <MetricRow label="Print Count" value={telemetry.print_count.toLocaleString()} />
                          <MetricRow label="Current Message" value={telemetry.current_message || 'None'} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-16">No telemetry data available</div>
                  )}
                </TabsContent>

                <TabsContent value="events" className="mt-6">
                  <EventLogTable events={events} telemetryHistory={telemetryHistory} />
                </TabsContent>

                <TabsContent value="firmware" className="mt-6">
                  <div className="max-w-2xl">
                    <FirmwareUpdatePanel printer={selectedPrinter} firmware={firmware} />
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // ─────────── Site Detail View ───────────
  if (selectedSite) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="border-b border-border bg-card/80 backdrop-blur-sm px-4 md:px-8 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedSite(null)}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                All Sites
              </button>
              <div className="h-5 w-px bg-border" />
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-primary" />
                <span className="text-lg font-semibold text-foreground">{selectedSite.name}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={fetchSites} disabled={loading}>
                <RefreshCw className={cn("w-4 h-4 mr-1.5", loading && "animate-spin")} />
                Refresh
              </Button>
              <ThemeToggle />
              <FleetTelemetryLogo size="sm" />
            </div>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
            {/* Site info banner */}
            <div className="bg-gradient-to-r from-blue-600/5 via-emerald-500/5 to-transparent border border-border rounded-2xl p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {selectedSite.company && (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Company</div>
                      <div className="text-sm font-medium text-foreground">{selectedSite.company}</div>
                    </div>
                  </div>
                )}
                {selectedSite.location && (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Location</div>
                      <div className="text-sm font-medium text-foreground">{selectedSite.location}</div>
                    </div>
                  </div>
                )}
                {selectedSite.contact_email && (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Contact</div>
                      <div className="text-sm font-medium text-foreground">{selectedSite.contact_email}</div>
                    </div>
                  </div>
                )}
                {selectedSite.licenses && (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
                      <Key className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest">License ({selectedSite.licenses.tier})</div>
                      <div className="text-sm font-medium font-mono text-foreground">{selectedSite.licenses.product_key}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Printers Grid */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  {selectedSite.fleet_printers.length} Printer{selectedSite.fleet_printers.length !== 1 ? 's' : ''} Installed
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowAddPrinter(true)} className="text-xs gap-1.5">
                  <Plus className="w-4 h-4" />
                  Add Printer
                </Button>
              </div>

              {showAddPrinter && (
                <div className="bg-card border border-primary/20 rounded-2xl p-5 space-y-3 mb-4">
                  <h3 className="text-sm font-semibold text-foreground">Add Printer</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground"
                      placeholder="Printer name (e.g. Line 1 Coder) *"
                      value={newPrinterName}
                      onChange={e => setNewPrinterName(e.target.value)}
                    />
                    <input
                      className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground font-mono"
                      placeholder="IP address (e.g. 192.168.1.10) *"
                      value={newPrinterIp}
                      onChange={e => setNewPrinterIp(e.target.value)}
                    />
                    <input
                      className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground font-mono"
                      placeholder="Port (default 23)"
                      value={newPrinterPort}
                      onChange={e => setNewPrinterPort(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button size="sm" onClick={handleAddPrinter} disabled={formLoading || !newPrinterName.trim() || !newPrinterIp.trim()} className="gap-1.5">
                      {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Add Printer
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddPrinter(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedSite.fleet_printers.map(printer => (
                  <button
                    key={printer.id}
                    onClick={() => handleSelectPrinter(printer)}
                    className="text-left bg-card border border-border rounded-2xl p-5 hover:border-primary/30 hover:shadow-lg transition-all group"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <StatusDot status={printer.status} />
                        <span className="text-base font-semibold text-foreground">{printer.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleDeletePrinter(printer.id, e)}
                          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                          title="Delete printer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                      <span className="text-muted-foreground">IP</span>
                      <span className="font-mono text-foreground text-right">{printer.ip_address}</span>
                      <span className="text-muted-foreground">Firmware</span>
                      <span className="font-mono text-foreground text-right">{printer.firmware_version || '?'}</span>
                      <span className="text-muted-foreground">Serial</span>
                      <span className="font-mono text-foreground text-right">{printer.serial_number || 'N/A'}</span>
                      <span className="text-muted-foreground">Last Seen</span>
                      <span className="text-foreground text-right">{printer.last_seen ? getRelativeTime(printer.last_seen) : 'Never'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // ─────────── Fleet Overview (Landing) ───────────
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/80 backdrop-blur-sm px-4 md:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onHome}
              className="industrial-button text-white px-3 py-2.5 rounded-xl flex items-center justify-center"
            >
              <Home className="w-5 h-5" />
            </button>
            <FleetTelemetryLogo />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchSites} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
          {/* Hero stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Printers" value={totalPrinters} icon={Server} color="bg-blue-600" subtitle="Across all sites" />
            <StatCard label="Online" value={onlinePrinters} icon={Wifi} color="bg-emerald-500" subtitle="Connected & reporting" />
            <StatCard label="Offline" value={offlinePrinters} icon={WifiOff} color="bg-muted-foreground/60" subtitle="Not connected" />
            <StatCard label="Errors" value={errorPrinters} icon={AlertTriangle} color={errorPrinters > 0 ? "bg-red-500" : "bg-muted-foreground/40"} subtitle={errorPrinters > 0 ? "Attention required" : "All clear"} />
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Loading fleet data...</span>
            </div>
          ) : sites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <NetworkAnimation />
              <div className="text-center max-w-md">
                <h2 className="text-xl font-bold text-foreground mb-2">Welcome to Fleet Telemetry™</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Remote monitoring, diagnostics, and over-the-air firmware updates for your entire printer network — from anywhere.
                </p>
              </div>
              <div className="bg-card border border-primary/20 rounded-2xl p-6 space-y-4 w-full max-w-lg">
                <h3 className="text-sm font-semibold text-foreground">Add Company Site</h3>
                <div className="grid grid-cols-1 gap-3">
                  <input
                    className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground"
                    placeholder="Company / Site name (e.g. Sunrise Eggs Ltd) *"
                    value={newSiteName}
                    onChange={e => setNewSiteName(e.target.value)}
                  />
                  <input
                    className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground"
                    placeholder="Location (e.g. Cork, Ireland)"
                    value={newSiteLocation}
                    onChange={e => setNewSiteLocation(e.target.value)}
                  />
                  <input
                    className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground"
                    placeholder="Contact email"
                    value={newSiteEmail}
                    onChange={e => setNewSiteEmail(e.target.value)}
                  />
                  <input
                    className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground font-mono"
                    placeholder="License key (e.g. XXXXX-XXXXX-XXXXX-XXXXX)"
                    value={newSiteLicenseKey}
                    onChange={e => setNewSiteLicenseKey(e.target.value)}
                  />
                </div>
                <Button onClick={handleAddSite} disabled={!newSiteName.trim()} size="sm" className="w-full gap-1.5">
                  <Plus className="w-4 h-4" />
                  Add Site
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm text-muted-foreground uppercase tracking-widest font-medium">
                  {sites.length} Customer Site{sites.length !== 1 ? 's' : ''}
                </h2>
                <Button variant="outline" size="sm" onClick={() => setShowAddSite(true)} className="text-xs gap-1.5">
                  <Plus className="w-4 h-4" />
                  Add Company
                </Button>
              </div>

              {/* Add Company Form */}
              {showAddSite && (
                <div className="bg-card border border-primary/20 rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Add New Customer Site</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground"
                      placeholder="Company / Site name (e.g. Sunrise Eggs Ltd) *"
                      value={newSiteName}
                      onChange={e => setNewSiteName(e.target.value)}
                    />
                    <input
                      className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground"
                      placeholder="Location (e.g. Cork, Ireland)"
                      value={newSiteLocation}
                      onChange={e => setNewSiteLocation(e.target.value)}
                    />
                    <input
                      className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground"
                      placeholder="Contact email"
                      value={newSiteEmail}
                      onChange={e => setNewSiteEmail(e.target.value)}
                    />
                    <input
                      className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground font-mono"
                      placeholder="License key (e.g. XXXXX-XXXXX-XXXXX-XXXXX)"
                      value={newSiteLicenseKey}
                      onChange={e => setNewSiteLicenseKey(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button size="sm" onClick={handleAddSite} disabled={formLoading || !newSiteName.trim()} className="gap-1.5">
                      {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Add Site
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddSite(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {sites.map(site => {
                  const online = site.fleet_printers.filter(p => p.status === 'online').length;
                  const errors = site.fleet_printers.filter(p => p.status === 'error').length;
                  const total = site.fleet_printers.length;

                  return (
                    <div
                      key={site.id}
                      className="text-left bg-card border border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-xl transition-all group"
                    >
                      {editingSiteId === site.id ? (
                        /* ── Inline Edit Form ── */
                        <div className="space-y-3" onClick={e => e.stopPropagation()}>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Edit Site</h4>
                          <input
                            className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground"
                            placeholder="Site name *"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                          />
                          <input
                            className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground"
                            placeholder="Company"
                            value={editCompany}
                            onChange={e => setEditCompany(e.target.value)}
                          />
                          <input
                            className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground"
                            placeholder="Location"
                            value={editLocation}
                            onChange={e => setEditLocation(e.target.value)}
                          />
                          <input
                            className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground"
                            placeholder="Contact email"
                            value={editEmail}
                            onChange={e => setEditEmail(e.target.value)}
                          />
                          <input
                            className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background text-foreground placeholder:text-muted-foreground font-mono"
                            placeholder="License key (XXXXX-XXXXX-XXXXX-XXXXX)"
                            value={editLicenseKey}
                            onChange={e => setEditLicenseKey(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleEditSite} disabled={editLoading || !editName.trim()} className="gap-1.5">
                              {editLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingSiteId(null)}>
                              <X className="w-3 h-3 mr-1" />Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* ── Normal Card View ── */
                        <button
                          onClick={() => setSelectedSite(site)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center">
                                <Building2 className="w-6 h-6 text-primary" />
                              </div>
                              <div>
                                <span className="text-base font-bold text-foreground block">{site.name}</span>
                                <span className="text-xs text-muted-foreground">{site.location || site.company || '—'}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {site.licenses && (
                                <Badge variant="outline" className="text-[10px] font-semibold uppercase px-2 py-0.5">
                                  {site.licenses.tier}
                                </Badge>
                              )}
                              <button
                                onClick={(e) => startEditSite(site, e)}
                                className="p-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                                title="Edit site"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteSite(site.id, e); }}
                                className="p-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                                title="Delete site"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                          </div>
                          
                          {/* Mini printer status bar */}
                          <div className="flex items-center gap-1 mb-3">
                            {site.fleet_printers.map(p => (
                              <div key={p.id} className={cn(
                                "h-1.5 flex-1 rounded-full",
                                p.status === 'online' && "bg-emerald-500",
                                p.status === 'offline' && "bg-muted-foreground/20",
                                p.status === 'error' && "bg-red-500"
                              )} />
                            ))}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">{total} printer{total !== 1 ? 's' : ''}</span>
                            {site.licenses && (
                              <>
                                <span className="text-xs font-mono text-muted-foreground">{site.licenses.product_key}</span>
                                <span className="text-xs text-muted-foreground/60">Issued {new Date(site.licenses.created_at).toLocaleDateString()}</span>
                              </>
                            )}
                            <div className="flex-1" />
                            {online > 0 && (
                              <Badge variant="outline" className="text-[10px] bg-emerald-500/5 text-emerald-600 border-emerald-500/20 px-2 py-0.5">
                                {online} online
                              </Badge>
                            )}
                            {errors > 0 && (
                              <Badge variant="outline" className="text-[10px] bg-red-500/5 text-red-500 border-red-500/20 px-2 py-0.5">
                                {errors} error
                              </Badge>
                            )}
                          </div>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
