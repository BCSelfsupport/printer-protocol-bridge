import { ChevronUp, ChevronDown, RotateCcw, Pencil } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Per-message settings that are STORED with the message via ^CM
// According to BestCode v2.0 protocol, ^CM parameters are:
// t = Template size (0-16) - handled by template selection
// s = Print Speed (0=Fast, 1=Faster, 2=Fastest, 3=Ultra Fast)
// o = Orientation (0=Normal, 1=Flip, 2=Mirror, 3=Mirror Flip)
// p = Print Mode (0=Normal, 1=Auto, 2=Repeat, 3=Reverse)
export interface MessageSettings {
  speed: 'Fast' | 'Faster' | 'Fastest' | 'Ultra Fast';
  rotation: 'Normal' | 'Mirror' | 'Flip' | 'Mirror Flip';
  printMode: 'Normal' | 'Auto' | 'Repeat' | 'Reverse';
}

export const defaultMessageSettings: MessageSettings = {
  speed: 'Fastest',
  rotation: 'Normal',
  printMode: 'Normal',
};

interface SettingCardProps {
  label: string;
  value: string | number;
  onIncrease: () => void;
  onDecrease: () => void;
  onEdit?: (newValue: number) => void;
  showInput?: boolean;
  showRotate?: boolean;
  min?: number;
  max?: number;
}

function SettingCard({ 
  label, 
  value, 
  onIncrease, 
  onDecrease, 
  onEdit, 
  showInput = false,
  showRotate = false,
  min = 0,
  max = 9999,
}: SettingCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());

  // Sync editValue when value changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value.toString());
    }
  }, [value, isEditing]);

  const handleEditSubmit = () => {
    if (onEdit && typeof value === 'number') {
      const numValue = parseInt(editValue, 10);
      if (!isNaN(numValue)) {
        const clampedValue = Math.max(min, Math.min(max, numValue));
        onEdit(clampedValue);
      }
    }
    setIsEditing(false);
  };

  return (
    <div className="bg-gradient-to-b from-slate-100 to-slate-200 rounded-lg p-3 border border-slate-300 shadow-sm">
      <div className="flex items-center gap-2">
        {/* Setting info */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-600 font-medium truncate">{label}</div>
          {isEditing && showInput ? (
            <Input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleEditSubmit()}
              className="h-7 text-lg font-bold bg-white"
              autoFocus
              min={min}
              max={max}
            />
          ) : (
            <div className="text-lg md:text-xl font-bold text-slate-800 tabular-nums">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1">
          {showInput && onEdit && (
            <button
              onClick={() => {
                setEditValue(value.toString());
                setIsEditing(true);
              }}
              className="industrial-button text-white p-2 rounded"
              title="Edit value"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {showRotate ? (
            <button
              onClick={onIncrease}
              className="industrial-button text-white p-2 rounded"
              title="Rotate"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                onClick={onDecrease}
                className="industrial-button text-white p-2 rounded"
                title="Decrease"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={onIncrease}
                className="industrial-button text-white p-2 rounded"
                title="Increase"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
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

const rotationValues: MessageSettings['rotation'][] = ['Normal', 'Mirror', 'Flip', 'Mirror Flip'];
const speedValues: MessageSettings['speed'][] = ['Fast', 'Faster', 'Fastest', 'Ultra Fast'];
const printModeValues: MessageSettings['printMode'][] = ['Normal', 'Auto', 'Repeat', 'Reverse'];

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
    onUpdate({ speed: speedValues[Math.min(3, idx + 1)] });
  };

  const cycleSpeedDown = () => {
    const idx = speedValues.indexOf(settings.speed);
    onUpdate({ speed: speedValues[Math.max(0, idx - 1)] });
  };

  const cyclePrintModeUp = () => {
    const idx = printModeValues.indexOf(settings.printMode ?? 'Normal');
    onUpdate({ printMode: printModeValues[Math.min(3, idx + 1)] });
  };

  const cyclePrintModeDown = () => {
    const idx = printModeValues.indexOf(settings.printMode ?? 'Normal');
    onUpdate({ printMode: printModeValues[Math.max(0, idx - 1)] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[80vh] overflow-y-auto p-4 md:p-6 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base md:text-lg text-white">Message Settings</DialogTitle>
        </DialogHeader>
        
        <div className="bg-gradient-to-b from-slate-700 to-slate-800 rounded-xl p-4 border border-slate-600 shadow-xl">
          <div className="space-y-3">
            {/* Speed: Fast, Faster, Fastest, Ultra Fast */}
            <SettingCard
              label="Speed (s)"
              value={settings.speed}
              onIncrease={cycleSpeedUp}
              onDecrease={cycleSpeedDown}
              showInput={false}
            />

            {/* Rotation: Normal, Mirror, Flip, Mirror Flip */}
            <SettingCard
              label="Orientation (o)"
              value={settings.rotation}
              onIncrease={cycleRotation}
              onDecrease={cycleRotation}
              showInput={false}
              showRotate
            />

            {/* Print Mode: Normal, Auto, Repeat, Reverse */}
            <SettingCard
              label="Print Mode (p)"
              value={settings.printMode ?? 'Normal'}
              onIncrease={cyclePrintModeUp}
              onDecrease={cyclePrintModeDown}
              showInput={false}
            />
          </div>
          
          {/* Info text */}
          <p className="text-xs text-slate-400 text-center mt-4">
            These settings are stored with the message via ^CM command
          </p>
          <p className="text-[10px] text-slate-500 text-center mt-1">
            Template (t) is set via template selection • s=Speed • o=Orientation • p=PrintMode
          </p>
        </div>
        
        <DialogFooter className="mt-4">
          <Button 
            onClick={() => onOpenChange(false)}
            className="industrial-button-success text-white"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
