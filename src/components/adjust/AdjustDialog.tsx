import { ChevronUp, ChevronDown, Pencil } from 'lucide-react';
import { PrintSettings } from '@/types/printer';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PrintSettings;
  onUpdate: (settings: Partial<PrintSettings>) => void;
  onSendCommand: (command: string) => Promise<any>;
  isConnected: boolean;
}

// Validation constraints from BestCode v2.0 protocol documentation
const CONSTRAINTS = {
  width: { min: 0, max: 16000, cmd: 'PW' },   // ^PW command: 0-16000
  height: { min: 0, max: 10, cmd: 'PH' },      // ^PH command: 0-10
  delay: { min: 0, max: 4000000000, cmd: 'DA' }, // ^DA command: 0-4B
  bold: { min: 0, max: 9, cmd: 'SB' },         // ^SB command: 0-9
  gap: { min: 0, max: 9, cmd: 'GP' },          // ^GP command: 0-9
  pitch: { min: 0, max: 4000000000, cmd: 'PA' }, // ^PA command: 0-4B
} as const;

const ROTATION_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Flip', label: 'Flip' },
  { value: 'Mirror', label: 'Mirror' },
  { value: 'Mirror Flip', label: 'Mirror Flip' },
  { value: 'Tower', label: 'Tower' },
  { value: 'Tower Flip', label: 'Tower Flip' },
  { value: 'Tower Mirror', label: 'Tower Mirror' },
  { value: 'Tower Mirror Flip', label: 'Tower Mirror Flip' },
] as const;

const ORIENTATION_MAP: Record<string, number> = {
  'Normal': 0, 'Flip': 1, 'Mirror': 2, 'Mirror Flip': 3,
  'Tower': 4, 'Tower Flip': 5, 'Tower Mirror': 6, 'Tower Mirror Flip': 7,
};

const SPEED_OPTIONS: { value: PrintSettings['speed']; label: string }[] = [
  { value: 'Fast', label: 'Fast' },
  { value: 'Faster', label: 'Faster' },
  { value: 'Fastest', label: 'Fastest' },
  { value: 'Ultra Fast', label: 'Ultra Fast' },
];

const SPEED_MAP: Record<PrintSettings['speed'], number> = {
  'Fast': 0, 'Faster': 1, 'Fastest': 2, 'Ultra Fast': 3,
};

type SettingKey = keyof typeof CONSTRAINTS;

interface AdjustCardProps {
  label: string;
  value: number | string;
  onIncrease: () => void;
  onDecrease: () => void;
  onEdit?: (newValue: number) => void;
  disabled?: boolean;
  showInput?: boolean;
  min?: number;
  max?: number;
}

function AdjustCard({ 
  label, 
  value, 
  onIncrease, 
  onDecrease, 
  onEdit, 
  disabled,
  showInput = true,
  min = 0,
  max = 9999,
}: AdjustCardProps) {
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
        // Clamp to valid range
        const clampedValue = Math.max(min, Math.min(max, numValue));
        onEdit(clampedValue);
      }
    }
    setIsEditing(false);
  };

  return (
    <div className="bg-card rounded-lg p-3 border border-border shadow-sm">
      <div className="flex items-center gap-2">
        {/* Setting info */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground font-medium truncate">{label}</div>
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
            <div className="text-lg font-bold text-foreground tabular-nums">
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
              disabled={disabled}
              className="industrial-button text-white p-2 rounded disabled:opacity-50"
              title="Edit value"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onDecrease}
            disabled={disabled}
            className="industrial-button text-white p-2 rounded disabled:opacity-50"
            title="Decrease"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            onClick={onIncrease}
            disabled={disabled}
            className="industrial-button text-white p-2 rounded disabled:opacity-50"
            title="Increase"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdjustDialog({ 
  open, 
  onOpenChange, 
  settings, 
  onUpdate, 
  onSendCommand,
  isConnected 
}: AdjustDialogProps) {
  
  // Helper to update a numeric setting and send the command immediately
  const handleLiveUpdate = async (key: SettingKey, newValue: number) => {
    const constraint = CONSTRAINTS[key];
    const clampedValue = Math.max(constraint.min, Math.min(constraint.max, newValue));
    
    // Update local state
    onUpdate({ [key]: clampedValue });
    
    // Send command to printer immediately
    const command = `^${constraint.cmd} ${clampedValue}`;
    await onSendCommand(command);
  };

  // Handle rotation change via ^CM command
  const handleRotationChange = async (value: string) => {
    onUpdate({ rotation: value as PrintSettings['rotation'] });
    const orientationValue = ORIENTATION_MAP[value] ?? 0;
    await onSendCommand(`^CM o${orientationValue}`);
  };

  // Handle speed change via ^CM command
  const handleSpeedChange = async (value: PrintSettings['speed']) => {
    onUpdate({ speed: value });
    const speedValue = SPEED_MAP[value];
    await onSendCommand(`^CM s${speedValue}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adjust Settings (Live)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Settings grid - single column on mobile, 2 columns on tablet+ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Width: 0-16000 */}
            <AdjustCard
              label="Width"
              value={settings.width}
              onIncrease={() => handleLiveUpdate('width', settings.width + 1)}
              onDecrease={() => handleLiveUpdate('width', settings.width - 1)}
              onEdit={(val) => handleLiveUpdate('width', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.width.min}
              max={CONSTRAINTS.width.max}
            />

            {/* Height: 0-10 */}
            <AdjustCard
              label="Height"
              value={settings.height}
              onIncrease={() => handleLiveUpdate('height', settings.height + 1)}
              onDecrease={() => handleLiveUpdate('height', settings.height - 1)}
              onEdit={(val) => handleLiveUpdate('height', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.height.min}
              max={CONSTRAINTS.height.max}
            />

            {/* Delay: 0-4,000,000,000 */}
            <AdjustCard
              label="Delay"
              value={settings.delay}
              onIncrease={() => handleLiveUpdate('delay', settings.delay + 10)}
              onDecrease={() => handleLiveUpdate('delay', settings.delay - 10)}
              onEdit={(val) => handleLiveUpdate('delay', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.delay.min}
              max={CONSTRAINTS.delay.max}
            />

            {/* Bold: 0-9 */}
            <AdjustCard
              label="Bold"
              value={settings.bold}
              onIncrease={() => handleLiveUpdate('bold', settings.bold + 1)}
              onDecrease={() => handleLiveUpdate('bold', settings.bold - 1)}
              onEdit={(val) => handleLiveUpdate('bold', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.bold.min}
              max={CONSTRAINTS.bold.max}
            />

            {/* Gap: 0-9 */}
            <AdjustCard
              label="Gap"
              value={settings.gap}
              onIncrease={() => handleLiveUpdate('gap', settings.gap + 1)}
              onDecrease={() => handleLiveUpdate('gap', settings.gap - 1)}
              onEdit={(val) => handleLiveUpdate('gap', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.gap.min}
              max={CONSTRAINTS.gap.max}
            />

            {/* Pitch: 0-4,000,000,000 */}
            <AdjustCard
              label="Pitch"
              value={settings.pitch}
              onIncrease={() => handleLiveUpdate('pitch', settings.pitch + 1)}
              onDecrease={() => handleLiveUpdate('pitch', settings.pitch - 1)}
              onEdit={(val) => handleLiveUpdate('pitch', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.pitch.min}
              max={CONSTRAINTS.pitch.max}
            />

            {/* Rotation: Select dropdown */}
            <div className="bg-card rounded-lg p-3 border border-border shadow-sm">
              <div className="text-xs text-muted-foreground font-medium mb-1">Rotation</div>
              <Select
                value={settings.rotation}
                onValueChange={handleRotationChange}
                disabled={!isConnected}
              >
                <SelectTrigger className="h-9 text-sm font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROTATION_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Speed: Select dropdown */}
            <div className="bg-card rounded-lg p-3 border border-border shadow-sm">
              <div className="text-xs text-muted-foreground font-medium mb-1">Speed</div>
              <Select
                value={settings.speed}
                onValueChange={(v) => handleSpeedChange(v as PrintSettings['speed'])}
                disabled={!isConnected}
              >
                <SelectTrigger className="h-9 text-sm font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPEED_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
