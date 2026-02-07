import { Clock, Calendar, Hash, Layers, ChevronRight, Plus, ArrowLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

const AUTOCODE_TYPES = [
  { value: 'time', label: 'Time Codes', icon: Clock, action: 'submenu' },
  { value: 'date', label: 'Date Codes', icon: Calendar, action: 'submenu' },
  { value: 'counter', label: 'Counter', icon: Hash, action: 'submenu' },
  { value: 'shift', label: 'Shift Codes', icon: Layers, action: 'add' },
] as const;

interface AutoCodeFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onSelectType: (type: string, format?: string) => void;
  onOpenTimeCodes: () => void;
  onOpenDateCodes: () => void;
}

export function AutoCodeFieldDialog({ 
  open, 
  onOpenChange, 
  onBack,
  onSelectType,
  onOpenTimeCodes,
  onOpenDateCodes,
}: AutoCodeFieldDialogProps) {
  const handleSelect = (autoCodeType: typeof AUTOCODE_TYPES[number]) => {
    if (autoCodeType.value === 'time') {
      onOpenChange(false);
      onOpenTimeCodes();
      return;
    }
    if (autoCodeType.value === 'date') {
      onOpenChange(false);
      onOpenDateCodes();
      return;
    }
    // For other types, add field directly for now
    onSelectType(autoCodeType.value);
    onOpenChange(false);
  };

  const handleBack = () => {
    onOpenChange(false);
    onBack();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Header styled like the reference */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b">
          <button
            onClick={handleBack}
            className="industrial-button p-2 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <DialogTitle className="flex-1 text-center text-lg font-semibold pr-10">
            AutoCode Field
          </DialogTitle>
        </div>

        {/* AutoCode type grid */}
        <div className="bg-card p-4">
          <div className="grid grid-cols-2 gap-3">
            {AUTOCODE_TYPES.map((autoCodeType) => (
              <button
                key={autoCodeType.value}
                onClick={() => handleSelect(autoCodeType)}
                className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border border-border rounded-lg p-3 transition-colors group"
              >
                <span className="text-foreground font-medium text-sm">
                  {autoCodeType.label}
                </span>
                <div className="industrial-button p-2 rounded">
                  {autoCodeType.action === 'add' ? (
                    <Plus className="w-5 h-5 text-primary" />
                  ) : (
                    <ChevronRight className="w-5 h-5" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
