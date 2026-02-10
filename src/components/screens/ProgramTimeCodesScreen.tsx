import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { CodeMappingEditor, CodeMapping } from './CodeMappingEditor';

type TimeCodeCategory = 'hour' | 'minute' | 'second';

function getDefaultMappings(category: TimeCodeCategory): CodeMapping[] {
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
  const [mappings, setMappings] = useState<CodeMapping[]>(() => getDefaultMappings(category));

  const valueLabel = category === 'hour' ? 'Hour' : category === 'minute' ? 'Minute' : 'Second';

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

export function ProgramTimeCodesScreen({ onBack }: { onBack: () => void }) {
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