import { RotateCcw, Pencil } from 'lucide-react';
import { PrinterStatus } from '@/types/printer';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CountersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: PrinterStatus | null;
  isConnected: boolean;
  onResetCounter: (counterId: number, value: number) => void;
  onResetAll: () => void;
  onMount?: () => void;
}

interface CounterCardProps {
  label: string;
  value: number;
  onReset: () => void;
  onEdit: (newValue: number) => void;
  disabled?: boolean;
}

function CounterCard({ label, value, onReset, onEdit, disabled }: CounterCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());

  // Sync editValue when value changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value.toString());
    }
  }, [value, isEditing]);

  const handleEditSubmit = () => {
    const numValue = parseInt(editValue, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      onEdit(numValue);
    }
    setIsEditing(false);
  };

  return (
    <div className="bg-secondary rounded-lg p-3 border border-border shadow-sm">
      <div className="flex items-center gap-2">
        {/* Counter info */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground font-medium truncate">{label}</div>
          {isEditing ? (
            <Input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleEditSubmit()}
              className="h-7 text-lg font-bold"
              autoFocus
              min={0}
            />
          ) : (
            <div className="text-lg font-bold text-foreground tabular-nums">
              {value.toLocaleString()}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1">
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
          <button
            onClick={onReset}
            disabled={disabled}
            className="industrial-button text-white p-2 rounded disabled:opacity-50"
            title="Reset to zero"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function CountersDialog({
  open,
  onOpenChange,
  status,
  isConnected,
  onResetCounter,
  onResetAll,
  onMount,
}: CountersDialogProps) {
  // Query counters on mount
  useEffect(() => {
    if (open) {
      onMount?.();
    }
  }, [open, onMount]);

  const customCounters = status?.customCounters ?? [0, 0, 0, 0];

  const counters = [
    { id: 6, label: 'Product Count', value: status?.productCount ?? 0 },
    { id: 0, label: 'Print Count', value: status?.printCount ?? 0 },
    { id: 1, label: 'Counter 1', value: customCounters[0] ?? 0 },
    { id: 2, label: 'Counter 2', value: customCounters[1] ?? 0 },
    { id: 3, label: 'Counter 3', value: customCounters[2] ?? 0 },
    { id: 4, label: 'Counter 4', value: customCounters[3] ?? 0 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Counters</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Counters grid */}
          <div className="grid grid-cols-2 gap-3">
            {counters.map((counter) => (
              <CounterCard
                key={counter.id}
                label={counter.label}
                value={counter.value}
                onReset={() => onResetCounter(counter.id, 0)}
                onEdit={(newValue) => onResetCounter(counter.id, newValue)}
                disabled={!isConnected}
              />
            ))}
          </div>

          {/* Reset All Button */}
          <button
            onClick={onResetAll}
            disabled={!isConnected}
            className="w-full industrial-button-danger text-white py-3 rounded-lg text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RotateCcw className="w-5 h-5" />
            Reset All Counters
          </button>

          {/* Info text */}
          <p className="text-xs text-muted-foreground text-center">
            Counters can be reset or manually edited using the buttons next to each counter.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
