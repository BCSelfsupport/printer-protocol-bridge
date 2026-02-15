import { useState, useEffect, useCallback } from 'react';
import { 
  Globe, Building2, Activity, AlertTriangle, 
  ChevronRight, ChevronLeft, RefreshCw, Thermometer, 
  Droplets, Gauge, Zap, Clock, Upload, 
  CheckCircle2, XCircle, Loader2, Radio, Database,
  ArrowUpCircle, History, Wifi, WifiOff, MapPin,
  Mail, Server, Cpu, BarChart3, Shield, Eye,
  Home, Signal, ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// ────────────────────────────────── Types ──────────────────────────────────

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

// ────────────────────────────────── Helpers ──────────────────────────────────

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

// ────────────────────────────────── Sub-components ──────────────────────────────────

function TelemetryLogo({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const isLg = size === 'lg';
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "rounded-lg flex items-center justify-center",
        "bg-gradient-to-br from-[hsl(207,90%,45%)] to-[hsl(160,60%,40%)]",
        isLg ? "w-9 h-9" : "w-7 h-7"
      )}>
        <Signal className={cn("text-white", isLg ? "w-5 h-5" : "w-4 h-4")} />
      </div>
      <div className="flex flex-col leading-none">
        <span className={cn(
          "font-bold tracking-tight text-foreground",
          isLg ? "text-lg" : "text-sm"
        )}>
          Telemetry<sup className="text-[8px] align-super ml-0.5">™</sup>
        </span>
        <span className={cn(
          "text-muted-foreground tracking-widest uppercase",
          isLg ? "text-[9px]" : "text-[8px]"
        )}>
          by CodeSync
        </span>
      </div>
    </div>
  );
}

function StatusDot({ status, pulse = false }: { status: string; pulse?: boolean }) {
  return (
    <div className={cn(
      "w-2.5 h-2.5 rounded-full flex-shrink-0",
      status === 'online' && "bg-green-500 shadow-sm shadow-green-500/50",
      status === 'offline' && "bg-muted-foreground/40",
      status === 'error' && "bg-red-500 shadow-sm shadow-red-500/50",
      pulse && status === 'online' && "animate-pulse"
    )} />
  );
}

function MetricRow({ label, value, unit, status }: { label: string; value: string | number; unit?: string; status?: 'good' | 'warn' | 'error' }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn(
        "font-mono text-xs font-semibold",
        status === 'good' && "text-green-600",
        status === 'warn' && "text-yellow-600",
        status === 'error' && "text-red-600",
        !status && "text-foreground"
      )}>
        {value}{unit && <span className="text-muted-foreground/60 ml-1 text-[10px] font-normal">{unit}</span>}
      </span>
    </div>
  );
}

function EventRow({ event }: { event: FleetEvent }) {
  const severityStyles = {
    info: { icon: <Activity className="w-3.5 h-3.5 text-primary" />, bg: 'bg-primary/5 border-primary/20' },
    warning: { icon: <AlertTriangle className="w-3.5 h-3.5 text-warning" />, bg: 'bg-warning/5 border-warning/20' },
    error: { icon: <XCircle className="w-3.5 h-3.5 text-destructive" />, bg: 'bg-destructive/5 border-destructive/20' },
  };
  const style = severityStyles[event.severity as keyof typeof severityStyles] || severityStyles.info;

  return (
    <div className={cn("flex items-start gap-3 p-3 rounded-lg border", style.bg)}>
      <div className="mt-0.5">{style.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground leading-relaxed">{event.message}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{event.event_type}</Badge>
          <span className="text-[10px] text-muted-foreground">{getRelativeTime(event.occurred_at)}</span>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────── Firmware Update Simulator ──────────────────────────────────

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
    <div className="space-y-4">
      {/* Current vs Target */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Installed</div>
          <div className="text-lg font-mono font-bold text-foreground">{printer.firmware_version || '?'}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Latest Available</div>
          <div className="text-lg font-mono font-bold text-primary">{latestFw?.version || '—'}</div>
        </div>
      </div>

      {/* Update action */}
      {completed ? (
        <div className="flex items-center gap-3 bg-success/10 border border-success/30 rounded-xl p-4">
          <CheckCircle2 className="w-6 h-6 text-success flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-success">Update Successful</p>
            <p className="text-xs text-muted-foreground">Firmware {targetFw?.version} installed. Printer restarting...</p>
          </div>
        </div>
      ) : updating ? (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">OTA Update in Progress</span>
            <span className="text-sm font-mono font-bold text-primary">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2.5" />
          <p className="text-[11px] text-muted-foreground font-mono">{stage}</p>
          {progress > 20 && progress < 85 && (
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
              <span>Transfer: {(0.6 + Math.random() * 0.5).toFixed(1)} MB/s</span>
              <span>ETA: {Math.ceil((100 - progress) * 0.1)}s</span>
            </div>
          )}
        </div>
      ) : (
        <>
          {needsUpdate && (
            <Button onClick={simulateUpdate} disabled={printer.status === 'offline'} className="w-full h-11">
              <Upload className="w-4 h-4 mr-2" />
              Deploy {targetFw?.version} via OTA
            </Button>
          )}
          {!needsUpdate && !selectedFw && (
            <div className="text-center text-xs text-success py-3 bg-success/5 rounded-xl border border-success/20">
              <CheckCircle2 className="w-4 h-4 mx-auto mb-1" />
              Running latest firmware
            </div>
          )}
        </>
      )}

      {/* Version selector */}
      {firmware.length > 1 && !updating && !completed && (
        <div className="space-y-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Select Version</div>
          <div className="grid grid-cols-1 gap-2">
            {firmware.filter(f => f.version !== printer.firmware_version).map(fw => (
              <button
                key={fw.id}
                onClick={() => setSelectedFw(fw)}
                className={cn(
                  "text-left p-3 rounded-lg border transition-all",
                  selectedFw?.id === fw.id
                    ? "bg-primary/5 border-primary/40"
                    : "bg-card border-border hover:border-primary/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-foreground">{fw.version}</span>
                    {fw.is_latest && <Badge className="text-[9px] bg-primary/10 text-primary border-primary/20 px-1.5 py-0">LATEST</Badge>}
                  </div>
                  {fw.file_size && <span className="text-[10px] text-muted-foreground">{(fw.file_size / 1024 / 1024).toFixed(1)} MB</span>}
                </div>
                {fw.release_notes && <p className="text-[10px] text-muted-foreground mt-1">{fw.release_notes}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────── Main Screen ──────────────────────────────────

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

  // ──── Printer Detail View ────
  if (selectedPrinter) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b border-border bg-card px-4 md:px-8 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => { setSelectedPrinter(null); setTelemetry(null); setEvents([]); }}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <div className="h-5 w-px bg-border" />
              <div className="flex items-center gap-2">
                <StatusDot status={selectedPrinter.status} pulse />
                <span className="text-base font-semibold text-foreground">{selectedPrinter.name}</span>
              </div>
            </div>
            <TelemetryLogo size="sm" />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
            {/* Printer Info Header */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'IP Address', value: `${selectedPrinter.ip_address}:${selectedPrinter.port}`, icon: Wifi },
                { label: 'Serial Number', value: selectedPrinter.serial_number || 'N/A', icon: Cpu },
                { label: 'Firmware', value: selectedPrinter.firmware_version || 'Unknown', icon: Server },
                { label: 'Last Seen', value: selectedPrinter.last_seen ? getRelativeTime(selectedPrinter.last_seen) : 'Never', icon: Clock },
              ].map(item => (
                <div key={item.label} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <item.icon className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</span>
                  </div>
                  <span className="text-sm font-mono font-semibold text-foreground">{item.value}</span>
                </div>
              ))}
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <Tabs defaultValue="live" className="w-full">
                <TabsList className="grid grid-cols-3 w-full max-w-md">
                  <TabsTrigger value="live" className="text-xs">
                    <Activity className="w-3.5 h-3.5 mr-1.5" />Live Telemetry
                  </TabsTrigger>
                  <TabsTrigger value="events" className="text-xs">
                    <History className="w-3.5 h-3.5 mr-1.5" />Event Log
                  </TabsTrigger>
                  <TabsTrigger value="firmware" className="text-xs">
                    <ArrowUpCircle className="w-3.5 h-3.5 mr-1.5" />OTA Update
                  </TabsTrigger>
                </TabsList>

                {/* Live Telemetry */}
                <TabsContent value="live" className="mt-6">
                  {telemetry ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Subsystems */}
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Zap className="w-3 h-3" /> Subsystems
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { label: 'HV', on: telemetry.hv_on },
                            { label: 'JET', on: telemetry.jet_running },
                          ].map(s => (
                            <div key={s.label} className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold border",
                              s.on ? "bg-success/10 text-success border-success/30" : "bg-muted text-muted-foreground border-border"
                            )}>
                              {s.label}: {s.on ? 'ON' : 'OFF'}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Diagnostics */}
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Gauge className="w-3 h-3" /> Diagnostics
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
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Thermometer className="w-3 h-3" /> Temperature
                        </h4>
                        <MetricRow label="Printhead" value={telemetry.printhead_temp.toFixed(1)} unit="°C" />
                        <MetricRow label="Electronics" value={telemetry.electronics_temp.toFixed(1)} unit="°C" />
                      </div>

                      {/* Consumables */}
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Droplets className="w-3 h-3" /> Consumables
                        </h4>
                        <div className="space-y-3">
                          {[
                            { label: 'Ink', level: telemetry.ink_level },
                            { label: 'Makeup', level: telemetry.makeup_level },
                          ].map(c => (
                            <div key={c.label} className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">{c.label}</span>
                              <Badge className={cn(
                                "text-[10px] font-mono",
                                (c.level === 'FULL' || c.level === 'GOOD') ? 'bg-success/10 text-success border-success/30' :
                                c.level === 'LOW' ? 'bg-warning/10 text-warning border-warning/30' :
                                'bg-destructive/10 text-destructive border-destructive/30'
                              )}>{c.level}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Runtime */}
                      <div className="bg-card border border-border rounded-xl p-4 md:col-span-2">
                        <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <BarChart3 className="w-3 h-3" /> Runtime Statistics
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
                    <div className="text-sm text-muted-foreground text-center py-12">No telemetry data available</div>
                  )}
                </TabsContent>

                {/* Events */}
                <TabsContent value="events" className="mt-6">
                  {events.length > 0 ? (
                    <div className="space-y-2 max-w-2xl">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">
                        {events.length} Events Recorded
                      </div>
                      {events.map(evt => <EventRow key={evt.id} event={evt} />)}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-12">No events recorded</div>
                  )}
                </TabsContent>

                {/* OTA Firmware */}
                <TabsContent value="firmware" className="mt-6">
                  <div className="max-w-xl">
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

  // ──── Site Detail View ────
  if (selectedSite) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedSite(null)}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                All Sites
              </button>
              <div className="h-5 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-foreground" />
                <span className="text-base font-semibold text-foreground">{selectedSite.name}</span>
              </div>
            </div>
            <TelemetryLogo size="sm" />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
            {/* Site info */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                {selectedSite.company && (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{selectedSite.company}</span>
                  </div>
                )}
                {selectedSite.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{selectedSite.location}</span>
                  </div>
                )}
                {selectedSite.contact_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{selectedSite.contact_email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Printers Grid */}
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">
                {selectedSite.fleet_printers.length} Printer{selectedSite.fleet_printers.length !== 1 ? 's' : ''} Installed
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {selectedSite.fleet_printers.map(printer => (
                  <button
                    key={printer.id}
                    onClick={() => handleSelectPrinter(printer)}
                    className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <StatusDot status={printer.status} />
                        <span className="text-sm font-semibold text-foreground">{printer.name}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div className="grid grid-cols-2 gap-y-1 text-[11px]">
                      <span className="text-muted-foreground">IP</span>
                      <span className="font-mono text-foreground">{printer.ip_address}</span>
                      <span className="text-muted-foreground">Firmware</span>
                      <span className="font-mono text-foreground">{printer.firmware_version || '?'}</span>
                      <span className="text-muted-foreground">S/N</span>
                      <span className="font-mono text-foreground">{printer.serial_number || 'N/A'}</span>
                      <span className="text-muted-foreground">Last Seen</span>
                      <span className="text-foreground">{printer.last_seen ? getRelativeTime(printer.last_seen) : 'Never'}</span>
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

  // ──── Fleet Overview ────
  return (
    <div className="flex flex-col h-full">
      {/* Top Header */}
      <div className="border-b border-border bg-card px-4 md:px-8 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onHome}
              className="industrial-button text-white px-2 py-2 md:px-3 md:py-2 rounded-lg flex items-center justify-center"
            >
              <Home className="w-5 h-5 md:w-6 md:h-6" />
            </button>
            <TelemetryLogo />
          </div>
          <Button variant="ghost" size="sm" onClick={fetchSites} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Printers', value: totalPrinters, icon: Server, color: 'text-foreground' },
              { label: 'Online', value: onlinePrinters, icon: Wifi, color: 'text-success' },
              { label: 'Offline', value: offlinePrinters, icon: WifiOff, color: 'text-muted-foreground' },
              { label: 'Errors', value: errorPrinters, icon: AlertTriangle, color: errorPrinters > 0 ? 'text-destructive' : 'text-muted-foreground' },
            ].map(stat => (
              <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <stat.icon className={cn("w-4 h-4", stat.color)} />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</span>
                </div>
                <span className={cn("text-2xl font-bold", stat.color)}>{stat.value}</span>
              </div>
            ))}
          </div>

          {/* Sites */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : sites.length === 0 ? (
            <div className="text-center py-16 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Signal className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">No Fleet Data</p>
                <p className="text-xs text-muted-foreground mb-4">Load demonstration data to explore the Telemetry™ module</p>
              </div>
              <Button onClick={seedDemoData} disabled={seeding} size="lg">
                {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
                Load Exhibition Demo Data
              </Button>
            </div>
          ) : (
            <>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {sites.length} Customer Site{sites.length !== 1 ? 's' : ''}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sites.map(site => {
                  const online = site.fleet_printers.filter(p => p.status === 'online').length;
                  const errors = site.fleet_printers.filter(p => p.status === 'error').length;
                  const total = site.fleet_printers.length;

                  return (
                    <button
                      key={site.id}
                      onClick={() => setSelectedSite(site)}
                      className="text-left bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-lg transition-all group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-foreground block">{site.name}</span>
                            <span className="text-[11px] text-muted-foreground">{site.location || site.company || '—'}</span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] text-muted-foreground">{total} printer{total !== 1 ? 's' : ''}</span>
                        <div className="flex-1" />
                        {online > 0 && <Badge variant="outline" className="text-[9px] bg-success/5 text-success border-success/20 px-1.5 py-0">{online} online</Badge>}
                        {errors > 0 && <Badge variant="outline" className="text-[9px] bg-destructive/5 text-destructive border-destructive/20 px-1.5 py-0">{errors} error</Badge>}
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
