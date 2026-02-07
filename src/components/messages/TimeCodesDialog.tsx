import { useState } from 'react';
import { RefreshCw, Plus, ArrowLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

// Time format options that cycle through
const TIME_FORMATS = [
  'HH:MM:SS',
  'HH:MM',
  'HH',
  'MM:SS',
  'MM',
  'SS',
] as const;

interface TimeCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onAddField: (type: string, format?: string) => void;
}

export function TimeCodesDialog({ 
  open, 
  onOpenChange, 
  onBack,
  onAddField 
}: TimeCodesDialogProps) {
  const [formatIndex, setFormatIndex] = useState(0);

  const currentFormat = TIME_FORMATS[formatIndex];

  const cycleFormat = () => {
    setFormatIndex((prev) => (prev + 1) % TIME_FORMATS.length);
  };

  const handleBack = () => {
    onOpenChange(false);
    onBack();
  };

  const handleAddTimeField = (subtype: string) => {
    // Pass the field type with format info
    onAddField(subtype, subtype === 'time' ? currentFormat : undefined);
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
            Time Codes
          </DialogTitle>
        </div>

        {/* Time code options */}
        <div className="bg-card p-4 space-y-3">
          {/* Format row with cycle button */}
          <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
            <span className="text-foreground font-medium text-sm">
              Format: {currentFormat}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={cycleFormat}
                className="industrial-button p-2 rounded"
                title="Cycle through formats"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleAddTimeField('time')}
                className="industrial-button p-2 rounded"
              >
                <Plus className="w-5 h-5 text-primary" />
              </button>
            </div>
          </div>

          {/* Program Hour */}
          <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
            <span className="text-foreground font-medium text-sm">
              Program Hour
            </span>
            <button
              onClick={() => handleAddTimeField('program_hour')}
              className="industrial-button p-2 rounded"
            >
              <Plus className="w-5 h-5 text-primary" />
            </button>
          </div>

          {/* Program Minute */}
          <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
            <span className="text-foreground font-medium text-sm">
              Program Minute
            </span>
            <button
              onClick={() => handleAddTimeField('program_minute')}
              className="industrial-button p-2 rounded"
            >
              <Plus className="w-5 h-5 text-primary" />
            </button>
          </div>

          {/* Program Second */}
          <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
            <span className="text-foreground font-medium text-sm">
              Program Second
            </span>
            <button
              onClick={() => handleAddTimeField('program_second')}
              className="industrial-button p-2 rounded"
            >
              <Plus className="w-5 h-5 text-primary" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
