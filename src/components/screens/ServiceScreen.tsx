import { PrinterMetrics } from '@/types/printer';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { cn } from '@/lib/utils';

interface ServiceScreenProps {
  metrics: PrinterMetrics | null;
  onHome: () => void;
}

function StatusIndicator({ label, value, unit, isActive }: { 
  label: string; 
  value: string | number; 
  unit?: string;
  isActive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 border-b border-slate-200 dark:border-slate-700">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 min-w-[140px]">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className={cn(
          "text-lg font-bold tabular-nums",
          isActive ? "text-green-600 dark:text-green-400" : "text-slate-900 dark:text-slate-100"
        )}>
          {value}
        </span>
        {unit && (
          <span className="text-xs text-slate-500 dark:text-slate-400 min-w-[40px]">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={cn(
      "px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide",
      active 
        ? "bg-green-500 text-white shadow-lg shadow-green-500/30" 
        : "bg-slate-400 text-white"
    )}>
      {label}: {active ? 'ON' : 'OFF'}
    </div>
  );
}

function LevelIndicator({ level, type }: { level: string; type: 'ink' | 'makeup' }) {
  const isGood = level === 'FULL' || level === 'GOOD';
  const colors = type === 'ink' 
    ? isGood ? 'bg-cyan-500' : 'bg-red-500'
    : isGood ? 'bg-amber-500' : 'bg-red-500';
  
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-3 h-3 rounded-full", colors)} />
      <span className="text-xs font-medium uppercase">
        {type}: {level}
      </span>
    </div>
  );
}

function InfoRow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={cn(
      "grid grid-cols-2 gap-4 p-3 text-xs",
      dark 
        ? "bg-slate-800 dark:bg-slate-900 text-slate-300" 
        : "bg-slate-700 dark:bg-slate-800 text-slate-200"
    )}>
      {children}
    </div>
  );
}

export function ServiceScreen({ metrics, onHome }: ServiceScreenProps) {
  if (!metrics) {
    return (
      <div className="flex-1 p-4 flex items-center justify-center">
        <p className="text-muted-foreground">Connect to a printer to view service data</p>
      </div>
    );
  }

  const printStatusReady = metrics.printStatus.toLowerCase().includes('ready') && 
    !metrics.printStatus.toLowerCase().includes('not');

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
      {/* Header Bar */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-600 p-3">
        <div className="flex items-center justify-between">
          <SubPageHeader title="Service" onHome={onHome} />
          <div className="flex items-center gap-3">
            <div className={cn(
              "px-4 py-2 rounded font-bold text-sm",
              printStatusReady 
                ? "bg-green-500 text-white" 
                : "bg-amber-500 text-black"
            )}>
              {metrics.printStatus}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-6xl mx-auto">
          
          {/* Left Column - Primary Metrics */}
          <div className="space-y-1 rounded-lg overflow-hidden border border-slate-700 shadow-xl">
            <div className="bg-slate-700 px-4 py-2 border-b border-slate-600">
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
                Primary Metrics
              </h3>
            </div>
            <StatusIndicator label="Modulation" value={metrics.modulation} unit="Volts" />
            <StatusIndicator label="Pressure" value={metrics.pressure} unit="PSI" />
            <StatusIndicator label="Charge" value={metrics.charge} unit="%" />
            <StatusIndicator label="RPS" value={metrics.rps.toFixed(2)} unit="rev/s" isActive={metrics.rps > 0} />
            <StatusIndicator label="Phase Quality" value={metrics.phaseQual} unit="%" isActive={metrics.phaseQual >= 90} />
            <StatusIndicator label="Viscosity" value={metrics.viscosity.toFixed(2)} unit="cP" />
          </div>

          {/* Right Column - System Status */}
          <div className="space-y-4">
            {/* Subsystems */}
            <div className="rounded-lg overflow-hidden border border-slate-700 shadow-xl">
              <div className="bg-slate-700 px-4 py-2 border-b border-slate-600">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
                  Subsystems
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-800">
                <StatusBadge active={metrics.subsystems.v300up} label="V300UP" />
                <StatusBadge active={metrics.subsystems.vltOn} label="VLT" />
                <StatusBadge active={metrics.subsystems.gutOn} label="GUT" />
                <StatusBadge active={metrics.subsystems.modOn} label="MOD" />
              </div>
            </div>

            {/* Consumables */}
            <div className="rounded-lg overflow-hidden border border-slate-700 shadow-xl">
              <div className="bg-slate-700 px-4 py-2 border-b border-slate-600">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
                  Consumables
                </h3>
              </div>
              <div className="flex items-center justify-around p-4 bg-slate-800">
                <LevelIndicator level={metrics.inkLevel} type="ink" />
                <div className="w-px h-6 bg-slate-600" />
                <LevelIndicator level={metrics.makeupLevel} type="makeup" />
              </div>
            </div>

            {/* HV & Run Hours */}
            <div className="rounded-lg overflow-hidden border border-slate-700 shadow-xl">
              <div className="bg-slate-700 px-4 py-2 border-b border-slate-600">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
                  System Info
                </h3>
              </div>
              <div className="bg-slate-800">
                <StatusIndicator 
                  label="HV Deflection" 
                  value={metrics.hvDeflection ? 'Enabled' : 'Disabled'} 
                  isActive={metrics.hvDeflection}
                />
                <StatusIndicator label="Power Hours" value={metrics.powerHours} />
                <StatusIndicator label="Stream Hours" value={metrics.streamHours} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info Bar */}
      <div className="bg-slate-800 border-t border-slate-700 p-2">
        <InfoRow>
          <div>
            <span className="text-slate-400">Pressure: </span>
            <span className="font-mono">{metrics.pressure} PSI, {metrics.rps.toFixed(0)} RPS</span>
          </div>
          <div>
            <span className="text-slate-400">Viscosity: </span>
            <span className="font-mono">{metrics.viscosity.toFixed(2)} cP</span>
          </div>
        </InfoRow>
        <InfoRow dark>
          <div>
            <span className="text-slate-400">Phase Quality: </span>
            <span className="font-mono">{metrics.phaseQual}%</span>
          </div>
          <div>
            <span className="text-slate-400">Modulation: </span>
            <span className="font-mono">{metrics.modulation} Volts</span>
          </div>
        </InfoRow>
      </div>
    </div>
  );
}
