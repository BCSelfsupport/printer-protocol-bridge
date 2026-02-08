import { ChevronUp, ChevronDown, RotateCcw, Save, X, Pencil } from 'lucide-react';
import { PrintSettings } from '@/types/printer';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';

interface AdjustScreenProps {
  settings: PrintSettings;
  onUpdate: (settings: Partial<PrintSettings>) => void;
  onSave: () => void;
  onCancel: () => void;
  onHome: () => void;
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
  showRotate?: boolean;
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
  showRotate = false,
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
              disabled={disabled}
              className="industrial-button text-white p-2 rounded disabled:opacity-50"
              title="Edit value"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {showRotate ? (
            <button
              onClick={onIncrease}
              disabled={disabled}
              className="industrial-button text-white p-2 rounded disabled:opacity-50"
              title="Rotate"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdjustScreen({ settings, onUpdate, onSave, onCancel, onHome, isConnected }: AdjustScreenProps) {

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="p-4">
        <SubPageHeader title="Adjust" onHome={onHome} />
      </div>

      {/* Main content area */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Settings grid */}
          <div className="bg-gradient-to-b from-slate-700 to-slate-800 rounded-xl p-4 border border-slate-600 shadow-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

            {/* Action Buttons */}
            <div className="mt-4 pt-4 border-t border-slate-600 flex gap-3">
              <button
                onClick={onCancel}
                disabled={!isConnected}
                className="flex-1 bg-slate-600 hover:bg-slate-500 text-white py-3 rounded-lg text-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                <X className="w-5 h-5" />
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={!isConnected}
                className="flex-1 industrial-button-success text-white py-3 rounded-lg text-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                Save to Printer
              </button>
            </div>
          </div>

          {/* Info text */}
          <p className="text-sm text-slate-400 text-center">
            Adjust print settings using the controls above. Click Save to send settings to the printer.
          </p>
        </div>
      </div>
    </div>
  );
}
