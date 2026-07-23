import { ChevronUp, ChevronDown, Pencil, RefreshCw } from 'lucide-react';
import { PrintSettings } from '@/types/printer';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface AdjustOverrides {
  width?: boolean;
  height?: boolean;
  delay?: boolean;
  bold?: boolean;
  gap?: boolean;
  pitch?: boolean;
  speed?: boolean;
}

interface AdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PrintSettings;
  onUpdate: (settings: Partial<PrintSettings>) => void;
  onSendCommand: (command: string) => Promise<any>;
  isConnected: boolean;
  title?: string;
  /** Optional: query current settings from the printer. When provided,
   *  the dialog auto-refreshes on open and shows a manual refresh button. */
  onRefreshFromPrinter?: () => Promise<void> | void;
  /** Per-message override flags. When provided, each numeric field renders
   *  an "Override for this message" toggle. Only overridden keys will beat
   *  the printer Setup Card at ^SM time. Absent = live-adjust mode (no
   *  toggles rendered — current behaviour). */
  overrides?: AdjustOverrides;
  onOverridesChange?: (partial: Partial<AdjustOverrides>) => void;
}



// Validation constraints from BestCode v2.0 protocol documentation
const CONSTRAINTS = {
  width: { min: 0, max: 16000, cmd: 'PW' },   // ^PW command: 0-16000
  height: { min: 0, max: 10, cmd: 'PH' },      // ^PH command: 0-10
  delay: { min: 0, max: 4000000000, cmd: 'DA' }, // ^DA command: 0-4B
  bold: { min: 0, max: 9, cmd: 'SB' },         // ^SB command: 0-9
  gap: { min: 0, max: 9, cmd: 'GP' },          // ^GP command: 0-9
  pitch: { min: 0, max: 4000000000, cmd: 'PA' }, // ^PA command: 0-4B
} as const;

const ROTATION_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Flip', label: 'Flip' },
  { value: 'Mirror Flip', label: 'Mirror Flip' },
  { value: 'Mirror', label: 'Mirror' },
] as const;

const ORIENTATION_MAP: Record<string, number> = {
  'Normal': 0, 'Flip': 1, 'Mirror': 2, 'Mirror Flip': 3,
};

const SPEED_OPTIONS: { value: PrintSettings['speed']; label: string }[] = [
  { value: 'Fast', label: 'Fast' },
  { value: 'Faster', label: 'Faster' },
  { value: 'Fastest', label: 'Fastest' },
  { value: 'Ultra Fast', label: 'Ultra Fast' },
];

const SPEED_MAP: Record<PrintSettings['speed'], number> = {
  'Fast': 0, 'Faster': 1, 'Fastest': 2, 'Ultra Fast': 3,
};

type SettingKey = keyof typeof CONSTRAINTS;

interface AdjustCardProps {
  label: string;
  value: number | string;
  onIncrease: () => void;
  onDecrease: () => void;
  onEdit?: (newValue: number) => void;
  disabled?: boolean;
  showInput?: boolean;
  min?: number;
  max?: number;
  /** When defined, renders a small "Override for this message" toggle
   *  under the label. Reflects the per-message override state. */
  overridden?: boolean;
  onOverrideToggle?: (next: boolean) => void;
}

function AdjustCard({ 
  label, 
  value, 
  onIncrease, 
  onDecrease, 
  onEdit, 
  disabled,
  showInput = true,
  min = 0,
  max = 9999,
  overridden,
  onOverrideToggle,
}: AdjustCardProps) {

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());

  // Sync editValue when value changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value.toString());
    }
  }, [value, isEditing]);

  const handleEditSubmit = () => {
    if (onEdit && typeof value === 'number') {
      const numValue = parseInt(editValue, 10);
      if (!isNaN(numValue)) {
        // Clamp to valid range
        const clampedValue = Math.max(min, Math.min(max, numValue));
        onEdit(clampedValue);
      }
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`rounded-lg p-3 border shadow-sm ${
        onOverrideToggle
          ? overridden
            ? 'bg-primary/5 border-primary/40'
            : 'bg-card border-border opacity-90'
          : 'bg-card border-border'
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Setting info */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground font-medium truncate">{label}</div>
          {isEditing && showInput ? (
            <Input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleEditSubmit()}
              className="h-7 text-lg font-bold bg-background text-foreground"
              autoFocus
              min={min}
              max={max}
            />
          ) : (
            <div className={`text-lg font-bold tabular-nums ${onOverrideToggle && !overridden ? 'text-muted-foreground' : 'text-foreground'}`}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1">
          {showInput && onEdit && (
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
          )}
          <button
            onClick={onDecrease}
            disabled={disabled}
            className="industrial-button text-white p-2 rounded disabled:opacity-50"
            title="Decrease"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            onClick={onIncrease}
            disabled={disabled}
            className="industrial-button text-white p-2 rounded disabled:opacity-50"
            title="Increase"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </div>
      {onOverrideToggle && (
        <label className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!overridden}
            onChange={(e) => onOverrideToggle(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          <span>
            {overridden
              ? 'Custom value for this message (ignores printer Setup Card)'
              : 'Use a custom value for this message'}
          </span>

        </label>
      )}
    </div>
  );
}


export function AdjustDialog({ 
  open, 
  onOpenChange, 
  settings, 
  onUpdate, 
  onSendCommand,
  isConnected,
  title = 'Adjust Settings',
  onRefreshFromPrinter,
  overrides,
  onOverridesChange,
}: AdjustDialogProps) {
  // Message-editor mode: caller provided an override map. Live-adjust mode:
  // no overrides prop → toggles hidden, values push directly to the printer.
  const isMessageMode = !!onOverridesChange;
  const overrideFor = (key: keyof AdjustOverrides) => !!overrides?.[key];
  const toggleOverride = (key: keyof AdjustOverrides) => (next: boolean) =>
    onOverridesChange?.({ [key]: next } as Partial<AdjustOverrides>);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefreshFromPrinter || !isConnected) return;
    setIsRefreshing(true);
    try {
      await onRefreshFromPrinter();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-refresh from printer when the dialog opens so the user always sees
  // the live values (not stale cached state).
  useEffect(() => {
    if (open && isConnected && onRefreshFromPrinter) {
      void handleRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced ^SV — every Adjust change writes to the live setting (^PW etc.),
  // but committing to non-volatile storage on every nudge would burn flash.
  // Coalesce a single ^SV ~800ms after the last edit so settings actually
  // survive a printer reboot. (Was: edits were "live but not saved" — width
  // would revert to 15 after a power cycle.)
  const saveTimerRef = useState<{ t: ReturnType<typeof setTimeout> | null }>(() => ({ t: null }))[0];
  const scheduleSave = () => {
    if (saveTimerRef.t) clearTimeout(saveTimerRef.t);
    saveTimerRef.t = setTimeout(() => {
      saveTimerRef.t = null;
      onSendCommand('^SV').catch(() => {});
    }, 800);
  };
  useEffect(() => () => { if (saveTimerRef.t) clearTimeout(saveTimerRef.t); }, [saveTimerRef]);

  // Helper to update a numeric setting and send the command immediately
  const handleLiveUpdate = async (key: SettingKey, newValue: number) => {
    const constraint = CONSTRAINTS[key];
    const clampedValue = Math.max(constraint.min, Math.min(constraint.max, newValue));
    
    // Update local state
    onUpdate({ [key]: clampedValue });
    
    // Send command to printer immediately
    const command = `^${constraint.cmd} ${clampedValue}`;
    await onSendCommand(command);
    scheduleSave();
  };

  // Handle rotation change via ^CM command
  const handleRotationChange = async (value: string) => {
    onUpdate({ rotation: value as PrintSettings['rotation'] });
    const orientationValue = ORIENTATION_MAP[value] ?? 0;
    await onSendCommand(`^CM o${orientationValue}`);
    scheduleSave();
  };

  // Handle speed change via ^CM command
  const handleSpeedChange = async (value: PrintSettings['speed']) => {
    onUpdate({ speed: value });
    const speedValue = SPEED_MAP[value];
    await onSendCommand(`^CM s${speedValue}`);
    scheduleSave();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{title}</DialogTitle>
            {onRefreshFromPrinter && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={!isConnected || isRefreshing}
                className="industrial-button text-white px-3 py-1.5 rounded text-xs flex items-center gap-1.5 disabled:opacity-50"
                title="Read current settings from the printer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Reading…' : 'Refresh from printer'}
              </button>
            )}
          </div>
        </DialogHeader>


        <div className="space-y-4">
          {isMessageMode && (
            <div className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-md px-3 py-2">
              By default this message inherits Width / Delay / Bold / Gap / Pitch from each printer's Setup Card. Tick <span className="font-semibold text-foreground">Override</span> on any field below to force this message to use its own value on every printer.
            </div>
          )}
          {/* Settings grid - single column on mobile, 2 columns on tablet+ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Width: 0-16000 */}
            <AdjustCard
              label="Width"
              value={settings.width}
              onIncrease={() => handleLiveUpdate('width', settings.width + 1)}
              onDecrease={() => handleLiveUpdate('width', settings.width - 1)}
              onEdit={(val) => handleLiveUpdate('width', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.width.min}
              max={CONSTRAINTS.width.max}
              overridden={isMessageMode ? overrideFor('width') : undefined}
              onOverrideToggle={isMessageMode ? toggleOverride('width') : undefined}
            />

            {/* Height: 0-10 */}
            <AdjustCard
              label="Height"
              value={settings.height}
              onIncrease={() => handleLiveUpdate('height', settings.height + 1)}
              onDecrease={() => handleLiveUpdate('height', settings.height - 1)}
              onEdit={(val) => handleLiveUpdate('height', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.height.min}
              max={CONSTRAINTS.height.max}
              overridden={isMessageMode ? overrideFor('height') : undefined}
              onOverrideToggle={isMessageMode ? toggleOverride('height') : undefined}
            />

            {/* Delay: 0-4,000,000,000 */}
            <AdjustCard
              label="Delay"
              value={settings.delay}
              onIncrease={() => handleLiveUpdate('delay', settings.delay + 10)}
              onDecrease={() => handleLiveUpdate('delay', settings.delay - 10)}
              onEdit={(val) => handleLiveUpdate('delay', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.delay.min}
              max={CONSTRAINTS.delay.max}
              overridden={isMessageMode ? overrideFor('delay') : undefined}
              onOverrideToggle={isMessageMode ? toggleOverride('delay') : undefined}
            />

            {/* Bold: 0-9 */}
            <AdjustCard
              label="Bold"
              value={settings.bold}
              onIncrease={() => handleLiveUpdate('bold', settings.bold + 1)}
              onDecrease={() => handleLiveUpdate('bold', settings.bold - 1)}
              onEdit={(val) => handleLiveUpdate('bold', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.bold.min}
              max={CONSTRAINTS.bold.max}
              overridden={isMessageMode ? overrideFor('bold') : undefined}
              onOverrideToggle={isMessageMode ? toggleOverride('bold') : undefined}
            />

            {/* Gap: 0-9 */}
            <AdjustCard
              label="Gap"
              value={settings.gap}
              onIncrease={() => handleLiveUpdate('gap', settings.gap + 1)}
              onDecrease={() => handleLiveUpdate('gap', settings.gap - 1)}
              onEdit={(val) => handleLiveUpdate('gap', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.gap.min}
              max={CONSTRAINTS.gap.max}
              overridden={isMessageMode ? overrideFor('gap') : undefined}
              onOverrideToggle={isMessageMode ? toggleOverride('gap') : undefined}
            />

            {/* Pitch: 0-4,000,000,000 */}
            <AdjustCard
              label="Pitch"
              value={settings.pitch}
              onIncrease={() => handleLiveUpdate('pitch', settings.pitch + 1)}
              onDecrease={() => handleLiveUpdate('pitch', settings.pitch - 1)}
              onEdit={(val) => handleLiveUpdate('pitch', val)}
              disabled={!isConnected}
              min={CONSTRAINTS.pitch.min}
              max={CONSTRAINTS.pitch.max}
              overridden={isMessageMode ? overrideFor('pitch') : undefined}
              onOverrideToggle={isMessageMode ? toggleOverride('pitch') : undefined}
            />


            {/* Rotation & Speed are always sourced from the printer Setup Card
                (Rotation) and Setup Card / Fleet Defaults (Speed) at ^SM time,
                so we don't expose them as per-message adjust fields. They
                remain available in live-adjust mode (dashboard Adjust button). */}
            {!isMessageMode && (
              <>
                {/* Rotation: Select dropdown */}
                <div className="bg-card rounded-lg p-3 border border-border shadow-sm">
                  <div className="text-xs text-muted-foreground font-medium mb-1">Rotation</div>
                  <Select
                    value={settings.rotation}
                    onValueChange={handleRotationChange}
                    disabled={!isConnected}
                  >
                    <SelectTrigger className="h-9 text-sm font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROTATION_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Speed: Select dropdown */}
                <div className="bg-card rounded-lg p-3 border border-border shadow-sm">
                  <div className="text-xs text-muted-foreground font-medium mb-1">Speed</div>
                  <Select
                    value={settings.speed}
                    onValueChange={(v) => handleSpeedChange(v as PrintSettings['speed'])}
                    disabled={!isConnected}
                  >
                    <SelectTrigger className="h-9 text-sm font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SPEED_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
