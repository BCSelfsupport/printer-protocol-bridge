import { ArrowLeft, ChevronUp, ChevronDown, RotateCcw, Pencil } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

// Advanced settings following BestCode manual pages 52-55
export interface AdvancedSettings {
  // General Tab
  defaultSettings: boolean;
  autoNumerals: number; // 0-4 (message level)
  inversePrint: boolean;
  autoAlignFields: boolean;
  
  // Date/Time Tab
  timeDelimiter: string;
  dateDelimiter: string;
  day60366Switch: boolean; // Off = Feb 29 = day 60, On = Feb 29 = day 366
  
  // (Shift codes are device-local only — no remote protocol command exists)
  
  // Counters Tab (per counter 1-4)
  counters: {
    id: number;         // 1-4
    incrementation: number; // -20 to 20
    startCount: number; // 0-999999999
    endCount: number;   // 0-999999999
    leadingZeroes: boolean;
    repeat: number;     // 0-10000
    countTrigger: 'Print' | 'Photocell';
    counterResets: 'Off' | 'Select' | 'Print Off';
  }[];
  
  // Print Mode Tab (protocol modes: 0=Normal, 1=Auto, 2=Repeat, 4=Select ID, 5=Auto Encoder, 6=Auto Encoder Reverse)
  printMode: 0 | 1 | 2 | 4 | 5 | 6;
  delay: number;        // 0-4,000,000,000
  pitch: number;        // 0-4,000,000,000
  selectCode: { enabled: boolean; value: number }; // Disabled or 1-255, used when printMode=4
  repeatPrint: { enabled: boolean; value: number }; // Disabled or 1-32000, used when printMode=2
}

export const defaultAdvancedSettings: AdvancedSettings = {
  defaultSettings: false,
  autoNumerals: 0,
  inversePrint: false,
  autoAlignFields: false,
  
  timeDelimiter: ':',
  dateDelimiter: '/',
  day60366Switch: false,
  
  
  
  counters: [1, 2, 3, 4].map(id => ({
    id,
    incrementation: 1,
    startCount: 0,
    endCount: 999999999,
    leadingZeroes: false,
    repeat: 0,
    countTrigger: 'Print' as const,
    counterResets: 'Off' as const,
  })),
  
  printMode: 0,
  delay: 0,
  pitch: 0,
  selectCode: { enabled: false, value: 1 },
  repeatPrint: { enabled: false, value: 1 },
};

interface SettingRowProps {
  label: string;
  value: string | number;
  onIncrease: () => void;
  onDecrease: () => void;
  onEdit?: (value: number) => void;
  showEditButton?: boolean;
  min?: number;
  max?: number;
}

function SettingRow({ 
  label, 
  value, 
  onIncrease, 
  onDecrease,
  onEdit,
  showEditButton = false,
  min = 0,
  max = 999999999,
}: SettingRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());

  useEffect(() => {
    if (!isEditing) setEditValue((value ?? '').toString());
  }, [value, isEditing]);

  const handleSubmit = () => {
    if (onEdit) {
      const num = parseInt(editValue, 10);
      if (!isNaN(num)) {
        onEdit(Math.max(min, Math.min(max, num)));
      }
    }
    setIsEditing(false);
  };

  return (
    <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 rounded-lg p-2 border border-border">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {isEditing && showEditButton ? (
          <Input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            className="h-7 w-28 text-sm"
            autoFocus
            min={min}
            max={max}
          />
        ) : (
          <span className="text-sm font-bold min-w-[80px] text-right tabular-nums">
            {typeof value === 'number' ? value.toLocaleString() : (value ?? '')}
          </span>
        )}
        {showEditButton && (
          <button
            onClick={() => setIsEditing(true)}
            className="industrial-button text-white p-1.5 rounded"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        <button onClick={onDecrease} className="industrial-button text-white p-1.5 rounded">
          <ChevronDown className="w-3 h-3" />
        </button>
        <button onClick={onIncrease} className="industrial-button text-white p-1.5 rounded">
          <ChevronUp className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 rounded-lg p-2 border border-border">
      <Label className="text-sm font-medium">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

interface AdvancedSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AdvancedSettings;
  onUpdate: (settings: Partial<AdvancedSettings>) => void;
}

export function AdvancedSettingsDialog({
  open,
  onOpenChange,
  settings,
  onUpdate,
}: AdvancedSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [selectedCounter, setSelectedCounter] = useState(1);

  const currentCounter = settings.counters.find(c => c.id === selectedCounter) || settings.counters[0];

  const updateCounter = (updates: Partial<typeof currentCounter>) => {
    const newCounters = settings.counters.map(c =>
      c.id === selectedCounter ? { ...c, ...updates } : c
    );
    onUpdate({ counters: newCounters });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b">
          <button
            onClick={() => onOpenChange(false)}
            className="industrial-button p-2 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <DialogTitle className="flex-1 text-center text-lg font-semibold pr-10">
            Advanced Settings
          </DialogTitle>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="w-full justify-start px-4 pt-2 bg-transparent">
            <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
            <TabsTrigger value="datetime" className="text-xs">Date / Time</TabsTrigger>
            <TabsTrigger value="counters" className="text-xs">Counters</TabsTrigger>
            <TabsTrigger value="printmode" className="text-xs">Print Mode</TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="p-4 space-y-2 overflow-y-auto max-h-[50vh]">
            <ToggleRow
              label="Default Settings"
              checked={settings.defaultSettings}
              onChange={(v) => onUpdate({ defaultSettings: v })}
            />
            <SettingRow
              label="Auto-Numerals"
              value={`0, 1, 2, 3, 4`.split(', ').slice(0, settings.autoNumerals + 1).join(', ')}
              onIncrease={() => onUpdate({ autoNumerals: Math.min(4, settings.autoNumerals + 1) })}
              onDecrease={() => onUpdate({ autoNumerals: Math.max(0, settings.autoNumerals - 1) })}
            />
            <ToggleRow
              label="Inverse Print Message"
              checked={settings.inversePrint}
              onChange={(v) => onUpdate({ inversePrint: v })}
            />
            <ToggleRow
              label="Auto Align Fields"
              checked={settings.autoAlignFields}
              onChange={(v) => onUpdate({ autoAlignFields: v })}
            />
          </TabsContent>

          {/* Date/Time Tab */}
          <TabsContent value="datetime" className="p-4 space-y-3 overflow-y-auto max-h-[50vh]">
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 rounded-lg p-2 border border-border">
                <Label className="text-sm font-medium">Time Delimiter</Label>
                <Input
                  value={settings.timeDelimiter}
                  onChange={(e) => onUpdate({ timeDelimiter: e.target.value.slice(0, 1) })}
                  className="w-16 h-8 text-center"
                  maxLength={1}
                />
              </div>
              <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 rounded-lg p-2 border border-border">
                <Label className="text-sm font-medium">Date Delimiter</Label>
                <Input
                  value={settings.dateDelimiter}
                  onChange={(e) => onUpdate({ dateDelimiter: e.target.value.slice(0, 1) })}
                  className="w-16 h-8 text-center"
                  maxLength={1}
                />
              </div>
              <ToggleRow
                label="Day 60/366 Switch"
                checked={settings.day60366Switch}
                onChange={(v) => onUpdate({ day60366Switch: v })}
              />
            </div>

          </TabsContent>

          {/* Counters Tab */}
          <TabsContent value="counters" className="p-4 space-y-2 overflow-y-auto max-h-[50vh]">
            <SettingRow
              label="Counter"
              value={`Counter ${selectedCounter}`}
              onIncrease={() => setSelectedCounter(Math.min(4, selectedCounter + 1))}
              onDecrease={() => setSelectedCounter(Math.max(1, selectedCounter - 1))}
            />
            <SettingRow
              label="Incrementation"
              value={currentCounter.incrementation}
              onIncrease={() => updateCounter({ incrementation: Math.min(20, currentCounter.incrementation + 1) })}
              onDecrease={() => updateCounter({ incrementation: Math.max(-20, currentCounter.incrementation - 1) })}
            />
            <SettingRow
              label="Start Count"
              value={currentCounter.startCount}
              onIncrease={() => updateCounter({ startCount: currentCounter.startCount + 1 })}
              onDecrease={() => updateCounter({ startCount: Math.max(0, currentCounter.startCount - 1) })}
              onEdit={(v) => updateCounter({ startCount: v })}
              showEditButton
              min={0}
              max={999999999}
            />
            <SettingRow
              label="End Count"
              value={currentCounter.endCount}
              onIncrease={() => updateCounter({ endCount: currentCounter.endCount + 1 })}
              onDecrease={() => updateCounter({ endCount: Math.max(0, currentCounter.endCount - 1) })}
              onEdit={(v) => updateCounter({ endCount: v })}
              showEditButton
              min={0}
              max={999999999}
            />
            <ToggleRow
              label="Leading Zeroes"
              checked={currentCounter.leadingZeroes}
              onChange={(v) => updateCounter({ leadingZeroes: v })}
            />
            <SettingRow
              label="Repeat"
              value={currentCounter.repeat}
              onIncrease={() => updateCounter({ repeat: Math.min(10000, currentCounter.repeat + 1) })}
              onDecrease={() => updateCounter({ repeat: Math.max(0, currentCounter.repeat - 1) })}
              onEdit={(v) => updateCounter({ repeat: v })}
              showEditButton
              min={0}
              max={10000}
            />
            <SettingRow
              label="Count Trigger"
              value={currentCounter.countTrigger}
              onIncrease={() => updateCounter({ countTrigger: currentCounter.countTrigger === 'Print' ? 'Photocell' : 'Print' })}
              onDecrease={() => updateCounter({ countTrigger: currentCounter.countTrigger === 'Print' ? 'Photocell' : 'Print' })}
            />
            <SettingRow
              label="Counter Resets"
              value={currentCounter.counterResets}
              onIncrease={() => {
                const vals: typeof currentCounter.counterResets[] = ['Off', 'Select', 'Print Off'];
                const idx = vals.indexOf(currentCounter.counterResets);
                updateCounter({ counterResets: vals[(idx + 1) % 3] });
              }}
              onDecrease={() => {
                const vals: typeof currentCounter.counterResets[] = ['Off', 'Select', 'Print Off'];
                const idx = vals.indexOf(currentCounter.counterResets);
                updateCounter({ counterResets: vals[(idx + 2) % 3] });
              }}
            />
          </TabsContent>

          {/* Print Mode Tab */}
          <TabsContent value="printmode" className="p-4 space-y-2 overflow-y-auto max-h-[50vh]">
            <SettingRow
              label="Print Mode"
              value={(() => {
                const modeLabels: Record<number, string> = { 0: 'Normal', 1: 'Auto', 2: 'Repeat', 4: 'Select ID', 5: 'Auto Encoder', 6: 'Auto Encoder Rev' };
                return modeLabels[settings.printMode] ?? 'Normal';
              })()}
              onIncrease={() => {
                const modes: (0 | 1 | 2 | 4 | 5 | 6)[] = [0, 1, 2, 4, 5, 6];
                const idx = modes.indexOf(settings.printMode);
                onUpdate({ printMode: modes[(idx + 1) % modes.length] });
              }}
              onDecrease={() => {
                const modes: (0 | 1 | 2 | 4 | 5 | 6)[] = [0, 1, 2, 4, 5, 6];
                const idx = modes.indexOf(settings.printMode);
                onUpdate({ printMode: modes[(idx + modes.length - 1) % modes.length] });
              }}
            />
            <SettingRow
              label="Delay"
              value={settings.delay}
              onIncrease={() => onUpdate({ delay: settings.delay + 1 })}
              onDecrease={() => onUpdate({ delay: Math.max(0, settings.delay - 1) })}
              onEdit={(v) => onUpdate({ delay: v })}
              showEditButton
              min={0}
              max={4000000000}
            />
            <SettingRow
              label="Pitch"
              value={settings.pitch}
              onIncrease={() => onUpdate({ pitch: settings.pitch + 1 })}
              onDecrease={() => onUpdate({ pitch: Math.max(0, settings.pitch - 1) })}
              onEdit={(v) => onUpdate({ pitch: v })}
              showEditButton
              min={0}
              max={4000000000}
            />
            <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 rounded-lg p-2 border border-border">
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.selectCode.enabled}
                  onCheckedChange={(v) => onUpdate({ selectCode: { ...settings.selectCode, enabled: v } })}
                />
                <Label className="text-sm font-medium">Select Code</Label>
              </div>
              {settings.selectCode.enabled && (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={settings.selectCode.value}
                    onChange={(e) => onUpdate({ selectCode: { enabled: true, value: Math.max(1, Math.min(255, parseInt(e.target.value) || 1)) } })}
                    className="w-16 h-7 text-sm"
                    min={1}
                    max={255}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 rounded-lg p-2 border border-border">
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.repeatPrint.enabled}
                  onCheckedChange={(v) => onUpdate({ repeatPrint: { ...settings.repeatPrint, enabled: v } })}
                />
                <Label className="text-sm font-medium">Repeat</Label>
              </div>
              {settings.repeatPrint.enabled && (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={settings.repeatPrint.value}
                    onChange={(e) => onUpdate({ repeatPrint: { enabled: true, value: Math.max(1, Math.min(32000, parseInt(e.target.value) || 1)) } })}
                    className="w-20 h-7 text-sm"
                    min={1}
                    max={32000}
                  />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="border-t p-4 flex justify-end">
          <Button onClick={() => onOpenChange(false)} className="industrial-button-success text-white">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
