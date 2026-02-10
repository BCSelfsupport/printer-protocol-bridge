import { useState, useCallback } from 'react';
import { ChevronRight, ChevronUp, ChevronDown, RotateCcw, ArrowLeft } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

type DateCodeCategory =
  | 'year'
  | 'month'
  | 'week'
  | 'dayOfYear'
  | 'dayOfMonth'
  | 'dayOfWeek';

interface DateCodeMapping {
  value: number | string;
  code: string;
}

/** Default mappings per category */
function getDefaultMappings(category: DateCodeCategory): DateCodeMapping[] {
  const now = new Date();
  const currentYear = now.getFullYear();

  switch (category) {
    case 'year':
      return Array.from({ length: 10 }, (_, i) => ({
        value: currentYear + i,
        code: String(currentYear + i),
      }));
    case 'month':
      return [
        { value: 1, code: 'Jan' }, { value: 2, code: 'Feb' }, { value: 3, code: 'Mar' },
        { value: 4, code: 'Apr' }, { value: 5, code: 'May' }, { value: 6, code: 'Jun' },
        { value: 7, code: 'Jul' }, { value: 8, code: 'Aug' }, { value: 9, code: 'Sep' },
        { value: 10, code: 'Oct' }, { value: 11, code: 'Nov' }, { value: 12, code: 'Dec' },
      ];
    case 'week':
      return Array.from({ length: 53 }, (_, i) => ({
        value: i + 1,
        code: String(i + 1),
      }));
    case 'dayOfYear':
      return Array.from({ length: 366 }, (_, i) => ({
        value: i + 1,
        code: String(i + 1),
      }));
    case 'dayOfMonth':
      return Array.from({ length: 31 }, (_, i) => ({
        value: i + 1,
        code: String(i + 1),
      }));
    case 'dayOfWeek':
      return [
        { value: 1, code: 'Sun' }, { value: 2, code: 'Mon' }, { value: 3, code: 'Tue' },
        { value: 4, code: 'Wed' }, { value: 5, code: 'Thu' }, { value: 6, code: 'Fri' },
        { value: 7, code: 'Sat' },
      ];
  }
}

const CATEGORY_LABELS: Record<DateCodeCategory, string> = {
  year: 'Program Year',
  month: 'Program Month',
  week: 'Program Week',
  dayOfYear: 'Program Day of Year',
  dayOfMonth: 'Program Day of Month',
  dayOfWeek: 'Program Day of Week',
};

const CATEGORY_DESCRIPTIONS: Record<DateCodeCategory, string> = {
  year: 'Custom coded Year Codes',
  month: 'Custom coded Month Codes',
  week: 'Week of the Year codes (1-53)',
  dayOfYear: 'Day of the Year codes (1-366)',
  dayOfMonth: 'Day of the Month (1-31)',
  dayOfWeek: 'Day of the Week (Sun=1...Sat=7)',
};

/** Menu item row with chevron */
function MenuRow({
  label,
  description,
  onClick,
}: {
  label: string;
  description: string;
  onClick: () => void;
}) {
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

/** Sub-screen for editing code mappings (e.g., Program Year) */
function DateCodeEditor({
  category,
  onBack,
}: {
  category: DateCodeCategory;
  onBack: () => void;
}) {
  const [mappings, setMappings] = useState<DateCodeMapping[]>(() =>
    getDefaultMappings(category)
  );
  const [scrollIndex, setScrollIndex] = useState(0);

  // Show 6 rows at a time (matching printer's grid)
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
  const scrollDown = () =>
    setScrollIndex((i) => Math.min(mappings.length - visibleCount, i + visibleCount));

  const handleReset = () => {
    setMappings(getDefaultMappings(category));
    setScrollIndex(0);
    toast.success('Reset to defaults');
  };

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
          {/* Scroll controls */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground">
              Showing {scrollIndex + 1}–{Math.min(scrollIndex + visibleCount, mappings.length)} of {mappings.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={scrollUp}
                disabled={scrollIndex === 0}
                className="industrial-button text-white p-2 rounded disabled:opacity-30"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={scrollDown}
                disabled={scrollIndex + visibleCount >= mappings.length}
                className="industrial-button text-white p-2 rounded disabled:opacity-30"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mapping rows — 2-column grid: value | code */}
          <div className="space-y-2">
            {visible.map((m, idx) => (
              <div
                key={`${scrollIndex}-${idx}`}
                className="bg-card rounded-lg border border-border p-3 grid grid-cols-2 gap-4 items-center"
              >
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    {category === 'year' ? 'Year' : category === 'month' ? 'Month' : 'Value'}
                  </div>
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

/** Main Program Date Codes menu screen */
interface ProgramDateCodesScreenProps {
  onBack: () => void;
}

export function ProgramDateCodesScreen({ onBack }: ProgramDateCodesScreenProps) {
  const [activeCategory, setActiveCategory] = useState<DateCodeCategory | null>(null);

  const handleSelectCurrentDay = useCallback(() => {
    toast.success('All program pages returned to today\'s date');
  }, []);

  if (activeCategory) {
    return (
      <DateCodeEditor
        category={activeCategory}
        onBack={() => setActiveCategory(null)}
      />
    );
  }

  const categories: DateCodeCategory[] = [
    'year', 'dayOfYear',
    'month', 'dayOfMonth',
    'week', 'dayOfWeek',
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-industrial-dark">
      <div className="border-b bg-industrial-dark px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <SubPageHeader title="Setup: Program Date Codes" onHome={onBack} />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3">
          {categories.map((cat) => (
            <MenuRow
              key={cat}
              label={CATEGORY_LABELS[cat]}
              description={CATEGORY_DESCRIPTIONS[cat]}
              onClick={() => setActiveCategory(cat)}
            />
          ))}

          {/* Select Current Day — full width */}
          <button
            onClick={handleSelectCurrentDay}
            className="md:col-span-2 bg-card rounded-lg p-4 flex items-center justify-between border border-border min-h-[64px] w-full text-left hover:bg-accent/50 transition-colors"
          >
            <div>
              <div className="text-sm font-semibold text-foreground">Select Current Day</div>
              <div className="text-xs text-muted-foreground">
                Returns all program pages to today's date (does not reset codes)
              </div>
            </div>
            <ArrowLeft className="w-5 h-5 text-muted-foreground shrink-0 ml-2 rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
}