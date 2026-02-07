import { useState } from 'react';
import { RefreshCw, Plus, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Date format options that cycle through
const DATE_FORMATS = [
  'MMDDYY',
  'DDMMYY',
  'YYMMDD',
  'MM/DD/YY',
  'DD/MM/YY',
  'YY/MM/DD',
  'MM-DD-YY',
  'DD-MM-YY',
  'YY-MM-DD',
  'MM.DD.YY',
  'DD.MM.YY',
] as const;

type DateType = 'normal' | 'expiry' | 'rollover' | 'expiry_rollover';
type SubMenu = 'year' | 'month' | 'week' | null;

interface DateTypeOption {
  id: DateType;
  label: string;
  hasExpiry: boolean;
  hasRollover: boolean;
}

const DATE_TYPE_OPTIONS: DateTypeOption[] = [
  { id: 'normal', label: 'Normal Date', hasExpiry: false, hasRollover: false },
  { id: 'expiry', label: 'Expiry Date', hasExpiry: true, hasRollover: false },
  { id: 'rollover', label: 'Rollover Date', hasExpiry: false, hasRollover: true },
  { id: 'expiry_rollover', label: 'Expiry Rollover Date', hasExpiry: true, hasRollover: true },
];

// Year code options
const YEAR_CODES = [
  { id: 'yyyy', label: 'Four Digit Year (YYYY)' },
  { id: 'yy', label: 'Two-Digit Year (YY)' },
  { id: 'y', label: 'One-Digit Year (Y)' },
  { id: 'doy', label: 'Day of Year' },
  { id: 'julian', label: 'Julian Date' },
  { id: 'program_year', label: 'Program Year' },
  { id: 'program_doy', label: 'Program Day of Year' },
];

// Month code options
const MONTH_CODES = [
  { id: 'mm', label: 'Numeric Month (MM)' },
  { id: 'alpha_month', label: 'Alpha Month (JAN, FEB...)' },
  { id: 'dom', label: 'Day of Month' },
  { id: 'program_month', label: 'Program Month' },
  { id: 'program_dom', label: 'Program Day of Month' },
];

// Week code options
const WEEK_CODES = [
  { id: 'ww', label: 'Numeric Week (WW)' },
  { id: 'dow_num', label: 'Numeric Week Day (1-7)' },
  { id: 'dow_alpha', label: 'Alpha Week Day (MON, TUE...)' },
  { id: 'program_week', label: 'Program Week' },
  { id: 'program_dow', label: 'Program Day of Week' },
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
  const [subMenu, setSubMenu] = useState<SubMenu>(null);
  const [formatIndex, setFormatIndex] = useState(0);
  const [expiryDays, setExpiryDays] = useState('0');
  const [rolloverHours, setRolloverHours] = useState('0');

  const currentFormat = DATE_FORMATS[formatIndex];
  const currentTypeOption = DATE_TYPE_OPTIONS.find(o => o.id === selectedType);

  const cycleFormat = () => {
    setFormatIndex((prev) => (prev + 1) % DATE_FORMATS.length);
  };

  const resetState = () => {
    setSelectedType(null);
    setSubMenu(null);
    setFormatIndex(0);
    setExpiryDays('0');
    setRolloverHours('0');
  };

  const handleBack = () => {
    if (subMenu) {
      // Go back from submenu to date type view
      setSubMenu(null);
    } else if (selectedType) {
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

  const handleAddDateField = (codeType?: string) => {
    // Build the field type string
    let fieldType = `date_${selectedType}`;
    if (codeType) {
      fieldType += `_${codeType}`;
    }
    
    // Include offset info for expiry/rollover types
    let formatStr = currentFormat;
    if (currentTypeOption?.hasExpiry) {
      formatStr += `|expiry:${expiryDays}`;
    }
    if (currentTypeOption?.hasRollover) {
      formatStr += `|rollover:${rolloverHours}`;
    }
    
    onAddField(fieldType, formatStr);
    onOpenChange(false);
    resetState();
  };

  const getTitle = () => {
    if (subMenu === 'year') return 'Year Codes';
    if (subMenu === 'month') return 'Month Codes';
    if (subMenu === 'week') return 'Week Codes';
    if (selectedType) {
      return currentTypeOption?.label || 'Date Codes';
    }
    return 'Date Codes';
  };

  const renderSubMenuItems = () => {
    let items: typeof YEAR_CODES = [];
    if (subMenu === 'year') items = YEAR_CODES;
    if (subMenu === 'month') items = MONTH_CODES;
    if (subMenu === 'week') items = WEEK_CODES;

    return (
      <div className="space-y-2">
        {items.map((item) => (
          <div 
            key={item.id}
            className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3"
          >
            <span className="text-foreground font-medium text-sm">
              {item.label}
            </span>
            <button
              onClick={() => handleAddDateField(item.id)}
              className="industrial-button p-2 rounded"
            >
              <Plus className="w-5 h-5 text-primary" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetState();
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
            // Type selection menu (first level)
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
          ) : subMenu ? (
            // Submenu for Year/Month/Week codes
            renderSubMenuItems()
          ) : (
            // Date type view (Format + Year/Month/Week buttons)
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

              {/* Expiry offset input - only for expiry types */}
              {currentTypeOption?.hasExpiry && (
                <div className="flex items-center gap-4 bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
                  <Label className="text-foreground font-medium text-sm whitespace-nowrap">
                    Expiry (days):
                  </Label>
                  <Input
                    type="number"
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    className="w-24 h-8"
                    min="0"
                  />
                </div>
              )}

              {/* Rollover time input - only for rollover types */}
              {currentTypeOption?.hasRollover && (
                <div className="flex items-center gap-4 bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
                  <Label className="text-foreground font-medium text-sm whitespace-nowrap">
                    Rollover (hours):
                  </Label>
                  <Input
                    type="number"
                    value={rolloverHours}
                    onChange={(e) => setRolloverHours(e.target.value)}
                    className="w-24 h-8"
                    min="0"
                    max="23"
                  />
                </div>
              )}

              {/* Year/Month/Week Codes buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSubMenu('year')}
                  className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3 hover:bg-muted/80 transition-colors"
                >
                  <span className="text-foreground font-medium text-sm">
                    Year Codes
                  </span>
                  <div className="industrial-button p-1.5 rounded">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </button>

                <button
                  onClick={() => setSubMenu('month')}
                  className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3 hover:bg-muted/80 transition-colors"
                >
                  <span className="text-foreground font-medium text-sm">
                    Month Codes
                  </span>
                  <div className="industrial-button p-1.5 rounded">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </button>

                <button
                  onClick={() => setSubMenu('week')}
                  className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3 hover:bg-muted/80 transition-colors"
                >
                  <span className="text-foreground font-medium text-sm">
                    Week Codes
                  </span>
                  <div className="industrial-button p-1.5 rounded">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
