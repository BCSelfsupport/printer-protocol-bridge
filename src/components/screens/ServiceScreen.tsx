import { PrinterMetrics } from '@/types/printer';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Badge } from '@/components/ui/badge';
import { Droplet, Gauge, Activity, Zap, ThermometerSun, Clock } from 'lucide-react';

interface ServiceScreenProps {
  metrics: PrinterMetrics | null;
  onHome: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const isReady = status.toLowerCase().includes('ready') && !status.toLowerCase().includes('not');
  return (
    <Badge 
      variant={isReady ? 'default' : 'secondary'}
      className={isReady ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-600 hover:bg-yellow-700'}
    >
      {status}
    </Badge>
  );
}

function LevelBadge({ level, type }: { level: string; type: 'ink' | 'makeup' }) {
  const isGood = level === 'FULL' || level === 'GOOD';
  return (
    <Badge 
      variant={isGood ? 'default' : 'destructive'}
      className={isGood ? 'bg-green-600 hover:bg-green-700' : ''}
    >
      {type === 'ink' ? `INK: ${level}` : `MAKEUP: ${level}`}
    </Badge>
  );
}

function SubsystemIndicator({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${active ? 'bg-green-500' : 'bg-slate-500'}`} />
      <span className={`text-sm ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
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

  return (
    <div className="flex-1 p-4 flex flex-col gap-4 overflow-auto">
      <SubPageHeader title="Service" onHome={onHome} />

      {/* Status Row */}
      <div className="flex items-center gap-4 flex-wrap">
        <StatusBadge status={metrics.printStatus} />
        <LevelBadge level={metrics.inkLevel} type="ink" />
        <LevelBadge level={metrics.makeupLevel} type="makeup" />
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Pressure */}
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Gauge className="w-4 h-4" />
            <span className="text-sm">Pressure</span>
          </div>
          <div className="text-2xl font-bold">{metrics.pressure}</div>
          <div className="text-xs text-muted-foreground">PSI</div>
        </div>

        {/* RPS */}
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-sm">RPS</span>
          </div>
          <div className="text-2xl font-bold">{metrics.rps.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">rev/sec</div>
        </div>

        {/* Modulation */}
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Zap className="w-4 h-4" />
            <span className="text-sm">Modulation</span>
          </div>
          <div className="text-2xl font-bold">{metrics.modulation}</div>
          <div className="text-xs text-muted-foreground">Volts</div>
        </div>

        {/* Charge */}
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Zap className="w-4 h-4" />
            <span className="text-sm">Charge</span>
          </div>
          <div className="text-2xl font-bold">{metrics.charge}</div>
          <div className="text-xs text-muted-foreground">%</div>
        </div>

        {/* Phase Quality */}
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-sm">Phase Quality</span>
          </div>
          <div className="text-2xl font-bold">{metrics.phaseQual}%</div>
        </div>

        {/* Viscosity */}
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Droplet className="w-4 h-4" />
            <span className="text-sm">Viscosity</span>
          </div>
          <div className="text-2xl font-bold">{metrics.viscosity.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">cP (6 min read)</div>
        </div>

        {/* HV Deflection */}
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Zap className="w-4 h-4" />
            <span className="text-sm">HV Deflection</span>
          </div>
          <div className={`text-2xl font-bold ${metrics.hvDeflection ? 'text-green-500' : 'text-muted-foreground'}`}>
            {metrics.hvDeflection ? 'ON' : 'OFF'}
          </div>
        </div>

        {/* Run Hours */}
        <div className="bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Run Hours</span>
          </div>
          <div className="text-lg font-bold">{metrics.powerHours}</div>
          <div className="text-xs text-muted-foreground">Power</div>
          <div className="text-lg font-bold mt-1">{metrics.streamHours}</div>
          <div className="text-xs text-muted-foreground">Stream</div>
        </div>
      </div>

      {/* Subsystems */}
      <div className="bg-card rounded-lg p-4 border border-border">
        <div className="text-sm font-medium text-muted-foreground mb-3">Subsystems</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SubsystemIndicator label="V300UP" active={metrics.subsystems.v300up} />
          <SubsystemIndicator label="VLT" active={metrics.subsystems.vltOn} />
          <SubsystemIndicator label="GUT" active={metrics.subsystems.gutOn} />
          <SubsystemIndicator label="MOD" active={metrics.subsystems.modOn} />
        </div>
      </div>
    </div>
  );
}
