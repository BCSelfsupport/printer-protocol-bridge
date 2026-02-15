import { useState, useEffect, useCallback } from 'react';
import { 
  Building2, Activity, AlertTriangle, 
  ChevronRight, RefreshCw, Thermometer, 
  Droplets, Gauge, Zap, Clock, Upload, 
  CheckCircle2, XCircle, Loader2, Database,
  ArrowUpCircle, History, Wifi, WifiOff, MapPin,
  Mail, Server, Cpu, BarChart3, Signal,
  Home, ArrowLeft, Radio
} from 'lucide-react';
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
}

interface FleetEvent {
  id: string;
  event_type: string;
  severity: string;
  message: string;
  occurred_at: string;
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

function EventRow({ event }: { event: FleetEvent }) {
  const styles: Record<string, { icon: React.ReactNode; ring: string }> = {
    info: { icon: <Activity className="w-4 h-4 text-blue-500" />, ring: 'ring-blue-500/20' },
    warning: { icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, ring: 'ring-amber-500/20' },
    error: { icon: <XCircle className="w-4 h-4 text-red-500" />, ring: 'ring-red-500/20' },
  };
  const s = styles[event.severity] || styles.info;

  return (
    <div className={cn("flex items-start gap-3 p-3.5 rounded-xl bg-card border border-border/50 hover:border-border transition-colors")}>
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center ring-2 flex-shrink-0", s.ring, "bg-card")}>
        {s.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-relaxed">{event.message}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono">{event.event_type}</Badge>
          <span className="text-[11px] text-muted-foreground">{getRelativeTime(event.occurred_at)}</span>
        </div>
      </div>
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
  const [firmware, setFirmware] = useState<Firmware[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const fleetCall = useCallback(async (action: string, params?: Record<string, string>) => {
    const query = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fleet-monitoring?${query}`,
      { 
        method: 'POST',
        headers: { 
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }
    );
    return res.json();
  }, []);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    try {
      const json = await fleetCall('sites');
      setSites(json.sites || []);
    } catch (err) {
      console.error('Fleet fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [fleetCall]);

  const fetchPrinterDetail = useCallback(async (printer: FleetPrinter) => {
    setDetailLoading(true);
    try {
      const [detail, fw] = await Promise.all([
        fleetCall('printer-detail', { printerId: printer.id }),
        fleetCall('firmware-list'),
      ]);
      setTelemetry(detail.telemetry || null);
      setEvents(detail.events || []);
      setFirmware(fw.firmware || []);
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

  useEffect(() => { fetchSites(); }, [fetchSites]);

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
                onClick={() => { setSelectedPrinter(null); setTelemetry(null); setEvents([]); }}
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
                  {events.length > 0 ? (
                    <div className="space-y-2 max-w-3xl">
                      <div className="text-xs text-muted-foreground uppercase tracking-widest mb-4">{events.length} Events</div>
                      {events.map(evt => <EventRow key={evt.id} event={evt} />)}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-16">No events recorded</div>
                  )}
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
              </div>
            </div>

            {/* Printers Grid */}
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4">
                {selectedSite.fleet_printers.length} Printer{selectedSite.fleet_printers.length !== 1 ? 's' : ''} Installed
              </div>
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
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
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
              <Button onClick={seedDemoData} disabled={seeding} size="lg" className="h-12 px-8 text-sm font-semibold">
                {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
                Load Exhibition Demo Data
              </Button>
              <p className="text-[11px] text-muted-foreground">Creates sample customer sites with printers for demonstration</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm text-muted-foreground uppercase tracking-widest font-medium">
                  {sites.length} Customer Site{sites.length !== 1 ? 's' : ''}
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {sites.map(site => {
                  const online = site.fleet_printers.filter(p => p.status === 'online').length;
                  const errors = site.fleet_printers.filter(p => p.status === 'error').length;
                  const total = site.fleet_printers.length;

                  return (
                    <button
                      key={site.id}
                      onClick={() => setSelectedSite(site)}
                      className="text-left bg-card border border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-xl transition-all group"
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
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
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

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{total} printer{total !== 1 ? 's' : ''}</span>
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
