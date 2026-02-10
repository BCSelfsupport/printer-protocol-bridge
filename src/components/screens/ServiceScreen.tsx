import { useEffect, useCallback } from 'react';
import { PrinterMetrics } from '@/types/printer';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import {
  ConsumableDot,
  MetricRow,
  ServicePanel,
  SubsystemPill,
} from '@/components/service/ServicePanels';

interface ServiceScreenProps {
  metrics: PrinterMetrics | null;
  onHome: () => void;
  onControl: () => void;
  onMount?: () => void;
  onUnmount?: () => void;
  onSendCommand?: (command: string) => Promise<any>;
}

export function ServiceScreen({ metrics, onHome, onControl, onMount, onUnmount, onSendCommand }: ServiceScreenProps) {
  // Notify parent when screen is mounted/unmounted (for polling control)
  useEffect(() => {
    onMount?.();
    return () => onUnmount?.();
  }, [onMount, onUnmount]);

  const handleForcePrint = useCallback(async () => {
    if (!onSendCommand) return;
    try {
      await onSendCommand('^PT');
      toast.success('Force Print triggered');
    } catch (e) {
      toast.error('Force Print failed');
    }
  }, [onSendCommand]);

  if (!metrics) {
    return (
      <div className="flex-1 p-4 flex items-center justify-center">
        <p className="text-muted-foreground">Connect to a printer to view service data</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-industrial-dark">
      <div className="border-b bg-industrial-dark px-4 py-3">
        <div className="max-w-6xl mx-auto">
          <SubPageHeader
            title="Service"
            onHome={onControl}
            rightContent={
              <button
                onClick={handleForcePrint}
                disabled={!onSendCommand}
                className="industrial-button text-white px-3 py-2 md:px-4 md:py-3 rounded-lg flex items-center gap-2 disabled:opacity-50"
                title="Force Print (^PT)"
              >
                <Printer className="w-5 h-5 md:w-6 md:h-6" />
                <span className="hidden md:inline text-sm font-medium">Force Print</span>
              </button>
            }
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: Primary metrics */}
          <ServicePanel title="Primary Metrics">
            <MetricRow label="Modulation" value={metrics.modulation} unit="Volts" />
            <MetricRow label="Pressure" value={metrics.pressure} unit="PSI" />
            <MetricRow label="Charge" value={metrics.charge} unit="%" />
            <MetricRow label="RPS" value={metrics.rps.toFixed(2)} unit="rev/s" />
            <MetricRow label="Phase Quality" value={metrics.phaseQual} unit="%" />
            <MetricRow label="Viscosity" value={metrics.viscosity.toFixed(2)} unit="cP" />
          </ServicePanel>

          {/* RIGHT: status panels */}
          <div className="space-y-6">
            <ServicePanel title="Subsystems">
              <div className="grid grid-cols-2 gap-3 p-4 bg-card">
                <SubsystemPill label="V300UP" active={metrics.subsystems.v300up} />
                <SubsystemPill label="VLT" active={metrics.subsystems.vltOn} />
                <SubsystemPill label="GUT" active={metrics.subsystems.gutOn} />
                <SubsystemPill label="MOD" active={metrics.subsystems.modOn} />
              </div>
            </ServicePanel>

            <ServicePanel title="Consumables">
              <div className="flex items-center justify-between p-6 bg-background">
                <ConsumableDot label="Ink" level={metrics.inkLevel} intent="ink" />
                <div className="h-8 w-px bg-border" />
                <ConsumableDot label="Makeup" level={metrics.makeupLevel} intent="makeup" />
              </div>
            </ServicePanel>

            <ServicePanel title="Temperature">
              <MetricRow label="Printhead" value={metrics.printheadTemp?.toFixed(1) ?? '0.0'} unit="°C" />
              <MetricRow label="Electronics" value={metrics.electronicsTemp?.toFixed(1) ?? '0.0'} unit="°C" />
            </ServicePanel>

            <ServicePanel title="System Info">
              <MetricRow label="Allow Errors" value={metrics.allowErrors ? "On" : "Off"} />
              <MetricRow label="Error Active" value={metrics.errorActive ? "Yes" : "No"} />
              <MetricRow label="HV Deflection" value={metrics.hvDeflection ? "Enabled" : "Disabled"} />
              <MetricRow label="Power Hours" value={metrics.powerHours} />
              <MetricRow label="Stream Hours" value={metrics.streamHours} />
            </ServicePanel>
          </div>
        </div>
      </div>
    </div>
  );
}
