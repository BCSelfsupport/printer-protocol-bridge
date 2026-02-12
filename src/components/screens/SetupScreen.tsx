import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Send, ChevronUp, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ProgramDateCodesScreen } from './ProgramDateCodesScreen';
import { ProgramTimeCodesScreen } from './ProgramTimeCodesScreen';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';

interface SetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendCommand?: (command: string) => Promise<any>;
}

const DATE_FORMATS = ['MMDDYYYY', 'DDMMYYYY', 'YYYYMMDD'] as const;
const WEEK_STARTS = ['ISO Week Date', 'Sunday = 1', 'Monday = 1', 'Monday = 2', 'Tuesday = 2'] as const;

type DateFormat = typeof DATE_FORMATS[number];
type WeekStart = typeof WEEK_STARTS[number];

/** Cycle selector row with up/down arrows */
function CycleRow({
  label,
  value,
  onUp,
  onDown,
}: {
  label: string;
  value: string;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="bg-card rounded-lg p-4 flex items-center justify-between border border-border min-h-[72px]">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
        <div className="text-lg font-semibold text-foreground truncate">{value}</div>
      </div>
      <div className="flex flex-col gap-1 ml-3">
        <button onClick={onUp} className="industrial-button text-white p-1.5 rounded" title="Next">
          <ChevronUp className="w-4 h-4" />
        </button>
        <button onClick={onDown} className="industrial-button text-white p-1.5 rounded" title="Previous">
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function SetupScreen({ open, onOpenChange, onSendCommand }: SetupDialogProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>(format(new Date(), 'HH:mm:ss'));
  const [dateFormat, setDateFormat] = useState<DateFormat>('MMDDYYYY');
  const [weekStart, setWeekStart] = useState<WeekStart>('ISO Week Date');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [subScreen, setSubScreen] = useState<'dateCodes' | 'timeCodes' | null>(null);

  // Live clock
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  const handleSetDate = useCallback(async () => {
    if (!onSendCommand) return;
    const dateStr = format(selectedDate, 'MM/dd/yyyy');
    try {
      await onSendCommand(`^DS ${dateStr}`);
      toast.success(`Date set to ${dateStr}`);
    } catch {
      toast.error('Failed to set date');
    }
  }, [onSendCommand, selectedDate]);

  const handleSetTime = useCallback(async () => {
    if (!onSendCommand) return;
    try {
      await onSendCommand(`^TS ${selectedTime}`);
      toast.success(`Time set to ${selectedTime}`);
    } catch {
      toast.error('Failed to set time');
    }
  }, [onSendCommand, selectedTime]);

  const handleSyncToPc = useCallback(async () => {
    if (!onSendCommand) return;
    const now = new Date();
    const dateStr = format(now, 'MM/dd/yyyy');
    const timeStr = format(now, 'HH:mm:ss');
    try {
      await onSendCommand(`^DS ${dateStr}`);
      await onSendCommand(`^TS ${timeStr}`);
      setSelectedDate(now);
      setSelectedTime(timeStr);
      toast.success('Printer clock synced to PC');
    } catch {
      toast.error('Failed to sync clock');
    }
  }, [onSendCommand]);

  const cycleDateFormat = (dir: 1 | -1) => {
    const idx = DATE_FORMATS.indexOf(dateFormat);
    const next = (idx + dir + DATE_FORMATS.length) % DATE_FORMATS.length;
    setDateFormat(DATE_FORMATS[next]);
  };

  const cycleWeekStart = (dir: 1 | -1) => {
    const idx = WEEK_STARTS.indexOf(weekStart);
    const next = (idx + dir + WEEK_STARTS.length) % WEEK_STARTS.length;
    setWeekStart(WEEK_STARTS[next]);
  };

  const formatDisplayDate = (d: Date) => {
    switch (dateFormat) {
      case 'DDMMYYYY': return format(d, 'dd/MM/yyyy');
      case 'YYYYMMDD': return format(d, 'yyyy/MM/dd');
      default: return format(d, 'MM/dd/yyyy');
    }
  };

  // Sub-screen routing inside dialog
  if (open && subScreen === 'dateCodes') {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setSubScreen(null); onOpenChange(false); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <ProgramDateCodesScreen onBack={() => setSubScreen(null)} />
        </DialogContent>
      </Dialog>
    );
  }
  if (open && subScreen === 'timeCodes') {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setSubScreen(null); onOpenChange(false); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <ProgramTimeCodesScreen onBack={() => setSubScreen(null)} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Setup: Date / Time</DialogTitle>
            <button
              onClick={handleSyncToPc}
              disabled={!onSendCommand}
              className="industrial-button text-white px-3 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
              title="Sync printer clock to PC time"
            >
              <RefreshCw className="w-5 h-5" />
              <span className="text-sm font-medium">Sync to PC</span>
            </button>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Date + Format */}
          <div className="bg-card rounded-lg p-4 flex items-center justify-between border border-border min-h-[72px]">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button className="min-w-0 flex-1 text-left">
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Date</div>
                  <div className="text-lg font-semibold text-foreground tabular-nums">
                    {formatDisplayDate(selectedDate)}
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    if (d) {
                      setSelectedDate(d);
                      setCalendarOpen(false);
                    }
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <button
              onClick={handleSetDate}
              disabled={!onSendCommand}
              className="industrial-button text-white p-3 rounded-lg ml-3 shrink-0 disabled:opacity-50"
              title="Set Date (^DS)"
            >
              <Calendar className="w-5 h-5" />
            </button>
          </div>

          <CycleRow
            label="Format"
            value={dateFormat}
            onUp={() => cycleDateFormat(1)}
            onDown={() => cycleDateFormat(-1)}
          />

          {/* Time + Week Start */}
          <div className="bg-card rounded-lg p-4 flex items-center justify-between border border-border min-h-[72px]">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Time</div>
              <input
                type="time"
                step="1"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="text-lg font-semibold text-foreground tabular-nums bg-transparent border-none outline-none p-0 w-full"
              />
            </div>
            <button
              onClick={handleSetTime}
              disabled={!onSendCommand}
              className="industrial-button text-white p-3 rounded-lg ml-3 shrink-0 disabled:opacity-50"
              title="Set Time (^TS)"
            >
              <Clock className="w-5 h-5" />
            </button>
          </div>

          <CycleRow
            label="Week Start"
            value={weekStart}
            onUp={() => cycleWeekStart(1)}
            onDown={() => cycleWeekStart(-1)}
          />

          {/* Program Date Codes / Program Time Codes */}
          <button
            onClick={() => setSubScreen('dateCodes')}
            className="bg-card rounded-lg p-4 flex items-center justify-between border border-border min-h-[72px] w-full text-left hover:bg-accent/50 transition-colors"
          >
            <div>
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Program Date Codes</div>
              <div className="text-lg font-semibold text-foreground">Configure</div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          <button
            onClick={() => setSubScreen('timeCodes')}
            className="bg-card rounded-lg p-4 flex items-center justify-between border border-border min-h-[72px] w-full text-left hover:bg-accent/50 transition-colors"
          >
            <div>
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Program Time Codes</div>
              <div className="text-lg font-semibold text-foreground">Configure</div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* Live clock display */}
          <div className="md:col-span-2 bg-card rounded-lg p-4 border border-border text-center">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Current PC Time</div>
            <div className="text-2xl font-bold text-foreground tabular-nums">
              {format(currentTime, 'HH:mm:ss')}
              <span className="text-muted-foreground ml-3 text-lg">{format(currentTime, 'MM/dd/yyyy')}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
