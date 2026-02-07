import { ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface MessageSettings {
  width: number;
  height: number;
  delay: number;
  rotation: 'Normal' | 'Inverted' | 'Mirrored' | 'Rotated';
  bold: number;
  speed: 'Slow' | 'Normal' | 'Fast';
  gap: number;
  pitch: number;
  repeatAmount: number;
}

export const defaultMessageSettings: MessageSettings = {
  width: 15,
  height: 8,
  delay: 100,
  rotation: 'Normal',
  bold: 0,
  speed: 'Fast',
  gap: 0,
  pitch: 0,
  repeatAmount: 0,
};

interface SettingsRowProps {
  label: string;
  value: string | number;
  onIncrease: () => void;
  onDecrease: () => void;
  showInput?: boolean;
  showRotate?: boolean;
}

function SettingsRow({ label, value, onIncrease, onDecrease, showInput = true, showRotate = false }: SettingsRowProps) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 flex items-center justify-between gap-2">
      <span className="text-primary text-base font-medium whitespace-nowrap">{label}: {value}</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {showInput && (
          <div className="w-12 h-8 bg-card border rounded" />
        )}
        {showRotate ? (
          <button 
            onClick={onIncrease}
            className="industrial-button text-white p-2 rounded-lg"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        ) : (
          <>
            <button 
              onClick={onDecrease}
              className="industrial-button text-white p-2 rounded-lg"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <button 
              onClick={onIncrease}
              className="industrial-button text-white p-2 rounded-lg"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface MessageSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: MessageSettings;
  onUpdate: (settings: Partial<MessageSettings>) => void;
}

const rotationValues: MessageSettings['rotation'][] = ['Normal', 'Inverted', 'Mirrored', 'Rotated'];
const speedValues: MessageSettings['speed'][] = ['Slow', 'Normal', 'Fast'];

export function MessageSettingsDialog({
  open,
  onOpenChange,
  settings,
  onUpdate,
}: MessageSettingsDialogProps) {
  const cycleRotation = () => {
    const idx = rotationValues.indexOf(settings.rotation);
    onUpdate({ rotation: rotationValues[(idx + 1) % rotationValues.length] });
  };

  const cycleSpeedUp = () => {
    const idx = speedValues.indexOf(settings.speed);
    onUpdate({ speed: speedValues[Math.min(2, idx + 1)] });
  };

  const cycleSpeedDown = () => {
    const idx = speedValues.indexOf(settings.speed);
    onUpdate({ speed: speedValues[Math.max(0, idx - 1)] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Message Settings</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-4">
          <SettingsRow
            label="Width"
            value={settings.width}
            onIncrease={() => onUpdate({ width: settings.width + 1 })}
            onDecrease={() => onUpdate({ width: Math.max(0, settings.width - 1) })}
          />
          <SettingsRow
            label="Height"
            value={settings.height}
            onIncrease={() => onUpdate({ height: settings.height + 1 })}
            onDecrease={() => onUpdate({ height: Math.max(0, settings.height - 1) })}
            showInput={false}
          />

          <SettingsRow
            label="Delay"
            value={settings.delay}
            onIncrease={() => onUpdate({ delay: settings.delay + 10 })}
            onDecrease={() => onUpdate({ delay: Math.max(0, settings.delay - 10) })}
          />
          <SettingsRow
            label="Rotation"
            value={settings.rotation}
            onIncrease={cycleRotation}
            onDecrease={cycleRotation}
            showInput={false}
            showRotate
          />

          <SettingsRow
            label="Bold"
            value={settings.bold}
            onIncrease={() => onUpdate({ bold: settings.bold + 1 })}
            onDecrease={() => onUpdate({ bold: Math.max(0, settings.bold - 1) })}
          />
          <SettingsRow
            label="Speed"
            value={settings.speed}
            onIncrease={cycleSpeedUp}
            onDecrease={cycleSpeedDown}
            showInput={false}
          />

          <SettingsRow
            label="Gap"
            value={settings.gap}
            onIncrease={() => onUpdate({ gap: settings.gap + 1 })}
            onDecrease={() => onUpdate({ gap: Math.max(0, settings.gap - 1) })}
          />
          <SettingsRow
            label="Pitch"
            value={settings.pitch}
            onIncrease={() => onUpdate({ pitch: settings.pitch + 1 })}
            onDecrease={() => onUpdate({ pitch: Math.max(0, settings.pitch - 1) })}
          />

          <SettingsRow
            label="Repeat amount"
            value={settings.repeatAmount}
            onIncrease={() => onUpdate({ repeatAmount: settings.repeatAmount + 1 })}
            onDecrease={() => onUpdate({ repeatAmount: Math.max(0, settings.repeatAmount - 1) })}
          />
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
