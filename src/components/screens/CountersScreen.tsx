import { RotateCcw, Pencil } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { PrinterStatus } from '@/types/printer';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

interface CountersScreenProps {
  status: PrinterStatus | null;
  isConnected: boolean;
  onHome: () => void;
  onResetCounter: (counterId: number, value: number) => void;
  onResetAll: () => void;
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

  const handleEditSubmit = () => {
    const numValue = parseInt(editValue, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      onEdit(numValue);
    }
    setIsEditing(false);
  };

  return (
    <div className="bg-gradient-to-b from-slate-100 to-slate-200 rounded-lg p-3 border border-slate-300 shadow-sm">
      <div className="flex items-center gap-2">
        {/* Counter info */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-600 font-medium truncate">{label}</div>
          {isEditing ? (
            <Input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleEditSubmit()}
              className="h-7 text-lg font-bold bg-white"
              autoFocus
              min={0}
            />
          ) : (
            <div className="text-lg md:text-xl font-bold text-slate-800 tabular-nums">
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

export function CountersScreen({
  status,
  isConnected,
  onHome,
  onResetCounter,
  onResetAll,
}: CountersScreenProps) {
  // Counter IDs from protocol:
  // 0 = Print Counter
  // 1-4 = Custom Counters
  // 6 = Product Counter

  const counters = [
    { id: 6, label: 'Product Count', value: status?.productCount ?? 0 },
    { id: 0, label: 'Print Count', value: status?.printCount ?? 0 },
    { id: 1, label: 'Counter 1', value: 0 },
    { id: 2, label: 'Counter 2', value: 0 },
    { id: 3, label: 'Counter 3', value: 0 },
    { id: 4, label: 'Counter 4', value: 0 },
  ];

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="p-4">
        <SubPageHeader title="Counters" onHome={onHome} />
      </div>

      {/* Main content area */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Counters grid */}
          <div className="bg-gradient-to-b from-slate-700 to-slate-800 rounded-xl p-4 border border-slate-600 shadow-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <div className="mt-4 pt-4 border-t border-slate-600">
              <button
                onClick={onResetAll}
                disabled={!isConnected}
                className="w-full industrial-button-danger text-white py-3 rounded-lg text-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RotateCcw className="w-5 h-5" />
                Reset All Counters
              </button>
            </div>
          </div>

          {/* Info text */}
          <p className="text-sm text-slate-400 text-center">
            Counters can be reset or manually edited using the buttons next to each counter.
          </p>
        </div>
      </div>
    </div>
  );
}
