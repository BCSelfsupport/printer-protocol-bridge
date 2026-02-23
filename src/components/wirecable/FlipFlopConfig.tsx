import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RotateCcw, ArrowLeftRight } from 'lucide-react';

const ROTATION_OPTIONS = [
  'Normal', 'Flip', 'Mirror', 'Mirror Flip',
  'Tower', 'Tower Flip', 'Tower Mirror', 'Tower Mirror Flip',
] as const;

export interface FlipFlopSettings {
  enabled: boolean;
  orientationA: string;
  orientationB: string;
}

interface FlipFlopConfigProps {
  config: FlipFlopSettings;
  onChange: (config: FlipFlopSettings) => void;
  isConnected: boolean;
  onSendCommand: (command: string) => Promise<any>;
}

export function FlipFlopConfig({ config, onChange, isConnected }: FlipFlopConfigProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RotateCcw className="w-4 h-4" />
          Flip-Flop Rotation
          <span className="ml-auto">
            <Switch
              checked={config.enabled}
              onCheckedChange={(enabled) => onChange({ ...config, enabled })}
              disabled={!isConnected}
            />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Alternates print orientation on each print so the code is readable from either side of the cable.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Orientation A */}
          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-1">
              <span className="w-5 h-5 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">A</span>
              Odd Prints
            </Label>
            <Select
              value={config.orientationA}
              onValueChange={(v) => onChange({ ...config, orientationA: v })}
              disabled={!config.enabled || !isConnected}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROTATION_OPTIONS.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Visual arrow between */}
          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-1">
              <span className="w-5 h-5 rounded bg-accent text-accent-foreground flex items-center justify-center text-xs font-bold">B</span>
              Even Prints
            </Label>
            <Select
              value={config.orientationB}
              onValueChange={(v) => onChange({ ...config, orientationB: v })}
              disabled={!config.enabled || !isConnected}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROTATION_OPTIONS.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Preview of alternation */}
        {config.enabled && (
          <div className="bg-muted/50 rounded-md p-3 flex items-center justify-center gap-3">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Print 1</div>
              <div className="w-20 h-10 rounded border border-primary bg-card flex items-center justify-center text-xs font-bold">
                {config.orientationA}
              </div>
            </div>
            <ArrowLeftRight className="w-5 h-5 text-primary shrink-0" />
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Print 2</div>
              <div className={`w-20 h-10 rounded border border-accent bg-card flex items-center justify-center text-xs font-bold ${
                config.orientationB.includes('Flip') ? 'scale-y-[-1]' : ''
              } ${config.orientationB.includes('Mirror') ? 'scale-x-[-1]' : ''}`}>
                {config.orientationB}
              </div>
            </div>
            <ArrowLeftRight className="w-5 h-5 text-primary shrink-0" />
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Print 3</div>
              <div className="w-20 h-10 rounded border border-primary bg-card flex items-center justify-center text-xs font-bold">
                {config.orientationA}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
