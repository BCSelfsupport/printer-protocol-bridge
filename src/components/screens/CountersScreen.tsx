import { RotateCcw } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Button } from '@/components/ui/button';
import { PrinterStatus } from '@/types/printer';

interface CountersScreenProps {
  status: PrinterStatus | null;
  isConnected: boolean;
  onHome: () => void;
  onResetCounter: (counterId: number, value: number) => void;
  onResetAll: () => void;
}

interface CounterRowProps {
  label: string;
  value: number;
  onReset: () => void;
  disabled?: boolean;
}

function CounterRow({ label, value, onReset, disabled }: CounterRowProps) {
  return (
    <div className="flex items-center justify-between bg-card rounded-lg p-4">
      <div className="flex-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="text-2xl font-bold">{value}</div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onReset}
        disabled={disabled}
        className="flex items-center gap-2"
      >
        <RotateCcw className="w-4 h-4" />
        Reset
      </Button>
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

  return (
    <div className="flex-1 flex flex-col">
      <SubPageHeader title="Printer Counts" onHome={onHome} />

      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Product Counter */}
        <CounterRow
          label="Product Count"
          value={status?.productCount ?? 0}
          onReset={() => onResetCounter(6, 0)}
          disabled={!isConnected}
        />

        {/* Print Counter */}
        <CounterRow
          label="Print Count"
          value={status?.printCount ?? 0}
          onReset={() => onResetCounter(0, 0)}
          disabled={!isConnected}
        />

        {/* Custom Counters 1-4 */}
        {[1, 2, 3, 4].map((id) => (
          <CounterRow
            key={id}
            label={`Custom Counter ${id}`}
            value={0} // TODO: Add custom counter values to status
            onReset={() => onResetCounter(id, 0)}
            disabled={!isConnected}
          />
        ))}

        {/* Reset All Button */}
        <div className="pt-4">
          <Button
            onClick={onResetAll}
            disabled={!isConnected}
            className="w-full industrial-button-danger text-white py-6 text-lg"
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            Reset All Counters
          </Button>
        </div>
      </div>
    </div>
  );
}
