import { useState, useEffect } from 'react';
import { printerEmulator, EmulatorState, CommandLogEntry } from '@/lib/printerEmulator';
import { cn } from '@/lib/utils';
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
  Settings2
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface DevPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function DevPanel({ isOpen, onToggle }: DevPanelProps) {
  const [emulatorState, setEmulatorState] = useState<EmulatorState>(printerEmulator.getState());
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>(printerEmulator.getCommandLog());
  const [emulatorEnabled, setEmulatorEnabled] = useState(printerEmulator.enabled);

  useEffect(() => {
    const unsubState = printerEmulator.subscribe(setEmulatorState);
    const unsubLog = printerEmulator.subscribeToLog(setCommandLog);
    return () => {
      unsubState();
      unsubLog();
    };
  }, []);

  const handleEmulatorToggle = (enabled: boolean) => {
    printerEmulator.enabled = enabled;
    setEmulatorEnabled(enabled);
  };

  const StatusLight = ({ on, label, color = 'green' }: { on: boolean; label: string; color?: 'green' | 'red' | 'yellow' | 'blue' }) => {
    const colorClasses = {
      green: on ? 'bg-green-500 shadow-green-500/50' : 'bg-muted',
      red: on ? 'bg-red-500 shadow-red-500/50' : 'bg-muted',
      yellow: on ? 'bg-yellow-500 shadow-yellow-500/50' : 'bg-muted',
      blue: on ? 'bg-blue-500 shadow-blue-500/50' : 'bg-muted',
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
        <span className="text-xs font-mono">{label}</span>
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
        "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all",
        "border border-border",
        on 
          ? "bg-green-500/20 text-green-400 border-green-500/50" 
          : "bg-muted/50 text-muted-foreground hover:bg-muted",
        !emulatorEnabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <>
      {/* Toggle Button (always visible) */}
      <button
        onClick={onToggle}
        className={cn(
          "fixed right-0 top-1/2 -translate-y-1/2 z-50",
          "bg-sidebar border border-border border-r-0 rounded-l-md",
          "p-2 shadow-lg transition-all",
          "hover:bg-muted",
          isOpen && "translate-x-[320px]"
        )}
      >
        {isOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-80 z-40",
          "bg-sidebar border-l border-border shadow-xl",
          "transform transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Developer Panel
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Emulator</span>
                <Switch
                  checked={emulatorEnabled}
                  onCheckedChange={handleEmulatorToggle}
                />
              </div>
            </div>
            {emulatorEnabled && (
              <div className="flex items-center gap-2 text-xs text-green-400">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Emulator Active
              </div>
            )}
          </div>

          <Tabs defaultValue="status" className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-2">
              <TabsTrigger value="status" className="text-xs">Status</TabsTrigger>
              <TabsTrigger value="commands" className="text-xs">Commands</TabsTrigger>
            </TabsList>

            <TabsContent value="status" className="flex-1 overflow-hidden m-0">
              <ScrollArea className="h-full p-4">
                {/* Status Lights Section */}
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                    Subsystem Status
                  </h3>
                  <div className="grid grid-cols-2 gap-2 p-3 bg-muted/30 rounded-lg">
                    <StatusLight on={emulatorState.hvOn} label="HV ON" color="green" />
                    <StatusLight on={emulatorState.jetRunning} label="JET RUN" color="blue" />
                    <StatusLight on={emulatorState.v300up} label="V300UP" color="green" />
                    <StatusLight on={emulatorState.vltOn} label="VLT_ON" color="yellow" />
                    <StatusLight on={emulatorState.gutOn} label="GUT_ON" color="yellow" />
                    <StatusLight on={emulatorState.modOn} label="MOD_ON" color="yellow" />
                  </div>
                </div>

                {/* Control Buttons */}
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
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
                  </div>
                </div>

                {/* Metrics */}
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                    Metrics
                  </h3>
                  <div className="space-y-2 text-xs font-mono bg-muted/30 rounded-lg p-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Modulation:</span>
                      <span>{emulatorState.modulation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Charge:</span>
                      <span>{emulatorState.charge}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pressure:</span>
                      <span>{emulatorState.pressure.toFixed(1)} bar</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RPS:</span>
                      <span>{emulatorState.rps}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phase Qual:</span>
                      <span>{emulatorState.phaseQual}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Viscosity:</span>
                      <span>{emulatorState.viscosity.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ink Level:</span>
                      <span className={emulatorState.inkLevel === 'FULL' ? 'text-green-400' : 'text-yellow-400'}>
                        {emulatorState.inkLevel}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Makeup:</span>
                      <span className={emulatorState.makeupLevel === 'GOOD' ? 'text-green-400' : 'text-yellow-400'}>
                        {emulatorState.makeupLevel}
                      </span>
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

            <TabsContent value="commands" className="flex-1 overflow-hidden m-0">
              <ScrollArea className="h-full p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Terminal className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Command Log
                  </h3>
                </div>
                
                {commandLog.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-8">
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
                            ? "bg-blue-500/10 border-l-2 border-blue-500" 
                            : "bg-green-500/10 border-l-2 border-green-500"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn(
                            "text-[10px] uppercase font-semibold",
                            entry.direction === 'sent' ? "text-blue-400" : "text-green-400"
                          )}>
                            {entry.direction === 'sent' ? '→ SENT' : '← RECV'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {entry.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-foreground">
                          {entry.command}
                        </div>
                        {entry.response && entry.direction === 'received' && (
                          <div className="text-muted-foreground mt-1 truncate">
                            {entry.response.split('\r\n')[0]}...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className="p-3 border-t border-border text-[10px] text-muted-foreground text-center">
            Printer Emulator v1.0 • Dev Mode Only
          </div>
        </div>
      </div>
    </>
  );
}
