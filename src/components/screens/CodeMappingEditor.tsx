import { useState } from 'react';
import { ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';

export interface CodeMapping {
  value: number | string;
  code: string;
}

interface CodeMappingEditorProps {
  title: string;
  valueLabel: string;
  mappings: CodeMapping[];
  onMappingsChange: (mappings: CodeMapping[]) => void;
  onBack: () => void;
  onReset: () => void;
}

/**
 * Single-item-at-a-time code editor matching the printer's UI:
 * Left side shows the value with up/down arrows, right side shows editable code.
 */
export function CodeMappingEditor({
  title,
  valueLabel,
  mappings,
  onMappingsChange,
  onBack,
  onReset,
}: CodeMappingEditorProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const current = mappings[currentIndex];

  const goUp = () => setCurrentIndex((i) => Math.max(0, i - 1));
  const goDown = () => setCurrentIndex((i) => Math.min(mappings.length - 1, i + 1));

  const updateCode = (newCode: string) => {
    const updated = [...mappings];
    updated[currentIndex] = { ...updated[currentIndex], code: newCode };
    onMappingsChange(updated);
  };

  const handleReset = () => {
    onReset();
    setCurrentIndex(0);
    toast.success('Reset to defaults');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-industrial-dark">
      <div className="border-b bg-industrial-dark px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <SubPageHeader
            title={title}
            onHome={onBack}
            rightContent={
              <button
                onClick={handleReset}
                className="industrial-button text-white px-3 py-2 rounded-lg flex items-center gap-2"
                title="Reset to defaults"
              >
                <RotateCcw className="w-5 h-5" />
                <span className="hidden md:inline text-sm font-medium">Reset</span>
              </button>
            }
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Active mapping row — matches printer layout */}
          <div className="bg-card rounded-lg border border-border p-4 grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            {/* Left: Value display */}
            <div className="bg-background rounded-lg p-4 border border-border">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{valueLabel}</div>
              <div className="text-2xl font-bold text-foreground tabular-nums">{current?.value}</div>
            </div>

            {/* Center: Up/Down arrows */}
            <div className="flex flex-col gap-2">
              <button
                onClick={goDown}
                disabled={currentIndex >= mappings.length - 1}
                className="industrial-button text-white p-3 rounded-lg disabled:opacity-30"
                title="Next value"
              >
                <ChevronDown className="w-6 h-6" />
              </button>
              <button
                onClick={goUp}
                disabled={currentIndex === 0}
                className="industrial-button text-white p-3 rounded-lg disabled:opacity-30"
                title="Previous value"
              >
                <ChevronUp className="w-6 h-6" />
              </button>
            </div>

            {/* Right: Code input */}
            <div className="bg-background rounded-lg p-4 border border-border">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Code</div>
              <Input
                value={current?.code ?? ''}
                onChange={(e) => updateCode(e.target.value)}
                className="h-10 text-2xl font-bold tabular-nums bg-transparent border-none p-0 focus-visible:ring-0"
              />
            </div>
          </div>

          {/* Additional empty rows to match printer grid aesthetic */}
          {[...Array(4)].map((_, i) => {
            const idx = currentIndex + 1 + i;
            const item = mappings[idx];
            return (
              <div
                key={i}
                className="bg-card rounded-lg border border-border p-4 grid grid-cols-[1fr_auto_1fr] gap-4 items-center min-h-[72px]"
              >
                {item ? (
                  <>
                    <div className="bg-background rounded-lg p-3 border border-border">
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{valueLabel}</div>
                      <div className="text-lg font-semibold text-foreground tabular-nums">{item.value}</div>
                    </div>
                    <div className="w-[76px]" /> {/* spacer matching arrow column */}
                    <div className="bg-background rounded-lg p-3 border border-border">
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Code</div>
                      <div className="text-lg font-semibold text-foreground tabular-nums">{item.code}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-background rounded-lg p-3 border border-border min-h-[52px]" />
                    <div className="w-[76px]" />
                    <div className="bg-background rounded-lg p-3 border border-border min-h-[52px]" />
                  </>
                )}
              </div>
            );
          })}

          {/* Position indicator */}
          <div className="text-center text-xs text-muted-foreground">
            {currentIndex + 1} of {mappings.length}
          </div>
        </div>
      </div>
    </div>
  );
}