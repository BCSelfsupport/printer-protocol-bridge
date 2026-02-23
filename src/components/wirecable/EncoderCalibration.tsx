import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings2 } from 'lucide-react';

export interface EncoderConfig {
  wheelDiameterMm: number;
  pulsesPerRevolution: number;
  unit: 'mm' | 'inches';
}

interface EncoderCalibrationProps {
  config: EncoderConfig;
  onChange: (config: EncoderConfig) => void;
}

export function EncoderCalibration({ config, onChange }: EncoderCalibrationProps) {
  const circumference = Math.PI * config.wheelDiameterMm;
  const mmPerPulse = circumference / config.pulsesPerRevolution;
  const isImperial = config.unit === 'inches';

  const diameterDisplay = isImperial
    ? parseFloat((config.wheelDiameterMm / 25.4).toFixed(4))
    : config.wheelDiameterMm;

  const circumferenceDisplay = isImperial
    ? (circumference / 25.4).toFixed(4)
    : circumference.toFixed(2);

  const diameterUnit = isImperial ? 'in' : 'mm';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          Encoder Calibration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm">Wheel Diameter ({diameterUnit})</Label>
          <Input
            type="number"
            value={diameterDisplay}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              const mm = isImperial ? val * 25.4 : val;
              onChange({ ...config, wheelDiameterMm: mm });
            }}
            step={isImperial ? 0.001 : 0.01}
            min={0}
          />
          <span className="text-xs text-muted-foreground">
            Circumference: {circumferenceDisplay} {diameterUnit}
          </span>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Pulses Per Revolution (PPR)</Label>
          <Input
            type="number"
            value={config.pulsesPerRevolution}
            onChange={(e) => onChange({ ...config, pulsesPerRevolution: parseInt(e.target.value) || 1 })}
            min={1}
          />
        </div>

        <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
          <div className="font-medium text-foreground">Resolution</div>
          <div className="text-muted-foreground">
            <span className="font-mono">{isImperial ? (mmPerPulse / 25.4).toFixed(6) : mmPerPulse.toFixed(4)}</span> {isImperial ? 'in' : 'mm'}/pulse
          </div>
          <div className="text-muted-foreground">
            <span className="font-mono">{isImperial ? mmPerPulse.toFixed(4) : (mmPerPulse / 25.4).toFixed(6)}</span> {isImperial ? 'mm' : 'in'}/pulse
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
