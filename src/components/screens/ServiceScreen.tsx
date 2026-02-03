import { PrinterMetrics } from '@/types/printer';
import { SubPageHeader } from '@/components/layout/SubPageHeader';

interface ServiceScreenProps {
  metrics: PrinterMetrics | null;
  onHome: () => void;
}

interface MetricRowProps {
  label: string;
  value: string | number;
  unit?: string;
  subLabel?: string;
  subValue?: string;
  subUnit?: string;
}

function MetricRow({ label, value, unit, subLabel, subValue, subUnit }: MetricRowProps) {
  return (
    <div className="bg-card rounded-lg p-4">
      <div className="flex items-center justify-between">
        <span className="text-foreground font-medium">{label}:</span>
        <div className="flex items-center gap-2">
          {subLabel && (
            <>
              <span className="text-muted-foreground">{subLabel}:</span>
              <span className="font-bold min-w-[80px] text-right">{subValue}</span>
              <span className="text-muted-foreground">{subUnit}</span>
            </>
          )}
          {!subLabel && (
            <>
              <span className="font-bold min-w-[80px] text-right">{value}</span>
              {unit && <span className="text-muted-foreground min-w-[40px]">{unit}</span>}
            </>
          )}
        </div>
      </div>
      {subLabel && (
        <div className="flex items-center justify-end gap-2 mt-2">
          <span className="text-muted-foreground">Stream:</span>
          <span className="font-bold min-w-[80px] text-right">{value}</span>
          <span className="text-muted-foreground">{unit}</span>
        </div>
      )}
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
    <div className="flex-1 p-4 flex flex-col">
      <SubPageHeader title="Service" onHome={onHome} />

      <div className="grid grid-cols-2 gap-4">
        {/* Run time hours */}
        <div className="bg-card rounded-lg p-4">
          <div className="text-foreground font-medium mb-2">Run time hours:</div>
          <div className="flex justify-between">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Power:</span>
              <span className="font-bold">{metrics.powerHours}</span>
              <span className="text-muted-foreground">hours</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-muted-foreground">Stream:</span>
            <span className="font-bold">{metrics.streamHours}</span>
            <span className="text-muted-foreground">hours</span>
          </div>
        </div>

        {/* Viscosity */}
        <div className="bg-card rounded-lg p-4 flex items-center justify-between">
          <span className="text-foreground font-medium">Viscosity:</span>
          <div className="flex items-center gap-2">
            <span className="font-bold">{metrics.viscosity.toFixed(2)}</span>
            <span className="text-muted-foreground">cP</span>
          </div>
        </div>

        {/* Modulation */}
        <div className="bg-card rounded-lg p-4 flex items-center justify-between">
          <span className="text-foreground font-medium">Modulation:</span>
          <div className="flex items-center gap-2">
            <span className="font-bold">{metrics.modulation}</span>
            <span className="text-muted-foreground">Volts</span>
          </div>
        </div>

        {/* Charge */}
        <div className="bg-card rounded-lg p-4 flex items-center justify-between">
          <span className="text-foreground font-medium">Charge:</span>
          <div className="flex items-center gap-2">
            <span className="font-bold">{metrics.charge}</span>
            <span className="text-muted-foreground">%</span>
          </div>
        </div>

        {/* Pressure */}
        <div className="bg-card rounded-lg p-4 flex items-center justify-between">
          <span className="text-foreground font-medium">Pressure:</span>
          <div className="flex items-center gap-2">
            <span className="font-bold">{metrics.pressure}</span>
            <span className="text-muted-foreground">PSI</span>
          </div>
        </div>

        {/* RPS */}
        <div className="bg-card rounded-lg p-4 flex items-center justify-between">
          <span className="text-foreground font-medium">RPS:</span>
          <div className="flex items-center gap-2">
            <span className="font-bold">{metrics.rps.toFixed(2)}</span>
            <span className="text-muted-foreground">RPS</span>
          </div>
        </div>

        {/* Phase Qual */}
        <div className="bg-card rounded-lg p-4 flex items-center justify-between">
          <span className="text-foreground font-medium">Phase Qual:</span>
          <div className="flex items-center gap-2">
            <span className="font-bold">{metrics.phaseQual}</span>
            <span className="text-muted-foreground">%</span>
          </div>
        </div>

        {/* HV Deflection */}
        <div className="bg-card rounded-lg p-4 flex items-center justify-between">
          <span className="text-foreground font-medium">HV Deflection:</span>
          <span className="font-bold">{metrics.hvDeflection ? 'On' : 'Off'}</span>
        </div>
      </div>
    </div>
  );
}
