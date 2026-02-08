import { Plus, ArrowLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

const COUNTER_OPTIONS = [
  { id: 'product_count', label: 'Product Count', description: 'Total print trigger activations' },
  { id: 'print_count', label: 'Print Count', description: 'Times message printed' },
  { id: 'counter_1', label: 'Counter 1', description: 'Programmable counter' },
  { id: 'counter_2', label: 'Counter 2', description: 'Programmable counter' },
  { id: 'counter_3', label: 'Counter 3', description: 'Programmable counter' },
  { id: 'counter_4', label: 'Counter 4', description: 'Programmable counter' },
] as const;

interface CounterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onAddField: (type: string) => void;
}

export function CounterDialog({ 
  open, 
  onOpenChange, 
  onBack,
  onAddField 
}: CounterDialogProps) {
  const handleBack = () => {
    onOpenChange(false);
    onBack();
  };

  const handleAddCounter = (counterId: string) => {
    onAddField(counterId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b">
          <button
            onClick={handleBack}
            className="industrial-button p-2 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <DialogTitle className="flex-1 text-center text-lg font-semibold pr-10">
            Counter
          </DialogTitle>
        </div>

        {/* Counter options grid */}
        <div className="bg-card p-4">
          <div className="grid grid-cols-2 gap-3">
            {COUNTER_OPTIONS.map((counter) => (
              <button
                key={counter.id}
                onClick={() => handleAddCounter(counter.id)}
                className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border border-border rounded-lg p-3 transition-colors"
              >
                <span className="text-foreground font-medium text-sm">
                  {counter.label}
                </span>
                <div className="industrial-button p-2 rounded">
                  <Plus className="w-5 h-5 text-primary" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
