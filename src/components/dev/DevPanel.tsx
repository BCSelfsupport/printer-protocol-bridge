import { useState, useEffect } from 'react';
import { printerEmulator, EmulatorState, CommandLogEntry, PROTOCOL_COMMANDS } from '@/lib/printerEmulator';
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
  Settings2,
  BookOpen,
  Send,
  Play,
  Square,
  List
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface DevPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function DevPanel({ isOpen, onToggle }: DevPanelProps) {
  const [emulatorState, setEmulatorState] = useState<EmulatorState>(printerEmulator.getState());
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>(printerEmulator.getCommandLog());
  const [emulatorEnabled, setEmulatorEnabled] = useState(printerEmulator.enabled);
  const [manualCommand, setManualCommand] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

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

  const categoryColors: Record<string, string> = {
    system: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    query: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    printing: 'bg-green-500/20 text-green-400 border-green-500/50',
    message: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    settings: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    'one-to-one': 'bg-pink-500/20 text-pink-400 border-pink-500/50',
  };

  const filteredCommands = filterCategory === 'all' 
    ? PROTOCOL_COMMANDS 
    : PROTOCOL_COMMANDS.filter(c => c.category === filterCategory);

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
                Emulator Active - Protocol v2.0
              </div>
            )}
          </div>

          <Tabs defaultValue="status" className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-2 grid grid-cols-4">
              <TabsTrigger value="status" className="text-xs">Status</TabsTrigger>
              <TabsTrigger value="protocol" className="text-xs">Protocol</TabsTrigger>
              <TabsTrigger value="commands" className="text-xs">Log</TabsTrigger>
              <TabsTrigger value="manual" className="text-xs">Manual</TabsTrigger>
            </TabsList>

            {/* Status Tab */}
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
                    <StatusLight on={emulatorState.echoOn} label="ECHO" color="blue" />
                    <StatusLight on={emulatorState.oneToOneMode} label="1-1 MODE" color="blue" />
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
                    <ToggleButton
                      on={emulatorState.echoOn}
                      label="Echo"
                      onClick={() => printerEmulator.toggleState('echoOn')}
                      icon={Terminal}
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
                      <span>{emulatorState.pressure} psi</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RPS:</span>
                      <span>{emulatorState.rps.toFixed(2)}</span>
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
                      <span className={emulatorState.inkLevel === 'GOOD' || emulatorState.inkLevel === 'FULL' ? 'text-green-400' : 'text-yellow-400'}>
                        {emulatorState.inkLevel}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Makeup:</span>
                      <span className={emulatorState.makeupLevel === 'GOOD' ? 'text-green-400' : 'text-yellow-400'}>
                        {emulatorState.makeupLevel}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current Msg:</span>
                      <span>{emulatorState.currentMessage}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Print Count:</span>
                      <span>{emulatorState.printCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Product Count:</span>
                      <span>{emulatorState.productCount}</span>
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
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Protocol v2.0 Commands
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
                        "w-full text-left p-2 rounded-md border border-border",
                        "hover:bg-muted/50 transition-colors",
                        !emulatorEnabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <code className="text-xs font-bold text-primary">{cmd.code}</code>
                        <Badge variant="outline" className={cn("text-[9px]", categoryColors[cmd.category])}>
                          {cmd.category}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground">{cmd.description}</div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Commands Log Tab */}
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
                        <div className="text-foreground break-all">
                          {entry.command}
                        </div>
                        {entry.response && entry.direction === 'received' && (
                          <div className="text-muted-foreground mt-1 whitespace-pre-wrap text-[10px]">
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
                  <Send className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">Quick Commands</h4>
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
                <div className="text-[10px] text-muted-foreground space-y-1 bg-muted/30 rounded-lg p-3">
                  <p className="font-semibold mb-2">Command Format:</p>
                  <p>• Commands start with ^ (caret)</p>
                  <p>• Parameters separated by ; (semicolon)</p>
                  <p>• Case insensitive (except message data)</p>
                  <p>• Example: ^SM BESTCODE</p>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className="p-3 border-t border-border text-[10px] text-muted-foreground text-center">
            Printer Emulator v2.0 • Bestcode Protocol • Dev Mode Only
          </div>
        </div>
      </div>
    </>
  );
}
