import { ChevronUp, ChevronDown, Pencil, X } from 'lucide-react';
import { PrintSettings } from '@/types/printer';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';

interface AdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PrintSettings;
  onUpdate: (settings: Partial<PrintSettings>) => void;
  onSendCommand: (command: string) => Promise<void>;
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
  repeatAmount: { min: 0, max: 30000, cmd: 'RA' }, // ^RA command: 0-30000
} as const;

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
            <div className="text-lg font-bold text-slate-800 tabular-nums">
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
  
  // Helper to update a setting and send the command immediately
  const handleLiveUpdate = async (key: SettingKey, newValue: number) => {
    const constraint = CONSTRAINTS[key];
    const clampedValue = Math.max(constraint.min, Math.min(constraint.max, newValue));
    
    // Update local state
    onUpdate({ [key]: clampedValue });
    
    // Send command to printer immediately
    const command = `^${constraint.cmd} ${clampedValue}`;
    await onSendCommand(command);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-gradient-to-b from-slate-700 to-slate-800 border-slate-600 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl text-white">Adjust Settings (Live)</DialogTitle>
          <DialogClose asChild>
            <button className="rounded-full p-1 hover:bg-white/10 transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </DialogClose>
        </DialogHeader>

        <div className="space-y-4">
          {/* Settings grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Width: 0-16000 */}
            <AdjustCard
              label="Width (0-16000)"
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
              label="Height (0-10)"
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
              label="Delay (0-4B)"
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
              label="Bold (0-9)"
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
              label="Gap (0-9)"
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
              label="Pitch (0-4B)"
              value={settings.pitch}
              onIncrease={() => handleLiveUpdate('pitch', settings.pitch + 1)}
              onDecrease={() => handleLiveUpdate('pitch', settings.pitch - 1)}
              onEdit={(val) => handleLiveUpdate('pitch', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.pitch.min}
              max={CONSTRAINTS.pitch.max}
            />

            {/* Repeat: 0-30,000 */}
            <AdjustCard
              label="Repeat (0-30000)"
              value={settings.repeatAmount}
              onIncrease={() => handleLiveUpdate('repeatAmount', settings.repeatAmount + 1)}
              onDecrease={() => handleLiveUpdate('repeatAmount', settings.repeatAmount - 1)}
              onEdit={(val) => handleLiveUpdate('repeatAmount', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.repeatAmount.min}
              max={CONSTRAINTS.repeatAmount.max}
            />
          </div>

          {/* Info text */}
          <p className="text-xs text-slate-400 text-center">
            Changes are sent to the printer immediately (^PW, ^PH, ^DA, ^SB, ^GP, ^PA, ^RA)
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
