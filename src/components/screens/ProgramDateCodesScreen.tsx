import { useState, useCallback } from 'react';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { toast } from 'sonner';
import { CodeMappingEditor, CodeMapping } from './CodeMappingEditor';

type DateCodeCategory =
  | 'year'
  | 'month'
  | 'week'
  | 'dayOfYear'
  | 'dayOfMonth'
  | 'dayOfWeek';

type DateCodeMapping = CodeMapping;

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

/** Sub-screen using the shared single-item editor */
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

  const valueLabel = {
    year: 'Year',
    month: 'Month',
    week: 'Week',
    dayOfYear: 'Day',
    dayOfMonth: 'Day',
    dayOfWeek: 'Day',
  }[category];

  return (
    <CodeMappingEditor
      title={`Setup: ${CATEGORY_LABELS[category]}`}
      valueLabel={valueLabel}
      mappings={mappings}
      onMappingsChange={setMappings}
      onBack={onBack}
      onReset={() => setMappings(getDefaultMappings(category))}
    />
  );
}

export function ProgramDateCodesScreen({ onBack }: { onBack: () => void }) {
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