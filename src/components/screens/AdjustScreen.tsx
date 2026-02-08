import { ChevronUp, ChevronDown, RotateCcw, Save } from 'lucide-react';
import { PrintSettings } from '@/types/printer';
import { SubPageHeader } from '@/components/layout/SubPageHeader';

interface AdjustScreenProps {
  settings: PrintSettings;
  onUpdate: (settings: Partial<PrintSettings>) => void;
  onSave: () => void;
  onHome: () => void;
}

interface AdjustRowProps {
  label: string;
  value: string | number;
  onIncrease: () => void;
  onDecrease: () => void;
  showInput?: boolean;
  showRotate?: boolean;
}

function AdjustRow({ label, value, onIncrease, onDecrease, showInput = true, showRotate = false }: AdjustRowProps) {
  return (
    <div className="bg-card rounded-lg p-4 flex items-center justify-between">
      <span className="text-primary text-xl font-medium min-w-[180px]">{label}: {value}</span>
      <div className="flex items-center gap-2">
        {showInput && (
          <div className="w-20 h-10 bg-card border rounded" />
        )}
        {showRotate ? (
          <button className="industrial-button text-white p-3 rounded-lg">
            <RotateCcw className="w-8 h-8" />
          </button>
        ) : (
          <>
            <button 
              onClick={onDecrease}
              className="industrial-button text-white p-3 rounded-lg"
            >
              <ChevronDown className="w-8 h-8" />
            </button>
            <button 
              onClick={onIncrease}
              className="industrial-button text-white p-3 rounded-lg"
            >
              <ChevronUp className="w-8 h-8" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function AdjustScreen({ settings, onUpdate, onSave, onHome }: AdjustScreenProps) {
  return (
    <div className="flex-1 p-4 flex flex-col">
      <SubPageHeader 
        title="Adjust" 
        onHome={onHome}
        rightContent={
          <button
            onClick={onSave}
            className="industrial-button-success text-white px-6 py-3 rounded-lg flex items-center gap-2"
          >
            <Save className="w-5 h-5" />
            <span className="font-medium">Save</span>
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4">
        <AdjustRow
          label="Width"
          value={settings.width}
          onIncrease={() => onUpdate({ width: settings.width + 1 })}
          onDecrease={() => onUpdate({ width: Math.max(0, settings.width - 1) })}
        />
        <AdjustRow
          label="Height"
          value={settings.height}
          onIncrease={() => onUpdate({ height: settings.height + 1 })}
          onDecrease={() => onUpdate({ height: Math.max(0, settings.height - 1) })}
          showInput={false}
        />

        <AdjustRow
          label="Delay"
          value={settings.delay}
          onIncrease={() => onUpdate({ delay: settings.delay + 10 })}
          onDecrease={() => onUpdate({ delay: Math.max(0, settings.delay - 10) })}
        />
        <AdjustRow
          label="Rotation"
          value={settings.rotation}
          onIncrease={() => {}}
          onDecrease={() => {}}
          showInput={false}
          showRotate
        />

        <AdjustRow
          label="Bold"
          value={settings.bold}
          onIncrease={() => onUpdate({ bold: settings.bold + 1 })}
          onDecrease={() => onUpdate({ bold: Math.max(0, settings.bold - 1) })}
        />
        <AdjustRow
          label="Speed"
          value={settings.speed}
          onIncrease={() => {
            const speeds: PrintSettings['speed'][] = ['Fast', 'Faster', 'Fastest', 'Ultra Fast'];
            const idx = speeds.indexOf(settings.speed);
            onUpdate({ speed: speeds[Math.min(3, idx + 1)] });
          }}
          onDecrease={() => {
            const speeds: PrintSettings['speed'][] = ['Fast', 'Faster', 'Fastest', 'Ultra Fast'];
            const idx = speeds.indexOf(settings.speed);
            onUpdate({ speed: speeds[Math.max(0, idx - 1)] });
          }}
          showInput={false}
        />

        <AdjustRow
          label="Gap"
          value={settings.gap}
          onIncrease={() => onUpdate({ gap: settings.gap + 1 })}
          onDecrease={() => onUpdate({ gap: Math.max(0, settings.gap - 1) })}
        />
        <AdjustRow
          label="Pitch"
          value={settings.pitch}
          onIncrease={() => onUpdate({ pitch: settings.pitch + 1 })}
          onDecrease={() => onUpdate({ pitch: Math.max(0, settings.pitch - 1) })}
        />

        <AdjustRow
          label="Repeat amount"
          value={settings.repeatAmount}
          onIncrease={() => onUpdate({ repeatAmount: settings.repeatAmount + 1 })}
          onDecrease={() => onUpdate({ repeatAmount: Math.max(0, settings.repeatAmount - 1) })}
        />
      </div>
    </div>
  );
}
