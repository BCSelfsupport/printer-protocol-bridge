import { useEffect, useCallback, useRef, useState } from 'react';
import { PrinterMetrics } from '@/types/printer';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ConsumableDot,
  MetricRow,
  ServicePanel,
  SubsystemPill,
} from '@/components/service/ServicePanels';

interface ServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: PrinterMetrics | null;
  onMount?: () => void;
  onUnmount?: () => void;
  onSendCommand?: (command: string) => Promise<any>;
}

export function ServiceScreen({ open, onOpenChange, metrics, onMount, onUnmount, onSendCommand }: ServiceDialogProps) {
  // Notify parent when dialog is open/closed (for polling control)
  useEffect(() => {
    if (open) {
      onMount?.();
      return () => onUnmount?.();
    }
  }, [open, onMount, onUnmount]);

  const [printing, setPrinting] = useState(false);
  const handleForcePrint = useCallback(async () => {
    if (!onSendCommand || printing) return;
    setPrinting(true);
    try {
      await onSendCommand('^PT');
      toast.success('Force Print triggered');
    } catch (e) {
      toast.error('Force Print failed');
    } finally {
      setTimeout(() => setPrinting(false), 1000);
    }
  }, [onSendCommand, printing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Service</DialogTitle>
        </DialogHeader>

        <div className="flex justify-end -mt-2">
          <button
            onClick={handleForcePrint}
            disabled={!onSendCommand || printing}
            className="industrial-button text-white px-3 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
            title="Force Print"
          >
            <Printer className="w-5 h-5" />
            <span className="text-sm font-medium">{printing ? 'Printing...' : 'Force Print'}</span>
          </button>
        </div>

        {!metrics ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Connect to a printer to view service data</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
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
        )}
      </DialogContent>
    </Dialog>
  );
}
