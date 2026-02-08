import { useState, useEffect, useCallback } from 'react';
import { Settings2, Activity, Thermometer, Droplets, Gauge, Zap, Clock, RefreshCw, Cpu } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, PrinterMetrics } from '@/types/printer';
import { cn } from '@/lib/utils';

interface PrinterServicePopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  printer: Printer | null;
  onQueryMetrics: (printer: Printer) => Promise<PrinterMetrics | null>;
}

// Compact metric display
function MetricCard({ 
  icon: Icon, 
  label, 
  value, 
  unit, 
  status 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string | number; 
  unit?: string; 
  status?: 'good' | 'warn' | 'error' | 'neutral';
}) {
  const statusColors = {
    good: 'text-success',
    warn: 'text-warning',
    error: 'text-destructive',
    neutral: 'text-foreground',
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
      <div className="w-8 h-8 rounded-md bg-slate-700 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400">{label}</div>
        <div className={cn("text-sm font-bold tabular-nums", statusColors[status ?? 'neutral'])}>
          {value}
          {unit && <span className="text-xs font-normal text-slate-400 ml-1">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

// Subsystem indicator
function SubsystemIndicator({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={cn(
      "px-2 py-1 rounded text-[10px] font-bold",
      active 
        ? "bg-success/20 text-success" 
        : "bg-slate-700 text-slate-400"
    )}>
      {label}: {active ? 'ON' : 'OFF'}
    </div>
  );
}

export function PrinterServicePopup({
  open,
  onOpenChange,
  printer,
  onQueryMetrics,
}: PrinterServicePopupProps) {
  const [metrics, setMetrics] = useState<PrinterMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!printer || !printer.isAvailable) return;
    
    setIsLoading(true);
    try {
      const result = await onQueryMetrics(printer);
      setMetrics(result);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setIsLoading(false);
    }
  }, [printer, onQueryMetrics]);

  // Fetch metrics when dialog opens
  useEffect(() => {
    if (open && printer?.isAvailable) {
      fetchMetrics();
    }
  }, [open, printer?.id, printer?.isAvailable, fetchMetrics]);

  // Auto-refresh every 3 seconds while open
  useEffect(() => {
    if (!open || !printer?.isAvailable) return;

    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, [open, printer?.isAvailable, fetchMetrics]);

  if (!printer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[85vh] p-4 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border-slate-700 overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base text-white flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            <span className="truncate">{printer.name} - Service</span>
          </DialogTitle>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono">{printer.ipAddress}:{printer.port}</span>
            {lastUpdated && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </DialogHeader>

        {!printer.isAvailable ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500">
            <Settings2 className="w-12 h-12 mb-3 opacity-50" />
            <p className="font-medium">Printer Offline</p>
            <p className="text-xs">Connect to view service data</p>
          </div>
        ) : isLoading && !metrics ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : metrics ? (
          <div className="space-y-4">
            {/* Primary Metrics Grid */}
            <div className="grid grid-cols-2 gap-2">
              <MetricCard 
                icon={Activity} 
                label="RPS" 
                value={metrics.rps.toFixed(2)} 
                unit="rev/s"
                status={metrics.rps > 0 ? 'good' : 'warn'}
              />
              <MetricCard 
                icon={Gauge} 
                label="Pressure" 
                value={metrics.pressure} 
                unit="PSI"
                status={metrics.pressure >= 38 && metrics.pressure <= 45 ? 'good' : 'warn'}
              />
              <MetricCard 
                icon={Thermometer} 
                label="Viscosity" 
                value={metrics.viscosity.toFixed(2)} 
                unit="cP"
                status="neutral"
              />
              <MetricCard 
                icon={Zap} 
                label="Modulation" 
                value={metrics.modulation} 
                unit="V"
                status="neutral"
              />
              <MetricCard 
                icon={Activity} 
                label="Charge" 
                value={metrics.charge} 
                unit="%"
                status={metrics.charge >= 90 ? 'good' : metrics.charge >= 70 ? 'warn' : 'error'}
              />
              <MetricCard 
                icon={Activity} 
                label="Phase Qual" 
                value={metrics.phaseQual} 
                unit="%"
                status={metrics.phaseQual >= 80 ? 'good' : metrics.phaseQual >= 60 ? 'warn' : 'error'}
              />
            </div>

            {/* Temperature Section */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs font-medium text-slate-300 mb-2 flex items-center gap-2">
                <Thermometer className="w-3 h-3" />
                Temperature
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-slate-700 flex items-center justify-center">
                    <Droplets className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Printhead</div>
                    <div className="text-sm font-bold tabular-nums text-foreground">
                      {metrics.printheadTemp?.toFixed(1) ?? '0.0'}
                      <span className="text-xs font-normal text-slate-400 ml-1">°C</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-slate-700 flex items-center justify-center">
                    <Cpu className="w-4 h-4 text-warning" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Electronics</div>
                    <div className="text-sm font-bold tabular-nums text-foreground">
                      {metrics.electronicsTemp?.toFixed(1) ?? '0.0'}
                      <span className="text-xs font-normal text-slate-400 ml-1">°C</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Consumables */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs font-medium text-slate-300 mb-2">Consumables</div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    metrics.inkLevel === 'FULL' || metrics.inkLevel === 'GOOD' 
                      ? 'bg-primary' 
                      : metrics.inkLevel === 'LOW' ? 'bg-warning' : 'bg-destructive'
                  )} />
                  <span className="text-xs text-slate-300">Ink: <span className="font-bold">{metrics.inkLevel}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    metrics.makeupLevel === 'FULL' || metrics.makeupLevel === 'GOOD' 
                      ? 'bg-warning' 
                      : metrics.makeupLevel === 'LOW' ? 'bg-warning/60' : 'bg-destructive'
                  )} />
                  <span className="text-xs text-slate-300">Makeup: <span className="font-bold">{metrics.makeupLevel}</span></span>
                </div>
              </div>
            </div>

            {/* Subsystems */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs font-medium text-slate-300 mb-2">Subsystems</div>
              <div className="flex flex-wrap gap-2">
                <SubsystemIndicator label="V300UP" active={metrics.subsystems.v300up} />
                <SubsystemIndicator label="VLT" active={metrics.subsystems.vltOn} />
                <SubsystemIndicator label="GUT" active={metrics.subsystems.gutOn} />
                <SubsystemIndicator label="MOD" active={metrics.subsystems.modOn} />
                <SubsystemIndicator label="HV" active={metrics.hvDeflection} />
              </div>
            </div>

            {/* System Info */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs font-medium text-slate-300 mb-2">Runtime</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Power Hours</span>
                  <span className="font-mono text-slate-200">{metrics.powerHours}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Stream Hours</span>
                  <span className="font-mono text-slate-200">{metrics.streamHours}</span>
                </div>
              </div>
            </div>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMetrics}
              disabled={isLoading}
              className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <RefreshCw className={cn("w-3 h-3 mr-2", isLoading && "animate-spin")} />
              Refresh Now
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500">
            <Settings2 className="w-12 h-12 mb-3 opacity-50" />
            <p className="font-medium">No data available</p>
            <Button variant="outline" size="sm" onClick={fetchMetrics} className="mt-2">
              Retry
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
