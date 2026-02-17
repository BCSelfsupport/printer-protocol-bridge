import { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { printerEmulator, EmulatorState, CommandLogEntry, PROTOCOL_COMMANDS } from '@/lib/printerEmulator';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { 
  ChevronLeft, 
  ChevronRight, 
  Power, 
  Zap, 
  Droplets, 
  Gauge, 
  Radio,
  RotateCcw,
  Terminal,
  Settings2,
  BookOpen,
  Send,
  Play,
  Square,
  List,
  Palette,
  Upload,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Network,
  Shield,
  Globe,
  Signal
} from 'lucide-react';
import { CommandTerminal } from '@/components/terminal/CommandTerminal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LicenseAssignmentPanel } from '@/components/dev/LicenseAssignmentPanel';
import { FleetMonitoringPanel } from '@/components/dev/FleetMonitoringPanel';
function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function UpdaterDiagnostics() {
  const [info, setInfo] = useState<{ version: string; updateState: any } | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  const refresh = useCallback(() => {
    const api = (window as any).electronAPI;
    if (!api) return;
    Promise.all([
      api.app.getVersion(),
      api.app.getUpdateState(),
    ]).then(([version, updateState]: [string, any]) => {
      setInfo({ version, updateState });
    }).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadLog = () => {
    const api = (window as any).electronAPI;
    if (!api?.app?.getUpdaterLog) return;
    api.app.getUpdaterLog().then((content: string) => {
      setLog(content);
      setShowLog(true);
    });
  };

  if (!info) return <div className="text-[10px] text-blue-600">Loading...</div>;

  return (
    <div className="text-[10px] text-blue-700 space-y-0.5 font-mono">
      <div>Installed: v{info.version}</div>
      <div>Update Stage: {info.updateState?.stage || 'unknown'}</div>
      {info.updateState?.info && (
        <div>Target: v{info.updateState.info.version}</div>
      )}
      {info.updateState?.progress && (
        <div>Progress: {Math.round(info.updateState.progress.percent)}%</div>
      )}
      {info.updateState?.stage === 'idle' && (
        <div className="text-orange-600 mt-1">⚠️ No update detected.</div>
      )}
      <div className="flex gap-1 mt-1">
        <button onClick={refresh} className="text-blue-500 underline text-[10px]">Refresh</button>
        <button onClick={loadLog} className="text-blue-500 underline text-[10px]">View Log</button>
      </div>
      {showLog && log && (
        <div className="mt-1 max-h-40 overflow-auto bg-black/80 text-green-400 p-1 rounded text-[9px] whitespace-pre-wrap">
          {log}
          <button onClick={() => setShowLog(false)} className="block text-red-400 mt-1 underline">Close</button>
        </div>
      )}
    </div>
  );
}

interface DevPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  connectedPrinterIp?: string;
  connectedPrinterPort?: number;
  defaultTab?: string;
  showToggleButton?: boolean;
}

export function DevPanel({ isOpen, onToggle, connectedPrinterIp, connectedPrinterPort, defaultTab, showToggleButton = true }: DevPanelProps) {
  const isMobile = useIsMobile();
  
  // Resolve the correct emulator instance for the connected printer
  const getConnectedEmulator = () => {
    if (multiPrinterEmulator.enabled && connectedPrinterIp) {
      return multiPrinterEmulator.getInstanceByIp(connectedPrinterIp, connectedPrinterPort) || printerEmulator;
    }
    return printerEmulator;
  };
  
  const [emulatorState, setEmulatorState] = useState<EmulatorState>(printerEmulator.getState());
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>(printerEmulator.getCommandLog());
  const [emulatorEnabled, setEmulatorEnabled] = useState(printerEmulator.enabled);
  const [manualCommand, setManualCommand] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [buildTriggering, setBuildTriggering] = useState(false);
  const [buildResult, setBuildResult] = useState<{ success: boolean; message: string } | null>(null);
  const [buildRuns, setBuildRuns] = useState<any[]>([]);
  const [buildRunsLoading, setBuildRunsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab || 'status');

  // Network config state
  const NETWORK_STORAGE_KEY = 'printer-network-settings';
  const defaultNetSettings = {
    ipAddress: '192.168.1.55',
    subnetMask: '255.255.255.0',
    gateway: '192.168.1.1',
    dns1: '8.8.8.8',
    dns2: '8.8.4.4',
    port: '23',
  };
  const [netSettings, setNetSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(NETWORK_STORAGE_KEY);
      if (saved) return { ...defaultNetSettings, ...JSON.parse(saved) };
    } catch (e) { /* ignore */ }
    return defaultNetSettings;
  });

  const handleNetChange = (field: string, value: string) => {
    setNetSettings((prev: typeof defaultNetSettings) => {
      const updated = { ...prev, [field]: value };
      try { localStorage.setItem(NETWORK_STORAGE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  // Sync activeTab when defaultTab prop changes
  useEffect(() => {
    if (defaultTab) setActiveTab(defaultTab);
  }, [defaultTab]);

  const fetchBuildStatus = async () => {
    setBuildRunsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('github-build-status');
      if (error) throw error;
      setBuildRuns(data?.runs || []);
    } catch (err) {
      console.error('Failed to fetch build status:', err);
    } finally {
      setBuildRunsLoading(false);
    }
  };

  useEffect(() => {
    fetchBuildStatus();
  }, []);

  const handleTriggerBuild = async () => {
    setBuildTriggering(true);
    setBuildResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('trigger-build');
      if (error) throw error;
      setBuildResult({ success: true, message: 'Build triggered! Check GitHub Actions.' });
      // Auto-refresh build status after a short delay
      setTimeout(() => fetchBuildStatus(), 3000);
    } catch (err: any) {
      setBuildResult({ success: false, message: err.message || 'Failed to trigger build' });
    } finally {
      setBuildTriggering(false);
      setTimeout(() => setBuildResult(null), 5000);
    }
  };

  useEffect(() => {
    const unsubState = printerEmulator.subscribe(setEmulatorState);
    const unsubLog = printerEmulator.subscribeToLog(setCommandLog);
    
    // Also subscribe to the connected multi-emulator instance for state updates
    let unsubMulti: (() => void) | null = null;
    if (multiPrinterEmulator.enabled && connectedPrinterIp) {
      unsubMulti = multiPrinterEmulator.subscribe(connectedPrinterIp, connectedPrinterPort ?? 23, (state) => {
        setEmulatorState(state);
      });
      // Immediately read the connected instance's state
      const instance = multiPrinterEmulator.getInstanceByIp(connectedPrinterIp, connectedPrinterPort);
      if (instance) {
        setEmulatorState(instance.getState());
      }
    }
    
    return () => {
      unsubState();
      unsubLog();
      unsubMulti?.();
    };
  }, [connectedPrinterIp, connectedPrinterPort]);

  const handleEmulatorToggle = (enabled: boolean) => {
    // Sync both emulators
    printerEmulator.enabled = enabled;
    multiPrinterEmulator.enabled = enabled;
    setEmulatorEnabled(enabled);
  };

  const handleSendCommand = () => {
    if (manualCommand.trim() && emulatorEnabled) {
      printerEmulator.processCommand(manualCommand.trim());
      setManualCommand('');
    }
  };

  const handleQuickCommand = (code: string) => {
    if (emulatorEnabled) {
      printerEmulator.processCommand(code);
    }
  };

  const StatusLight = ({ on, label, color = 'green' }: { on: boolean; label: string; color?: 'green' | 'red' | 'yellow' | 'blue' }) => {
    const colorClasses = {
      green: on ? 'bg-green-500 shadow-green-500/50' : 'bg-gray-300',
      red: on ? 'bg-red-500 shadow-red-500/50' : 'bg-gray-300',
      yellow: on ? 'bg-yellow-500 shadow-yellow-500/50' : 'bg-gray-300',
      blue: on ? 'bg-blue-500 shadow-blue-500/50' : 'bg-gray-300',
    };

    return (
      <div className="flex items-center gap-2">
        <div 
          className={cn(
            "w-3 h-3 rounded-full transition-all duration-300",
            colorClasses[color],
            on && "shadow-lg"
          )} 
        />
        <span className="text-xs font-mono text-gray-700">{label}</span>
      </div>
    );
  };

  const ToggleButton = ({ 
    on, 
    label, 
    onClick, 
    icon: Icon 
  }: { 
    on: boolean; 
    label: string; 
    onClick: () => void;
    icon: React.ElementType;
  }) => (
    <button
      onClick={onClick}
      disabled={!emulatorEnabled}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all border",
        "border-gray-300",
        on 
          ? "bg-green-100 text-green-700 border-green-500" 
          : "bg-gray-50 text-gray-600 hover:bg-gray-100",
        !emulatorEnabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  const categoryColors: Record<string, string> = {
    system: 'bg-blue-100 text-blue-700 border-blue-300',
    query: 'bg-purple-100 text-purple-700 border-purple-300',
    printing: 'bg-green-100 text-green-700 border-green-300',
    message: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    settings: 'bg-orange-100 text-orange-700 border-orange-300',
    'one-to-one': 'bg-pink-100 text-pink-700 border-pink-300',
  };

  const filteredCommands = filterCategory === 'all' 
    ? PROTOCOL_COMMANDS 
    : PROTOCOL_COMMANDS.filter(c => c.category === filterCategory);

  return (
    <>
      {/* Toggle Button (visible only when showToggleButton is true) */}
      {showToggleButton && (
        <button
          onClick={onToggle}
          className={cn(
            "fixed top-1/2 -translate-y-1/2 z-50",
            "bg-sidebar border border-border border-r-0 rounded-l-md",
            "p-2 shadow-lg transition-all",
            "hover:bg-muted",
            isOpen ? (isMobile ? "right-[100%]" : "right-[600px]") : "right-0"
          )}
        >
          {isOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-40">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close developer panel"
            onClick={onToggle}
            className="absolute inset-0 bg-background/60"
          />

          {/* Drawer */}
          <div
            className={cn(
              "absolute right-0 top-0",
              isMobile ? "w-full" : "w-[600px]",
              "bg-white border-l-2 border-border shadow-xl",
              "h-[100dvh] pb-[env(safe-area-inset-bottom)]"
            )}
          >

        <div className="flex flex-col h-full overflow-y-auto">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm flex items-center gap-2 text-gray-800">
                <Settings2 className="w-4 h-4" />
                Developer Panel
              </h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Emulator</span>
                  <Switch
                    checked={emulatorEnabled}
                    onCheckedChange={handleEmulatorToggle}
                  />
                </div>
                <button
                  onClick={onToggle}
                  className="p-1 rounded hover:bg-gray-100 transition-colors"
                  title="Close panel"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>
            {emulatorEnabled && (
              <div className="flex items-center gap-2 text-xs text-green-600 font-medium">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Emulator Active - Protocol v2.6
              </div>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-2 grid grid-cols-7 h-10">
              <TabsTrigger value="status" className="text-xs gap-1"><Gauge className="w-3.5 h-3.5" />Status</TabsTrigger>
              <TabsTrigger value="protocol" className="text-xs gap-1"><BookOpen className="w-3.5 h-3.5" />Protocol</TabsTrigger>
              <TabsTrigger value="commands" className="text-xs gap-1"><Terminal className="w-3.5 h-3.5" />Log</TabsTrigger>
              <TabsTrigger value="manual" className="text-xs gap-1"><Send className="w-3.5 h-3.5" />Manual</TabsTrigger>
              <TabsTrigger value="network" className="text-xs gap-1"><Network className="w-3.5 h-3.5" />Network</TabsTrigger>
              <TabsTrigger value="fleet" className="text-xs gap-1">
                <Globe className="w-3.5 h-3.5" />
                Fleet
              </TabsTrigger>
              <TabsTrigger value="licenses" className="text-xs gap-1">
                <Shield className="w-3.5 h-3.5" />
                Licenses
              </TabsTrigger>
            </TabsList>

            {/* Status Tab */}
            <TabsContent value="status" className="flex-1 overflow-hidden m-0">
              <ScrollArea className="h-full p-4">
                {/* Status Lights Section */}
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">
                    Subsystem Status
                  </h3>
                  <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <StatusLight on={emulatorState.hvOn} label="HV ON" color="green" />
                    <StatusLight on={emulatorState.jetRunning} label="JET RUN" color="blue" />
                    <StatusLight on={emulatorState.v300up} label="V300UP" color="green" />
                    <StatusLight on={emulatorState.vltOn} label="VLT_ON" color="yellow" />
                    <StatusLight on={emulatorState.gutOn} label="GUT_ON" color="yellow" />
                    <StatusLight on={emulatorState.modOn} label="MOD_ON" color="yellow" />
                    <StatusLight on={emulatorState.echoOn} label="ECHO" color="blue" />
                    <StatusLight on={emulatorState.oneToOneMode} label="1-1 MODE" color="blue" />
                  </div>
                </div>

                {/* Control Buttons */}
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">
                    Manual Controls
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <ToggleButton
                      on={emulatorState.hvOn}
                      label="HV"
                      onClick={() => printerEmulator.toggleState('hvOn')}
                      icon={Zap}
                    />
                    <ToggleButton
                      on={emulatorState.jetRunning}
                      label="Jet"
                      onClick={() => printerEmulator.toggleState('jetRunning')}
                      icon={Droplets}
                    />
                    <ToggleButton
                      on={emulatorState.vltOn}
                      label="VLT"
                      onClick={() => printerEmulator.toggleState('vltOn')}
                      icon={Power}
                    />
                    <ToggleButton
                      on={emulatorState.gutOn}
                      label="GUT"
                      onClick={() => printerEmulator.toggleState('gutOn')}
                      icon={Gauge}
                    />
                    <ToggleButton
                      on={emulatorState.modOn}
                      label="MOD"
                      onClick={() => printerEmulator.toggleState('modOn')}
                      icon={Radio}
                    />
                    <ToggleButton
                      on={emulatorState.echoOn}
                      label="Echo"
                      onClick={() => printerEmulator.toggleState('echoOn')}
                      icon={Terminal}
                    />
                  </div>
                  
                  {/* Consumable Level Controls */}
                  <h3 className="text-xs font-semibold text-gray-500 mt-4 mb-3 uppercase tracking-wider">
                    Consumable Levels
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        getConnectedEmulator().cycleInkLevel();
                      }}
                      disabled={!emulatorEnabled}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all border",
                        "border-gray-300",
                        emulatorState.inkLevel === 'FULL' 
                          ? "bg-green-100 text-green-700 border-green-500" 
                          : emulatorState.inkLevel === 'LOW'
                          ? "bg-yellow-100 text-yellow-700 border-yellow-500"
                          : "bg-red-100 text-red-700 border-red-500",
                        !emulatorEnabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <Palette className="w-4 h-4" />
                      Ink: {emulatorState.inkLevel}
                    </button>
                    <button
                      onClick={() => {
                        getConnectedEmulator().cycleMakeupLevel();
                      }}
                      disabled={!emulatorEnabled}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all border",
                        "border-gray-300",
                        (emulatorState.makeupLevel === 'FULL' || emulatorState.makeupLevel === 'GOOD')
                          ? "bg-green-100 text-green-700 border-green-500" 
                          : emulatorState.makeupLevel === 'LOW'
                          ? "bg-yellow-100 text-yellow-700 border-yellow-500"
                          : "bg-red-100 text-red-700 border-red-500",
                        !emulatorEnabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <Droplets className="w-4 h-4" />
                      Makeup: {emulatorState.makeupLevel}
                    </button>
                  </div>
                </div>

                {/* Metrics */}
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">
                    Metrics
                  </h3>
                  <div className="space-y-2 text-xs font-mono bg-gray-50 rounded-lg p-3 border border-gray-200 text-gray-700">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Modulation:</span>
                      <span className="text-gray-800">{emulatorState.modulation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Charge:</span>
                      <span className="text-gray-800">{emulatorState.charge}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Pressure:</span>
                      <span className="text-gray-800">{emulatorState.pressure} psi</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">RPS:</span>
                      <span className="text-gray-800">{emulatorState.rps.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Phase Qual:</span>
                      <span className="text-gray-800">{emulatorState.phaseQual}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Viscosity:</span>
                      <span className="text-gray-800">{emulatorState.viscosity.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Ink Level:</span>
                      <span className={emulatorState.inkLevel === 'FULL' ? 'text-green-600 font-medium' : emulatorState.inkLevel === 'LOW' ? 'text-yellow-600 font-medium' : 'text-red-600 font-medium'}>
                        {emulatorState.inkLevel}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Makeup:</span>
                      <span className={(emulatorState.makeupLevel === 'FULL' || emulatorState.makeupLevel === 'GOOD') ? 'text-green-600 font-medium' : emulatorState.makeupLevel === 'LOW' ? 'text-yellow-600 font-medium' : 'text-red-600 font-medium'}>
                        {emulatorState.makeupLevel}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Current Msg:</span>
                      <span className="text-gray-800">{emulatorState.currentMessage}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Print Count:</span>
                      <span className="text-gray-800">{emulatorState.printCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Product Count:</span>
                      <span className="text-gray-800">{emulatorState.productCount}</span>
                    </div>
                  </div>
                </div>

                {/* Reset Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => printerEmulator.reset()}
                  disabled={!emulatorEnabled}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset Emulator
                </Button>
              </ScrollArea>
            </TabsContent>

            {/* Protocol Tab */}
            <TabsContent value="protocol" className="flex-1 overflow-hidden m-0">
              <ScrollArea className="h-full p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-gray-500" />
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Protocol v2.6 Commands
                  </h3>
                </div>

                {/* Category Filter */}
                <div className="flex flex-wrap gap-1 mb-4">
                  <Badge 
                    variant={filterCategory === 'all' ? 'default' : 'outline'}
                    className="text-[10px] cursor-pointer"
                    onClick={() => setFilterCategory('all')}
                  >
                    All
                  </Badge>
                  {['system', 'query', 'printing', 'message', 'settings', 'one-to-one'].map(cat => (
                    <Badge 
                      key={cat}
                      variant={filterCategory === cat ? 'default' : 'outline'}
                      className={cn("text-[10px] cursor-pointer", filterCategory === cat && categoryColors[cat])}
                      onClick={() => setFilterCategory(cat)}
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
                
                <div className="space-y-2">
                  {filteredCommands.map((cmd, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickCommand(cmd.code)}
                      disabled={!emulatorEnabled}
                      className={cn(
                        "w-full text-left p-2 rounded-md border border-gray-200",
                        "bg-gray-50 hover:bg-gray-100 transition-colors",
                        !emulatorEnabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <code className="text-xs font-bold text-blue-600">{cmd.code}</code>
                        <Badge variant="outline" className={cn("text-[9px]", categoryColors[cmd.category])}>
                          {cmd.category}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-gray-600">{cmd.description}</div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Commands Log Tab */}
            <TabsContent value="commands" className="flex-1 overflow-hidden m-0">
              <ScrollArea className="h-full p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Terminal className="w-4 h-4 text-gray-500" />
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Command Log
                  </h3>
                </div>
                
                {commandLog.length === 0 ? (
                  <div className="text-xs text-gray-500 text-center py-8">
                    No commands logged yet.
                    <br />
                    Enable emulator and interact with the app.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {commandLog.map((entry, idx) => (
                      <div 
                        key={idx} 
                        className={cn(
                          "text-xs font-mono p-2 rounded",
                          entry.direction === 'sent' 
                            ? "bg-blue-50 border-l-2 border-blue-500" 
                            : "bg-green-50 border-l-2 border-green-500"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn(
                            "text-[10px] uppercase font-semibold",
                            entry.direction === 'sent' ? "text-blue-600" : "text-green-600"
                          )}>
                            {entry.direction === 'sent' ? '→ SENT' : '← RECV'}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {entry.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-gray-800 break-all">
                          {entry.command}
                        </div>
                        {entry.response && entry.direction === 'received' && (
                          <div className="text-gray-500 mt-1 whitespace-pre-wrap text-[10px]">
                            {entry.response}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Manual Tab */}
            <TabsContent value="manual" className="flex-1 overflow-hidden m-0">
              <ScrollArea className="h-full p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Send className="w-4 h-4 text-gray-500" />
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Send Command
                  </h3>
                </div>

                <div className="flex gap-2 mb-4">
                  <Input
                    value={manualCommand}
                    onChange={(e) => setManualCommand(e.target.value)}
                    placeholder="^SU"
                    className="font-mono text-sm"
                    disabled={!emulatorEnabled}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendCommand()}
                  />
                  <Button
                    size="sm"
                    onClick={handleSendCommand}
                    disabled={!emulatorEnabled || !manualCommand.trim()}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>

                {/* Quick Commands */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">Quick Commands</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start"
                      onClick={() => handleQuickCommand('^SJ 1')}
                      disabled={!emulatorEnabled}
                    >
                      <Play className="w-3 h-3 mr-2" />
                      Start Jet
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start"
                      onClick={() => handleQuickCommand('^SJ 0')}
                      disabled={!emulatorEnabled}
                    >
                      <Square className="w-3 h-3 mr-2" />
                      Stop Jet
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start"
                      onClick={() => handleQuickCommand('^PR 1')}
                      disabled={!emulatorEnabled}
                    >
                      <Zap className="w-3 h-3 mr-2" />
                      HV On
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start"
                      onClick={() => handleQuickCommand('^PR 0')}
                      disabled={!emulatorEnabled}
                    >
                      <Zap className="w-3 h-3 mr-2 opacity-50" />
                      HV Off
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start"
                      onClick={() => handleQuickCommand('^SU')}
                      disabled={!emulatorEnabled}
                    >
                      <List className="w-3 h-3 mr-2" />
                      Status
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start"
                      onClick={() => handleQuickCommand('^VV')}
                      disabled={!emulatorEnabled}
                    >
                      <BookOpen className="w-3 h-3 mr-2" />
                      Version
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start"
                      onClick={() => handleQuickCommand('^LM')}
                      disabled={!emulatorEnabled}
                    >
                      <List className="w-3 h-3 mr-2" />
                      List Msgs
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start"
                      onClick={() => handleQuickCommand('^CN')}
                      disabled={!emulatorEnabled}
                    >
                      <List className="w-3 h-3 mr-2" />
                      Counters
                    </Button>
                  </div>
                </div>

                {/* Command Reference */}
                <div className="text-[10px] text-gray-600 space-y-1 bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="font-semibold mb-2 text-gray-700">Command Format:</p>
                  <p>• Commands start with ^ (caret)</p>
                  <p>• Parameters separated by ; (semicolon)</p>
                  <p>• Case insensitive (except message data)</p>
                  <p>• Example: ^SM BESTCODE</p>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Network Tab */}
            <TabsContent value="network" className="flex-1 overflow-hidden m-0">
              <ScrollArea className="h-full p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Network className="w-4 h-4 text-gray-500" />
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Network Configuration
                  </h3>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">IP Address</Label>
                    <Input
                      value={netSettings.ipAddress}
                      onChange={(e) => handleNetChange('ipAddress', e.target.value)}
                      placeholder="192.168.1.55"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">Subnet Mask</Label>
                      <Input
                        value={netSettings.subnetMask}
                        onChange={(e) => handleNetChange('subnetMask', e.target.value)}
                        placeholder="255.255.255.0"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">Port</Label>
                      <Input
                        value={netSettings.port}
                        onChange={(e) => handleNetChange('port', e.target.value)}
                        placeholder="23"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Gateway</Label>
                    <Input
                      value={netSettings.gateway}
                      onChange={(e) => handleNetChange('gateway', e.target.value)}
                      placeholder="192.168.1.1"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">DNS 1</Label>
                      <Input
                        value={netSettings.dns1}
                        onChange={(e) => handleNetChange('dns1', e.target.value)}
                        placeholder="8.8.8.8"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">DNS 2</Label>
                      <Input
                        value={netSettings.dns2}
                        onChange={(e) => handleNetChange('dns2', e.target.value)}
                        placeholder="8.8.4.4"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Embedded Terminal */}
                <div className="border border-gray-200 rounded-lg overflow-hidden" style={{ height: '300px' }}>
                  <CommandTerminal
                    printerId={connectedPrinterIp ? 1 : null}
                    ipAddress={netSettings.ipAddress}
                    port={parseInt(netSettings.port, 10) || 23}
                  />
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Fleet Monitoring Tab */}
            <TabsContent value="fleet" className="flex-1 overflow-hidden m-0">
              <div className="flex flex-col items-center justify-center h-full gap-5 p-6">
                <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-500 to-emerald-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                  <Signal className="w-8 h-8 text-white relative z-10" />
                </div>
                <div className="text-center">
                  <div className="flex items-start justify-center">
                    <span className="text-lg font-bold italic text-blue-600">Fleet</span>
                    <span className="text-lg font-bold italic text-emerald-500">Telemetry</span>
                    <span className="text-[8px] text-muted-foreground ml-0.5 mt-0.5">™</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 tracking-wider uppercase">Remote Fleet Monitoring & OTA Updates</p>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    window.location.hash = '#/telemetry';
                  }}
                >
                  <Signal className="w-4 h-4 mr-2" />
                  Open Fleet Telemetry
                </Button>
              </div>
            </TabsContent>

            {/* Licenses Tab */}
            <TabsContent value="licenses" className="flex-1 overflow-hidden m-0">
              <LicenseAssignmentPanel />
            </TabsContent>
          </Tabs>

          {/* Build Status & Push Update Footer */}
          <div className="p-3 border-t border-gray-200 space-y-2">
            {/* Build Runs */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-2">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Build Status</h4>
                <button
                  onClick={fetchBuildStatus}
                  disabled={buildRunsLoading}
                  className="p-1 rounded hover:bg-gray-200 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={cn("w-3 h-3 text-gray-500", buildRunsLoading && "animate-spin")} />
                </button>
              </div>
              {buildRuns.length === 0 && !buildRunsLoading && (
                <div className="text-[10px] text-gray-400 text-center py-2">No recent builds</div>
              )}
              {buildRunsLoading && buildRuns.length === 0 && (
                <div className="text-[10px] text-gray-400 text-center py-2">Loading...</div>
              )}
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {buildRuns.map((run) => {
                  const isRunning = run.status === 'in_progress' || run.status === 'queued';
                  const isSuccess = run.conclusion === 'success';
                  const isFailed = run.conclusion === 'failure' || run.conclusion === 'cancelled';
                  const timeAgo = getTimeAgo(run.created_at);

                  return (
                    <div key={run.id} className="flex items-center gap-2 text-[10px]">
                      {isRunning ? (
                        <Clock className="w-3 h-3 text-yellow-500 animate-pulse flex-shrink-0" />
                      ) : isSuccess ? (
                        <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                      ) : isFailed ? (
                        <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                      ) : (
                        <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-gray-700">#{run.run_number}</span>
                          <span className={cn(
                            "px-1 rounded text-[9px] font-medium",
                            isRunning ? "bg-yellow-100 text-yellow-700" :
                            isSuccess ? "bg-green-100 text-green-700" :
                            isFailed ? "bg-red-100 text-red-700" :
                            "bg-gray-100 text-gray-600"
                          )}>
                            {isRunning ? run.status : run.conclusion || run.status}
                          </span>
                          <span className="text-gray-400 ml-auto">{timeAgo}</span>
                        </div>
                      </div>
                      <a 
                        href={run.html_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-0.5 hover:bg-gray-200 rounded"
                        title="View on GitHub"
                      >
                        <ExternalLink className="w-2.5 h-2.5 text-gray-400" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Updater Diagnostics */}
            <div className="p-2 bg-blue-50 rounded border border-blue-200">
              <div className="text-[10px] font-semibold text-blue-800 mb-1">Auto-Updater Diagnostics</div>
              {(window as any).electronAPI ? (
                <UpdaterDiagnostics />
              ) : (
                <div className="text-[10px] text-blue-600">
                  ❌ Not running in Electron. Auto-updater only works in the installed desktop app.
                </div>
              )}
            </div>

            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={handleTriggerBuild}
              disabled={buildTriggering}
            >
              {buildTriggering ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {buildTriggering ? 'Triggering...' : 'Push Update'}
            </Button>
            {buildResult && (
              <div className={cn(
                "text-[10px] text-center py-1 px-2 rounded",
                buildResult.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              )}>
                {buildResult.message}
              </div>
            )}
            {(() => {
              const expiry = new Date('2026-03-01');
              const now = new Date();
              const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              const isExpired = daysLeft <= 0;
              const isWarning = daysLeft <= 30 && daysLeft > 0;
              return (isExpired || isWarning) ? (
                <div className={cn(
                  "text-[10px] text-center py-1 px-2 rounded",
                  isExpired ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                )}>
                  {isExpired ? '⚠️ GitHub token expired! Renew it.' : `⚠️ GitHub token expires in ${daysLeft} days`}
                </div>
              ) : null;
            })()}
            <div className="text-[10px] text-gray-500 text-center">
              Printer Emulator v2.0 • Bestcode Protocol • Dev Mode Only
            </div>
          </div>
        </div>
      </div>
    </div>
  )}
    </>
  );
}
