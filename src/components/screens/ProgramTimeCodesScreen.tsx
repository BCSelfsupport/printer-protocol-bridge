import { useState, useCallback } from 'react';
import { ChevronRight, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';

type TimeCodeCategory = 'hour' | 'minute' | 'second';

interface TimeCodeMapping {
  value: number;
  code: string;
}

function getDefaultMappings(category: TimeCodeCategory): TimeCodeMapping[] {
  switch (category) {
    case 'hour':
      return Array.from({ length: 24 }, (_, i) => ({ value: i, code: String(i) }));
    case 'minute':
    case 'second':
      return Array.from({ length: 60 }, (_, i) => ({ value: i, code: String(i) }));
  }
}

const CATEGORY_LABELS: Record<TimeCodeCategory, string> = {
  hour: 'Program Hour',
  minute: 'Program Minute',
  second: 'Program Second',
};

const CATEGORY_DESCRIPTIONS: Record<TimeCodeCategory, string> = {
  hour: 'Custom coded Hour Codes (0-23)',
  minute: 'Custom coded Minute Codes (0-59)',
  second: 'Custom coded Second Codes (0-59)',
};

function MenuRow({ label, description, onClick }: { label: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-card rounded-lg p-4 flex items-center justify-between border border-border min-h-[64px] w-full text-left hover:bg-accent/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 ml-2" />
    </button>
  );
}

function TimeCodeEditor({ category, onBack }: { category: TimeCodeCategory; onBack: () => void }) {
  const [mappings, setMappings] = useState<TimeCodeMapping[]>(() => getDefaultMappings(category));
  const [scrollIndex, setScrollIndex] = useState(0);

  const visibleCount = 6;
  const visible = mappings.slice(scrollIndex, scrollIndex + visibleCount);

  const updateCode = (idx: number, newCode: string) => {
    setMappings((prev) => {
      const updated = [...prev];
      updated[scrollIndex + idx] = { ...updated[scrollIndex + idx], code: newCode };
      return updated;
    });
  };

  const scrollUp = () => setScrollIndex((i) => Math.max(0, i - visibleCount));
  const scrollDown = () => setScrollIndex((i) => Math.min(mappings.length - visibleCount, i + visibleCount));

  const handleReset = () => {
    setMappings(getDefaultMappings(category));
    setScrollIndex(0);
    toast.success('Reset to defaults');
  };

  const valueLabel = category === 'hour' ? 'Hour' : category === 'minute' ? 'Minute' : 'Second';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-industrial-dark">
      <div className="border-b bg-industrial-dark px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <SubPageHeader
            title={`Setup: ${CATEGORY_LABELS[category]}`}
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
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground">
              Showing {scrollIndex + 1}–{Math.min(scrollIndex + visibleCount, mappings.length)} of {mappings.length}
            </span>
            <div className="flex gap-1">
              <button onClick={scrollUp} disabled={scrollIndex === 0} className="industrial-button text-white p-2 rounded disabled:opacity-30">
                <ChevronUp className="w-4 h-4" />
              </button>
              <button onClick={scrollDown} disabled={scrollIndex + visibleCount >= mappings.length} className="industrial-button text-white p-2 rounded disabled:opacity-30">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {visible.map((m, idx) => (
              <div key={`${scrollIndex}-${idx}`} className="bg-card rounded-lg border border-border p-3 grid grid-cols-2 gap-4 items-center">
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{valueLabel}</div>
                  <div className="text-lg font-semibold text-foreground tabular-nums">{m.value}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Code</div>
                  <Input
                    value={m.code}
                    onChange={(e) => updateCode(idx, e.target.value)}
                    className="h-9 text-lg font-semibold tabular-nums bg-background"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ProgramTimeCodesScreenProps {
  onBack: () => void;
}

export function ProgramTimeCodesScreen({ onBack }: ProgramTimeCodesScreenProps) {
  const [activeCategory, setActiveCategory] = useState<TimeCodeCategory | null>(null);

  if (activeCategory) {
    return <TimeCodeEditor category={activeCategory} onBack={() => setActiveCategory(null)} />;
  }

  const categories: TimeCodeCategory[] = ['hour', 'minute', 'second'];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-industrial-dark">
      <div className="border-b bg-industrial-dark px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <SubPageHeader title="Setup: Program Time Codes" onHome={onBack} />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 gap-3">
          {categories.map((cat) => (
            <MenuRow key={cat} label={CATEGORY_LABELS[cat]} description={CATEGORY_DESCRIPTIONS[cat]} onClick={() => setActiveCategory(cat)} />
          ))}
        </div>
      </div>
    </div>
  );
}