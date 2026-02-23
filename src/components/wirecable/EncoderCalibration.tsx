import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
          <Label className="text-sm">Wheel Diameter (mm)</Label>
          <Input
            type="number"
            value={config.wheelDiameterMm}
            onChange={(e) => onChange({ ...config, wheelDiameterMm: parseFloat(e.target.value) || 0 })}
            step={0.01}
            min={0}
          />
          <span className="text-xs text-muted-foreground">
            Circumference: {circumference.toFixed(2)} mm
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

        <div className="space-y-2">
          <Label className="text-sm">Pitch Unit</Label>
          <Select value={config.unit} onValueChange={(v) => onChange({ ...config, unit: v as 'mm' | 'inches' })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mm">Millimeters (mm)</SelectItem>
              <SelectItem value="inches">Inches (in)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
          <div className="font-medium text-foreground">Resolution</div>
          <div className="text-muted-foreground">
            <span className="font-mono">{mmPerPulse.toFixed(4)}</span> mm/pulse
          </div>
          <div className="text-muted-foreground">
            <span className="font-mono">{(mmPerPulse / 25.4).toFixed(6)}</span> in/pulse
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
