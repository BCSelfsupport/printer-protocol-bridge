import { useState, useEffect, useCallback } from 'react';
import { 
  Globe, Building2, Printer, Activity, AlertTriangle, 
  ChevronRight, ChevronLeft, RefreshCw, Cpu, Thermometer, 
  Droplets, Gauge, Zap, Clock, FileText, Upload, 
  CheckCircle2, XCircle, Loader2, Radio, Database,
  ArrowUpCircle, History, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// Types
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

interface FirmwareUpdate {
  id: string;
  status: string;
  progress: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  fleet_firmware: Firmware;
}

// --- Sub-components ---

function StatusDot({ status }: { status: string }) {
  return (
    <div className={cn(
      "w-2.5 h-2.5 rounded-full",
      status === 'online' && "bg-green-500 shadow-sm shadow-green-500/50",
      status === 'offline' && "bg-gray-400",
      status === 'error' && "bg-red-500 shadow-sm shadow-red-500/50 animate-pulse"
    )} />
  );
}

function MetricRow({ label, value, unit, status }: { label: string; value: string | number; unit?: string; status?: 'good' | 'warn' | 'error' }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={cn(
        "font-mono font-medium",
        status === 'good' && "text-green-600",
        status === 'warn' && "text-yellow-600",
        status === 'error' && "text-red-600",
        !status && "text-gray-800"
      )}>
        {value}{unit && <span className="text-gray-400 ml-1 text-[10px]">{unit}</span>}
      </span>
    </div>
  );
}

function EventItem({ event }: { event: FleetEvent }) {
  const severityIcon = {
    info: <Activity className="w-3 h-3 text-blue-500" />,
    warning: <AlertTriangle className="w-3 h-3 text-yellow-500" />,
    error: <XCircle className="w-3 h-3 text-red-500" />,
  };
  const timeAgo = getRelativeTime(event.occurred_at);

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-0">
      {severityIcon[event.severity as keyof typeof severityIcon] || severityIcon.info}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-gray-700 leading-tight">{event.message}</div>
        <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] px-1 py-0">{event.event_type}</Badge>
          <span>{timeAgo}</span>
        </div>
      </div>
    </div>
  );
}

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

// --- Firmware Update Simulator (Phase 2 demo) ---
function FirmwareUpdateDemo({ 
  printer, 
  firmware 
}: { 
  printer: FleetPrinter; 
  firmware: Firmware[];
}) {
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
      { name: 'Establishing secure connection...', end: 5 },
      { name: 'Validating firmware package...', end: 10 },
      { name: 'Backing up current configuration...', end: 15 },
      { name: 'Erasing flash sectors...', end: 25 },
      { name: 'Uploading firmware binary...', end: 85 },
      { name: 'Verifying checksum...', end: 92 },
      { name: 'Writing boot sector...', end: 96 },
      { name: 'Restarting printer...', end: 100 },
    ];

    let currentStageIdx = 0;
    let currentProgress = 0;

    const interval = setInterval(() => {
      const currentStage = stages[currentStageIdx];
      if (!currentStage) {
        clearInterval(interval);
        setStage('Update complete! Printer restarting...');
        setCompleted(true);
        setUpdating(false);
        return;
      }

      setStage(currentStage.name);

      if (currentProgress < currentStage.end) {
        // Variable speed: uploading stage is slower
        const increment = currentStageIdx === 4 ? 0.5 : 2;
        currentProgress = Math.min(currentProgress + increment, currentStage.end);
        setProgress(Math.round(currentProgress));
      } else {
        currentStageIdx++;
      }
    }, 100);

    return () => clearInterval(interval);
  }, [targetFw]);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <ArrowUpCircle className="w-4 h-4 text-blue-600" />
        <span className="text-xs font-semibold text-gray-700">Firmware Update</span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Current:</span>
        <Badge variant="outline" className="text-[10px] font-mono">{printer.firmware_version || 'Unknown'}</Badge>
      </div>

      {needsUpdate && !completed && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Latest:</span>
          <Badge className="text-[10px] font-mono bg-blue-100 text-blue-700 border-blue-300">{targetFw?.version}</Badge>
        </div>
      )}

      {completed ? (
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 p-2 rounded">
          <CheckCircle2 className="w-4 h-4" />
          <span>Successfully updated to {targetFw?.version}!</span>
        </div>
      ) : updating ? (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600">{stage}</span>
            <span className="text-[10px] font-mono font-bold text-blue-600">{progress}%</span>
          </div>
          {progress > 15 && progress < 85 && (
            <div className="text-[10px] text-gray-400">
              Transfer speed: {(0.8 + Math.random() * 0.4).toFixed(1)} MB/s • ETA: {Math.ceil((100 - progress) * 0.12)}s
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {needsUpdate ? (
            <Button
              size="sm"
              className="w-full text-xs"
              onClick={simulateUpdate}
              disabled={printer.status === 'offline'}
            >
              <Upload className="w-3 h-3 mr-2" />
              Update to {targetFw?.version}
            </Button>
          ) : (
            <div className="text-[10px] text-green-600 text-center py-1">
              ✓ Running latest firmware
            </div>
          )}
          
          {/* Select different firmware */}
          {firmware.length > 1 && (
            <div className="space-y-1">
              <span className="text-[10px] text-gray-500">Or select version:</span>
              <div className="flex flex-wrap gap-1">
                {firmware.filter(f => f.version !== printer.firmware_version).map(fw => (
                  <button
                    key={fw.id}
                    onClick={() => { setSelectedFw(fw); }}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded border transition-colors",
                      selectedFw?.id === fw.id
                        ? "bg-blue-100 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    {fw.version} {fw.is_latest && '(latest)'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export function FleetMonitoringPanel() {
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
      if (json.success) {
        await fetchSites();
      }
    } catch (err) {
      console.error('Seed error:', err);
    } finally {
      setSeeding(false);
    }
  }, [fleetCall, fetchSites]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  const handleSelectPrinter = (printer: FleetPrinter) => {
    setSelectedPrinter(printer);
    fetchPrinterDetail(printer);
  };

  const totalPrinters = sites.reduce((sum, s) => sum + s.fleet_printers.length, 0);
  const onlinePrinters = sites.reduce((sum, s) => sum + s.fleet_printers.filter(p => p.status === 'online').length, 0);
  const errorPrinters = sites.reduce((sum, s) => sum + s.fleet_printers.filter(p => p.status === 'error').length, 0);

  // --- Printer Detail View ---
  if (selectedPrinter) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4">
          {/* Back nav */}
          <button
            onClick={() => { setSelectedPrinter(null); setTelemetry(null); setEvents([]); }}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <ChevronLeft className="w-3 h-3" />
            Back to {selectedSite?.name || 'sites'}
          </button>

          {/* Printer header */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <StatusDot status={selectedPrinter.status} />
              <span className="text-sm font-semibold text-gray-800">{selectedPrinter.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500">
              <span>IP: <span className="font-mono text-gray-700">{selectedPrinter.ip_address}:{selectedPrinter.port}</span></span>
              <span>S/N: <span className="font-mono text-gray-700">{selectedPrinter.serial_number || 'N/A'}</span></span>
              <span>FW: <span className="font-mono text-gray-700">{selectedPrinter.firmware_version || 'Unknown'}</span></span>
              <span>Seen: <span className="text-gray-700">{selectedPrinter.last_seen ? getRelativeTime(selectedPrinter.last_seen) : 'Never'}</span></span>
            </div>
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <Tabs defaultValue="live" className="w-full">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="live" className="text-[10px]">
                  <Activity className="w-3 h-3 mr-1" />Live
                </TabsTrigger>
                <TabsTrigger value="events" className="text-[10px]">
                  <History className="w-3 h-3 mr-1" />Events
                </TabsTrigger>
                <TabsTrigger value="firmware" className="text-[10px]">
                  <ArrowUpCircle className="w-3 h-3 mr-1" />OTA
                </TabsTrigger>
              </TabsList>

              {/* Live Telemetry */}
              <TabsContent value="live" className="space-y-3 mt-3">
                {telemetry ? (
                  <>
                    {/* Subsystem status */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Subsystems</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: 'HV', on: telemetry.hv_on },
                          { label: 'JET', on: telemetry.jet_running },
                        ].map(s => (
                          <div key={s.label} className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold",
                            s.on ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"
                          )}>
                            {s.label}: {s.on ? 'ON' : 'OFF'}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Diagnostics</div>
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
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1">
                        <Thermometer className="w-3 h-3" /> Temperature
                      </div>
                      <MetricRow label="Printhead" value={telemetry.printhead_temp.toFixed(1)} unit="°C" />
                      <MetricRow label="Electronics" value={telemetry.electronics_temp.toFixed(1)} unit="°C" />
                    </div>

                    {/* Consumables */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Consumables</div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className={cn("w-2.5 h-2.5 rounded-full",
                            telemetry.ink_level === 'FULL' ? 'bg-green-500' : 
                            telemetry.ink_level === 'GOOD' ? 'bg-green-400' :
                            telemetry.ink_level === 'LOW' ? 'bg-yellow-500' : 'bg-red-500'
                          )} />
                          <span className="text-[11px] text-gray-700">Ink: <b>{telemetry.ink_level}</b></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={cn("w-2.5 h-2.5 rounded-full",
                            telemetry.makeup_level === 'FULL' || telemetry.makeup_level === 'GOOD' ? 'bg-green-500' : 
                            telemetry.makeup_level === 'LOW' ? 'bg-yellow-500' : 'bg-red-500'
                          )} />
                          <span className="text-[11px] text-gray-700">Makeup: <b>{telemetry.makeup_level}</b></span>
                        </div>
                      </div>
                    </div>

                    {/* Runtime */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Runtime</div>
                      <MetricRow label="Power Hours" value={telemetry.power_hours} />
                      <MetricRow label="Stream Hours" value={telemetry.stream_hours} />
                      <MetricRow label="Print Count" value={telemetry.print_count.toLocaleString()} />
                      <MetricRow label="Current Message" value={telemetry.current_message || 'None'} />
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-gray-400 text-center py-6">No telemetry data available</div>
                )}
              </TabsContent>

              {/* Events Log */}
              <TabsContent value="events" className="mt-3">
                {events.length > 0 ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Event Log ({events.length})</div>
                    <div className="space-y-0">
                      {events.map(evt => (
                        <EventItem key={evt.id} event={evt} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 text-center py-6">No events recorded</div>
                )}
              </TabsContent>

              {/* Firmware / OTA Tab */}
              <TabsContent value="firmware" className="mt-3 space-y-3">
                <FirmwareUpdateDemo printer={selectedPrinter} firmware={firmware} />

                {/* Firmware history */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Available Firmware</div>
                  <div className="space-y-2">
                    {firmware.map(fw => (
                      <div key={fw.id} className="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-0">
                        <div className={cn(
                          "mt-0.5 w-2 h-2 rounded-full",
                          fw.is_latest ? "bg-blue-500" : "bg-gray-300"
                        )} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold text-gray-700">{fw.version}</span>
                            {fw.is_latest && <Badge className="text-[9px] bg-blue-100 text-blue-600 border-blue-200 px-1 py-0">LATEST</Badge>}
                            {fw.file_size && <span className="text-[10px] text-gray-400">{(fw.file_size / 1024 / 1024).toFixed(1)} MB</span>}
                          </div>
                          {fw.release_notes && (
                            <div className="text-[10px] text-gray-500 mt-0.5">{fw.release_notes}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </ScrollArea>
    );
  }

  // --- Site Detail View ---
  if (selectedSite) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4">
          <button
            onClick={() => setSelectedSite(null)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <ChevronLeft className="w-3 h-3" />
            All Sites
          </button>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-semibold text-gray-800">{selectedSite.name}</span>
            </div>
            <div className="text-[10px] text-gray-500 space-y-0.5">
              {selectedSite.company && <div>Company: {selectedSite.company}</div>}
              {selectedSite.location && <div>Location: {selectedSite.location}</div>}
              {selectedSite.contact_email && <div>Contact: {selectedSite.contact_email}</div>}
            </div>
          </div>

          <div className="text-[10px] font-semibold text-gray-500 uppercase">
            Printers ({selectedSite.fleet_printers.length})
          </div>

          <div className="space-y-2">
            {selectedSite.fleet_printers.map(printer => (
              <button
                key={printer.id}
                onClick={() => handleSelectPrinter(printer)}
                className="w-full text-left bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <StatusDot status={printer.status} />
                    <span className="text-xs font-semibold text-gray-800">{printer.name}</span>
                  </div>
                  <ChevronRight className="w-3 h-3 text-gray-400" />
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500">
                  <span className="font-mono">{printer.ip_address}</span>
                  <span>FW: <span className="font-mono">{printer.firmware_version || '?'}</span></span>
                  <span>S/N: {printer.serial_number || 'N/A'}</span>
                  <span>{printer.last_seen ? getRelativeTime(printer.last_seen) : 'Never seen'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    );
  }

  // --- Sites Overview ---
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Fleet Monitoring</span>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchSites} className="h-6 w-6 p-0">
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-gray-800">{totalPrinters}</div>
            <div className="text-[10px] text-gray-500">Total</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-green-600">{onlinePrinters}</div>
            <div className="text-[10px] text-green-600">Online</div>
          </div>
          <div className={cn(
            "rounded-lg p-2 text-center border",
            errorPrinters > 0 ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"
          )}>
            <div className={cn("text-lg font-bold", errorPrinters > 0 ? "text-red-600" : "text-gray-400")}>{errorPrinters}</div>
            <div className={cn("text-[10px]", errorPrinters > 0 ? "text-red-600" : "text-gray-500")}>Errors</div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : sites.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <Database className="w-8 h-8 mx-auto text-gray-300" />
            <div className="text-xs text-gray-500">No fleet data yet</div>
            <Button
              variant="outline"
              size="sm"
              onClick={seedDemoData}
              disabled={seeding}
              className="text-xs"
            >
              {seeding ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Database className="w-3 h-3 mr-2" />}
              Load Demo Data
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {sites.map(site => {
              const online = site.fleet_printers.filter(p => p.status === 'online').length;
              const errors = site.fleet_printers.filter(p => p.status === 'error').length;
              const total = site.fleet_printers.length;

              return (
                <button
                  key={site.id}
                  onClick={() => setSelectedSite(site)}
                  className="w-full text-left bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-semibold text-gray-800">{site.name}</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-gray-500">
                      {site.location || site.company || '—'}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500">{total} printer{total !== 1 ? 's' : ''}</span>
                      {online > 0 && <Badge variant="outline" className="text-[9px] bg-green-50 text-green-600 border-green-200 px-1 py-0">{online} online</Badge>}
                      {errors > 0 && <Badge variant="outline" className="text-[9px] bg-red-50 text-red-600 border-red-200 px-1 py-0">{errors} error</Badge>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
