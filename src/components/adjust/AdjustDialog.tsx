import { ChevronUp, ChevronDown, Pencil, Save, X } from 'lucide-react';
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
  onSave: () => void;
  isConnected: boolean;
}

// Validation constraints from BestCode v2.0 protocol documentation
const CONSTRAINTS = {
  width: { min: 0, max: 16000 },   // ^PW command: 0-16000
  height: { min: 0, max: 10 },      // ^PH command: 0-10
  delay: { min: 0, max: 4000000000 }, // ^DA command: 0-4B
  bold: { min: 0, max: 9 },         // ^SB command: 0-9
  gap: { min: 0, max: 9 },          // ^GP command: 0-9
  pitch: { min: 0, max: 4000000000 }, // ^PA command: 0-4B
  repeatAmount: { min: 0, max: 30000 }, // ^RA command: 0-30000
} as const;

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
  onSave, 
  isConnected 
}: AdjustDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-gradient-to-b from-slate-700 to-slate-800 border-slate-600 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl text-white">Adjust Settings</DialogTitle>
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
              onIncrease={() => onUpdate({ width: Math.min(CONSTRAINTS.width.max, settings.width + 1) })}
              onDecrease={() => onUpdate({ width: Math.max(CONSTRAINTS.width.min, settings.width - 1) })}
              onEdit={(val) => onUpdate({ width: val })}
              disabled={!isConnected}
              min={CONSTRAINTS.width.min}
              max={CONSTRAINTS.width.max}
            />

            {/* Height: 0-10 */}
            <AdjustCard
              label="Height (0-10)"
              value={settings.height}
              onIncrease={() => onUpdate({ height: Math.min(CONSTRAINTS.height.max, settings.height + 1) })}
              onDecrease={() => onUpdate({ height: Math.max(CONSTRAINTS.height.min, settings.height - 1) })}
              onEdit={(val) => onUpdate({ height: val })}
              disabled={!isConnected}
              min={CONSTRAINTS.height.min}
              max={CONSTRAINTS.height.max}
            />

            {/* Delay: 0-4,000,000,000 */}
            <AdjustCard
              label="Delay (0-4B)"
              value={settings.delay}
              onIncrease={() => onUpdate({ delay: Math.min(CONSTRAINTS.delay.max, settings.delay + 10) })}
              onDecrease={() => onUpdate({ delay: Math.max(CONSTRAINTS.delay.min, settings.delay - 10) })}
              onEdit={(val) => onUpdate({ delay: val })}
              disabled={!isConnected}
              min={CONSTRAINTS.delay.min}
              max={CONSTRAINTS.delay.max}
            />

            {/* Bold: 0-9 */}
            <AdjustCard
              label="Bold (0-9)"
              value={settings.bold}
              onIncrease={() => onUpdate({ bold: Math.min(CONSTRAINTS.bold.max, settings.bold + 1) })}
              onDecrease={() => onUpdate({ bold: Math.max(CONSTRAINTS.bold.min, settings.bold - 1) })}
              onEdit={(val) => onUpdate({ bold: val })}
              disabled={!isConnected}
              min={CONSTRAINTS.bold.min}
              max={CONSTRAINTS.bold.max}
            />

            {/* Gap: 0-9 */}
            <AdjustCard
              label="Gap (0-9)"
              value={settings.gap}
              onIncrease={() => onUpdate({ gap: Math.min(CONSTRAINTS.gap.max, settings.gap + 1) })}
              onDecrease={() => onUpdate({ gap: Math.max(CONSTRAINTS.gap.min, settings.gap - 1) })}
              onEdit={(val) => onUpdate({ gap: val })}
              disabled={!isConnected}
              min={CONSTRAINTS.gap.min}
              max={CONSTRAINTS.gap.max}
            />

            {/* Pitch: 0-4,000,000,000 */}
            <AdjustCard
              label="Pitch (0-4B)"
              value={settings.pitch}
              onIncrease={() => onUpdate({ pitch: Math.min(CONSTRAINTS.pitch.max, settings.pitch + 1) })}
              onDecrease={() => onUpdate({ pitch: Math.max(CONSTRAINTS.pitch.min, settings.pitch - 1) })}
              onEdit={(val) => onUpdate({ pitch: val })}
              disabled={!isConnected}
              min={CONSTRAINTS.pitch.min}
              max={CONSTRAINTS.pitch.max}
            />

            {/* Repeat: 0-30,000 */}
            <AdjustCard
              label="Repeat (0-30000)"
              value={settings.repeatAmount}
              onIncrease={() => onUpdate({ repeatAmount: Math.min(CONSTRAINTS.repeatAmount.max, settings.repeatAmount + 1) })}
              onDecrease={() => onUpdate({ repeatAmount: Math.max(CONSTRAINTS.repeatAmount.min, settings.repeatAmount - 1) })}
              onEdit={(val) => onUpdate({ repeatAmount: val })}
              disabled={!isConnected}
              min={CONSTRAINTS.repeatAmount.min}
              max={CONSTRAINTS.repeatAmount.max}
            />
          </div>

          {/* Save Button */}
          <button
            onClick={() => {
              onSave();
              onOpenChange(false);
            }}
            disabled={!isConnected}
            className="w-full industrial-button-success text-white py-3 rounded-lg text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            Save to Printer
          </button>

          {/* Info text */}
          <p className="text-xs text-slate-400 text-center">
            These global settings affect the currently printing message (^PW, ^PH, ^DA, ^SB, ^GP, ^PA, ^RA)
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
