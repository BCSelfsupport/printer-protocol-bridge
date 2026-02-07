import { useState } from 'react';
import { RefreshCw, Plus, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

// Date format options that cycle through
const DATE_FORMATS = [
  'DD/MM/YY',
  'MM/DD/YY',
  'YY/MM/DD',
  'DD-MM-YY',
  'MM-DD-YY',
  'YY-MM-DD',
  'DD.MM.YY',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY/MM/DD',
] as const;

type DateType = 'normal' | 'expiry' | 'rollover' | 'expiry_rollover';

interface DateTypeOption {
  id: DateType;
  label: string;
}

const DATE_TYPE_OPTIONS: DateTypeOption[] = [
  { id: 'normal', label: 'Normal Date' },
  { id: 'expiry', label: 'Expiry Date' },
  { id: 'rollover', label: 'Rollover Date' },
  { id: 'expiry_rollover', label: 'Expiry Rollover Date' },
];

interface DateCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onAddField: (type: string, format?: string) => void;
}

export function DateCodesDialog({ 
  open, 
  onOpenChange, 
  onBack,
  onAddField 
}: DateCodesDialogProps) {
  const [selectedType, setSelectedType] = useState<DateType | null>(null);
  const [formatIndex, setFormatIndex] = useState(0);

  const currentFormat = DATE_FORMATS[formatIndex];

  const cycleFormat = () => {
    setFormatIndex((prev) => (prev + 1) % DATE_FORMATS.length);
  };

  const handleBack = () => {
    if (selectedType) {
      // Go back to type selection
      setSelectedType(null);
    } else {
      // Go back to AutoCode menu
      onOpenChange(false);
      onBack();
    }
  };

  const handleSelectType = (type: DateType) => {
    setSelectedType(type);
  };

  const handleAddDateField = (subtype?: string) => {
    // Combine selected type with format
    const fieldType = `date_${selectedType}${subtype ? `_${subtype}` : ''}`;
    onAddField(fieldType, currentFormat);
    onOpenChange(false);
    setSelectedType(null);
  };

  const getTitle = () => {
    if (!selectedType) return 'Date Codes';
    const option = DATE_TYPE_OPTIONS.find(o => o.id === selectedType);
    return option?.label || 'Date Codes';
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) setSelectedType(null);
      onOpenChange(open);
    }}>
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
            {getTitle()}
          </DialogTitle>
        </div>

        {/* Content */}
        <div className="bg-card p-4 space-y-3">
          {!selectedType ? (
            // Type selection menu
            <div className="grid grid-cols-2 gap-3">
              {DATE_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleSelectType(option.id)}
                  className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3 hover:bg-muted/80 transition-colors"
                >
                  <span className="text-foreground font-medium text-sm">
                    {option.label}
                  </span>
                  <div className="industrial-button p-1.5 rounded">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            // Format selection for the selected type
            <>
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
                    onClick={() => handleAddDateField()}
                    className="industrial-button p-2 rounded"
                  >
                    <Plus className="w-5 h-5 text-primary" />
                  </button>
                </div>
              </div>

              {/* Program Day */}
              <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
                <span className="text-foreground font-medium text-sm">
                  Program Day
                </span>
                <button
                  onClick={() => handleAddDateField('day')}
                  className="industrial-button p-2 rounded"
                >
                  <Plus className="w-5 h-5 text-primary" />
                </button>
              </div>

              {/* Program Month */}
              <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
                <span className="text-foreground font-medium text-sm">
                  Program Month
                </span>
                <button
                  onClick={() => handleAddDateField('month')}
                  className="industrial-button p-2 rounded"
                >
                  <Plus className="w-5 h-5 text-primary" />
                </button>
              </div>

              {/* Program Year */}
              <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
                <span className="text-foreground font-medium text-sm">
                  Program Year
                </span>
                <button
                  onClick={() => handleAddDateField('year')}
                  className="industrial-button p-2 rounded"
                >
                  <Plus className="w-5 h-5 text-primary" />
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
