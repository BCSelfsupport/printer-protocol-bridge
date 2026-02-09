import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Pencil } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';

export interface FieldSettings {
  fontSize: string;
  bold: number;      // 0-9
  gap: number;       // 0-9
  rotation: 'Normal' | 'Mirror' | 'Flip' | 'Mirror Flip';
  autoNumerals: number; // 0, 1, 2, 3, 4
}

export const defaultFieldSettings: FieldSettings = {
  fontSize: 'Standard16High',
  bold: 0,
  gap: 1,
  rotation: 'Normal',
  autoNumerals: 0,
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
  disabled?: boolean;
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
  max = 9,
  disabled = false,
}: SettingCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());

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
    <div className={`bg-gradient-to-b from-muted to-muted/60 rounded-lg p-2 border border-border ${disabled ? 'opacity-50' : ''}`}>
      {/* Mobile: stack vertically with horizontal buttons */}
      <div className="flex flex-col gap-1">
        {/* Label and value row */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
          {showInput && onEdit && !disabled && (
            <button
              onClick={() => {
                setEditValue(value.toString());
                setIsEditing(true);
              }}
              className="industrial-button text-white p-1 rounded"
              title="Edit value"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
        
        {/* Value display */}
        {isEditing && showInput ? (
          <Input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleEditSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleEditSubmit()}
            className="h-6 text-sm font-bold"
            autoFocus
            min={min}
            max={max}
          />
        ) : (
          <div className="text-sm font-bold tabular-nums">
            {typeof value === 'number' ? value : value}
          </div>
        )}
        
        {/* Buttons row - horizontal on mobile */}
        <div className="flex gap-1 mt-1">
          {showRotate ? (
            <button
              onClick={onIncrease}
              disabled={disabled}
              className="industrial-button text-white p-2 rounded disabled:opacity-50 flex-1 flex items-center justify-center"
              title="Rotate"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                onClick={onDecrease}
                disabled={disabled}
                className="industrial-button text-white p-2 rounded disabled:opacity-50 flex-1 flex items-center justify-center"
                title="Decrease"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={onIncrease}
                disabled={disabled}
                className="industrial-button text-white p-2 rounded disabled:opacity-50 flex-1 flex items-center justify-center"
                title="Increase"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const rotationValues: FieldSettings['rotation'][] = ['Normal', 'Mirror', 'Flip', 'Mirror Flip'];
const autoNumeralValues = [0, 1, 2, 3, 4];

interface FieldSettingsPanelProps {
  fontSize: string;
  bold: number;
  gap: number;
  rotation: FieldSettings['rotation'];
  autoNumerals: number;
  templateLabel: string;
  onFontSizeChange: (delta: number) => void;
  onBoldChange: (value: number) => void;
  onGapChange: (value: number) => void;
  onRotationChange: (value: FieldSettings['rotation']) => void;
  onAutoNumeralsChange: (value: number) => void;
  onTemplateChange?: (delta: number) => void;
  disabled?: boolean;
  allowedFonts: { value: string; label: string; height: number }[];
  currentFontIndex: number;
}

export function FieldSettingsPanel({
  fontSize,
  bold,
  gap,
  rotation,
  autoNumerals,
  templateLabel,
  onFontSizeChange,
  onBoldChange,
  onGapChange,
  onRotationChange,
  onAutoNumeralsChange,
  onTemplateChange,
  disabled = false,
  allowedFonts,
  currentFontIndex,
}: FieldSettingsPanelProps) {
  const fontLabel = allowedFonts.find(f => f.value === fontSize)?.label || fontSize;

  const cycleRotation = () => {
    const idx = rotationValues.indexOf(rotation);
    onRotationChange(rotationValues[(idx + 1) % rotationValues.length]);
  };

  const cycleAutoNumerals = (delta: number) => {
    const idx = autoNumeralValues.indexOf(autoNumerals);
    const newIdx = Math.max(0, Math.min(4, idx + delta));
    onAutoNumeralsChange(autoNumeralValues[newIdx]);
  };

  return (
    <div className="bg-card rounded-lg p-2 border border-border">
      <div className="grid grid-cols-3 gap-2">
        {/* Font Size */}
        <SettingCard
          label="Font Size"
          value={fontLabel}
          onIncrease={() => onFontSizeChange(1)}
          onDecrease={() => onFontSizeChange(-1)}
          disabled={disabled}
        />
        
        {/* Template - now with navigation */}
        <SettingCard
          label="Template"
          value={templateLabel}
          onIncrease={() => onTemplateChange?.(1)}
          onDecrease={() => onTemplateChange?.(-1)}
          disabled={disabled || !onTemplateChange}
        />
        
        {/* Bold */}
        <SettingCard
          label="Bold"
          value={bold}
          onIncrease={() => onBoldChange(Math.min(9, bold + 1))}
          onDecrease={() => onBoldChange(Math.max(0, bold - 1))}
          disabled={disabled}
        />
        
        {/* Gap */}
        <SettingCard
          label="Gap"
          value={gap}
          onIncrease={() => onGapChange(Math.min(9, gap + 1))}
          onDecrease={() => onGapChange(Math.max(0, gap - 1))}
          disabled={disabled}
        />
        
        {/* Rotation */}
        <SettingCard
          label="Rotation"
          value={rotation}
          onIncrease={cycleRotation}
          onDecrease={cycleRotation}
          showRotate
          disabled={disabled}
        />
        
        {/* Auto-Numerals */}
        <SettingCard
          label="Auto-Numerals"
          value={autoNumerals}
          onIncrease={() => cycleAutoNumerals(1)}
          onDecrease={() => cycleAutoNumerals(-1)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
