import { useState, useMemo } from 'react';
import { ArrowLeft, Plus, X, Trash2, Calendar, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { computeAutoCodeValue } from '@/lib/autoCodeProtocol';

// ── Token definitions ──────────────────────────────────────────────────────

interface TokenDef {
  id: string;
  label: string;
  chip: string;
  category: 'date' | 'time' | 'program' | 'literal';
  literalValue?: string;
}

const DATE_TOKENS: TokenDef[] = [
  { id: 'yyyy', label: 'Year (YYYY)', chip: 'YYYY', category: 'date' },
  { id: 'yy', label: 'Year (YY)', chip: 'YY', category: 'date' },
  { id: 'y', label: 'Year (Y)', chip: 'Y', category: 'date' },
  { id: 'mm', label: 'Month (01-12)', chip: 'MM', category: 'date' },
  { id: 'alpha_month', label: 'Month (JAN)', chip: 'MON', category: 'date' },
  { id: 'dom', label: 'Day of Month', chip: 'DD', category: 'date' },
  { id: 'doy', label: 'Day of Year (DDD)', chip: 'DDD', category: 'date' },
  { id: 'ww', label: 'Week Number', chip: 'WK', category: 'date' },
  { id: 'dow_num', label: 'Day of Week (1-7)', chip: 'D#', category: 'date' },
  { id: 'dow_alpha', label: 'Day of Week (MON)', chip: 'DAY', category: 'date' },
];

const TIME_TOKENS: TokenDef[] = [
  { id: 'HH', label: 'Hours (HH)', chip: 'HH', category: 'time' },
  { id: 'MIN', label: 'Minutes (MM)', chip: 'MM', category: 'time' },
  { id: 'SEC', label: 'Seconds (SS)', chip: 'SS', category: 'time' },
];

const PROGRAM_TOKENS: TokenDef[] = [
  { id: 'program_year', label: 'Program Year', chip: 'PY', category: 'program' },
  { id: 'program_month', label: 'Program Month', chip: 'PM', category: 'program' },
  { id: 'program_dom', label: 'Program Day', chip: 'PD', category: 'program' },
  { id: 'program_doy', label: 'Program Day of Year', chip: 'PDOY', category: 'program' },
  { id: 'program_week', label: 'Program Week', chip: 'PW', category: 'program' },
  { id: 'program_dow', label: 'Program Day of Week', chip: 'PDW', category: 'program' },
  { id: 'program_hour', label: 'Program Hour', chip: 'PH', category: 'program' },
  { id: 'program_minute', label: 'Program Minute', chip: 'PMin', category: 'program' },
  { id: 'program_second', label: 'Program Second', chip: 'PSec', category: 'program' },
];

const SEPARATOR_TOKENS: TokenDef[] = [
  { id: 'sep_space', label: 'Space', chip: '⎵', category: 'literal', literalValue: ' ' },
  { id: 'sep_dot', label: 'Dot (.)', chip: '.', category: 'literal', literalValue: '.' },
  { id: 'sep_slash', label: 'Slash (/)', chip: '/', category: 'literal', literalValue: '/' },
  { id: 'sep_dash', label: 'Dash (-)', chip: '-', category: 'literal', literalValue: '-' },
  { id: 'sep_colon', label: 'Colon (:)', chip: ':', category: 'literal', literalValue: ':' },
  { id: 'sep_comma', label: 'Comma (,)', chip: ',', category: 'literal', literalValue: ',' },
];

// ── Composed token instance ────────────────────────────────────────────────

interface ComposedToken {
  key: number;
  def: TokenDef;
  customText?: string;
}

// ── Offset types ───────────────────────────────────────────────────────────

type OffsetUnit = 'days' | 'weeks' | 'months' | 'years';
type DateMode = 'manufacturing' | 'expiration';

interface DateOffset {
  value: number;
  unit: OffsetUnit;
}

// ── Font option type ───────────────────────────────────────────────────────

export interface FontOption {
  value: string;
  label: string;
  height: number;
}

function applyOffset(date: Date, offset: DateOffset): Date {
  const result = new Date(date);
  switch (offset.unit) {
    case 'days':
      result.setDate(result.getDate() + offset.value);
      break;
    case 'weeks':
      result.setDate(result.getDate() + offset.value * 7);
      break;
    case 'months':
      result.setMonth(result.getMonth() + offset.value);
      break;
    case 'years':
      result.setFullYear(result.getFullYear() + offset.value);
      break;
  }
  return result;
}

// ── Quick presets ──────────────────────────────────────────────────────────

interface Preset {
  label: string;
  example: string;
  tokens: { id: string; customText?: string }[];
}

const PRESETS: Preset[] = [
  {
    label: 'MAY 07.2026',
    example: 'Alpha Month + Day.Year',
    tokens: [
      { id: 'alpha_month' }, { id: 'sep_space' }, { id: 'dom' },
      { id: 'sep_dot' }, { id: 'yyyy' },
    ],
  },
  {
    label: 'MM/DD/YY',
    example: 'US Date with slashes',
    tokens: [
      { id: 'mm' }, { id: 'sep_slash' }, { id: 'dom' },
      { id: 'sep_slash' }, { id: 'yy' },
    ],
  },
  {
    label: 'DD-MM-YYYY',
    example: 'EU Date with dashes',
    tokens: [
      { id: 'dom' }, { id: 'sep_dash' }, { id: 'mm' },
      { id: 'sep_dash' }, { id: 'yyyy' },
    ],
  },
  {
    label: 'YYYY/MM/DD',
    example: 'ISO Date',
    tokens: [
      { id: 'yyyy' }, { id: 'sep_slash' }, { id: 'mm' },
      { id: 'sep_slash' }, { id: 'dom' },
    ],
  },
  {
    label: 'HH:MM:SS',
    example: 'Full time',
    tokens: [
      { id: 'HH' }, { id: 'sep_colon' }, { id: 'MIN' },
      { id: 'sep_colon' }, { id: 'SEC' },
    ],
  },
  {
    label: 'MAY 07.2026 11:42',
    example: 'Date + Time',
    tokens: [
      { id: 'alpha_month' }, { id: 'sep_space' }, { id: 'dom' },
      { id: 'sep_dot' }, { id: 'yyyy' }, { id: 'sep_space' },
      { id: 'HH' }, { id: 'sep_colon' }, { id: 'MIN' },
    ],
  },
];

// ── All token defs by id ───────────────────────────────────────────────────

const ALL_TOKENS: Record<string, TokenDef> = {};
for (const t of [...DATE_TOKENS, ...TIME_TOKENS, ...PROGRAM_TOKENS, ...SEPARATOR_TOKENS]) {
  ALL_TOKENS[t.id] = t;
}

// ── Component ──────────────────────────────────────────────────────────────

export interface DateCodeBuilderResult {
  tokens: ComposedToken[];
  dateMode: DateMode;
  offset?: DateOffset;
  selectedFont: string;
}

interface DateCodeBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onAddFields: (result: DateCodeBuilderResult) => void;
  /** Available fonts filtered for current template */
  allowedFonts: FontOption[];
  /** Default font to pre-select */
  defaultFont?: string;
}

export function DateCodeBuilder({
  open,
  onOpenChange,
  onBack,
  onAddFields,
  allowedFonts,
  defaultFont,
}: DateCodeBuilderProps) {
  const [tokens, setTokens] = useState<ComposedToken[]>([]);
  const [keyCounter, setKeyCounter] = useState(0);
  const [customText, setCustomText] = useState('');
  const [activeTab, setActiveTab] = useState('presets');
  const [dateMode, setDateMode] = useState<DateMode>('manufacturing');
  const [offsetValue, setOffsetValue] = useState(0);
  const [offsetUnit, setOffsetUnit] = useState<OffsetUnit>('days');
  const [selectedFont, setSelectedFont] = useState(defaultFont || allowedFonts[allowedFonts.length - 1]?.value || '');

  // Reset selected font when dialog opens with new defaults
  const handleOpen = (isOpen: boolean) => {
    if (isOpen && defaultFont) {
      setSelectedFont(defaultFont);
    }
    if (!isOpen) {
      setTokens([]);
      setActiveTab('presets');
      setDateMode('manufacturing');
      setOffsetValue(0);
      setOffsetUnit('days');
    }
    onOpenChange(isOpen);
  };

  const selectedFontInfo = allowedFonts.find(f => f.value === selectedFont);

  const addToken = (def: TokenDef, custom?: string) => {
    const k = keyCounter;
    setKeyCounter((c) => c + 1);
    setTokens((prev) => [...prev, { key: k, def, customText: custom }]);
  };

  const removeToken = (key: number) => {
    setTokens((prev) => prev.filter((t) => t.key !== key));
  };

  const clearTokens = () => setTokens([]);

  const applyPreset = (preset: Preset) => {
    let k = keyCounter;
    const newTokens = preset.tokens.map((pt) => {
      const def = ALL_TOKENS[pt.id];
      if (!def) return null;
      return { key: k++, def, customText: pt.customText };
    }).filter(Boolean) as ComposedToken[];
    setKeyCounter(k);
    setTokens(newTokens);
    setActiveTab('build');
  };

  const addCustomLiteral = () => {
    if (!customText.trim()) return;
    const k = keyCounter;
    setKeyCounter((c) => c + 1);
    setTokens((prev) => [
      ...prev,
      {
        key: k,
        def: {
          id: `custom_${k}`,
          label: customText,
          chip: customText,
          category: 'literal' as const,
          literalValue: customText,
        },
        customText,
      },
    ]);
    setCustomText('');
  };

  const effectiveDate = useMemo(() => {
    const now = new Date();
    if (dateMode === 'expiration' && offsetValue > 0) {
      return applyOffset(now, { value: offsetValue, unit: offsetUnit });
    }
    return now;
  }, [dateMode, offsetValue, offsetUnit]);

  const preview = useMemo(() => {
    return tokens.map((t) => {
      if (t.def.category === 'literal') {
        return t.def.literalValue ?? t.customText ?? '';
      }
      if (t.def.category === 'time') {
        const h = effectiveDate.getHours().toString().padStart(2, '0');
        const m = effectiveDate.getMinutes().toString().padStart(2, '0');
        const s = effectiveDate.getSeconds().toString().padStart(2, '0');
        if (t.def.id === 'HH') return h;
        if (t.def.id === 'MIN') return m;
        if (t.def.id === 'SEC') return s;
        return '';
      }
      const fieldType = `date_normal_${t.def.id}`;
      return computeAutoCodeValue(fieldType, undefined, effectiveDate) ?? t.def.chip;
    }).join('');
  }, [tokens, effectiveDate]);

  const handleDone = () => {
    if (tokens.length === 0) return;
    const result: DateCodeBuilderResult = {
      tokens,
      dateMode,
      offset: dateMode === 'expiration' && offsetValue > 0
        ? { value: offsetValue, unit: offsetUnit }
        : undefined,
      selectedFont,
    };
    onAddFields(result);
    handleOpen(false);
  };

  const handleBack = () => {
    onOpenChange(false);
    onBack();
  };

  const offsetLabel = useMemo(() => {
    if (dateMode !== 'expiration' || offsetValue <= 0) return null;
    return `+${offsetValue} ${offsetUnit}`;
  }, [dateMode, offsetValue, offsetUnit]);

  const renderTokenButton = (def: TokenDef) => (
    <button
      key={def.id}
      onClick={() => addToken(def)}
      className="flex items-center gap-2 bg-gradient-to-b from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border border-border rounded-lg px-3 py-2 transition-colors text-sm"
    >
      <span className="text-foreground font-medium">{def.label}</span>
      <Plus className="w-4 h-4 text-primary shrink-0" />
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b">
          <button onClick={handleBack} className="industrial-button p-2 rounded">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <DialogTitle className="flex-1 text-center text-lg font-semibold pr-10">
            Date/Time Code Builder
          </DialogTitle>
        </div>

        {/* Font selector + Date Mode — compact top section */}
        <div className="px-4 pt-3 space-y-3">
          {/* Font selector */}
          <div className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Font:</Label>
            <Select value={selectedFont} onValueChange={setSelectedFont}>
              <SelectTrigger className="flex-1 h-9 text-sm">
                <SelectValue placeholder="Select font" />
              </SelectTrigger>
              <SelectContent>
                {allowedFonts.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Mode Toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setDateMode('manufacturing')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                dateMode === 'manufacturing'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Calendar className="w-4 h-4" />
              MFG Date
            </button>
            <button
              onClick={() => setDateMode('expiration')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                dateMode === 'expiration'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Clock className="w-4 h-4" />
              EXP Date
            </button>
          </div>

          {/* Offset controls (only for expiration) */}
          {dateMode === 'expiration' && (
            <div className="flex items-center gap-3 bg-muted/30 border border-border rounded-lg p-3">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Expires in:</Label>
              <Input
                type="number"
                min={0}
                max={9999}
                value={offsetValue}
                onChange={(e) => setOffsetValue(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 h-8 text-center text-sm"
              />
              <Select value={offsetUnit} onValueChange={(v) => setOffsetUnit(v as OffsetUnit)}>
                <SelectTrigger className="w-28 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">Days</SelectItem>
                  <SelectItem value="weeks">Weeks</SelectItem>
                  <SelectItem value="months">Months</SelectItem>
                  <SelectItem value="years">Years</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Live preview strip */}
        <div className="px-4 pt-1">
          <div className="flex items-center gap-2 mb-1">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            {dateMode === 'expiration' && (
              <span className="text-xs text-amber-400 font-medium">
                {offsetLabel ? `EXP ${offsetLabel}` : 'EXP (set offset above)'}
              </span>
            )}
            {dateMode === 'manufacturing' && (
              <span className="text-xs text-primary font-medium">MFG (Today)</span>
            )}
            {selectedFontInfo && (
              <span className="text-xs text-muted-foreground ml-auto">{selectedFontInfo.label}</span>
            )}
          </div>
          <div className="bg-black rounded-lg p-3 min-h-[44px] flex items-center overflow-x-auto">
            {tokens.length === 0 ? (
              <span className="text-muted-foreground/50 text-sm italic">
                Tap a preset or add tokens below…
              </span>
            ) : (
              <span className="text-amber-300 font-mono text-lg tracking-wide whitespace-nowrap">
                {preview}
              </span>
            )}
          </div>

          {/* Token chips (removable) */}
          {tokens.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 items-center">
              {tokens.map((t) => (
                <button
                  key={t.key}
                  onClick={() => removeToken(t.key)}
                  className="inline-flex items-center gap-1 bg-primary/20 text-primary border border-primary/30 rounded px-2 py-0.5 text-xs font-medium hover:bg-destructive/20 hover:text-destructive hover:border-destructive/30 transition-colors group"
                  title="Click to remove"
                >
                  {t.def.chip}
                  <X className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                </button>
              ))}
              <button
                onClick={clearTokens}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-1"
                title="Clear all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Tabs: Presets / Build */}
        <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 340px)' }}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
            <TabsList className="grid w-full grid-cols-2 mb-3">
              <TabsTrigger value="presets">Quick Presets</TabsTrigger>
              <TabsTrigger value="build">Build Custom</TabsTrigger>
            </TabsList>

            <TabsContent value="presets" className="space-y-2 mt-0">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset)}
                  className="w-full flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border border-border rounded-lg p-3 transition-colors text-left"
                >
                  <div>
                    <div className="text-foreground font-medium text-sm">{preset.label}</div>
                    <div className="text-muted-foreground text-xs">{preset.example}</div>
                  </div>
                  <Plus className="w-5 h-5 text-primary shrink-0" />
                </button>
              ))}
            </TabsContent>

            <TabsContent value="build" className="space-y-4 mt-0">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Date</Label>
                <div className="flex flex-wrap gap-2">
                  {DATE_TOKENS.map(renderTokenButton)}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Time</Label>
                <div className="flex flex-wrap gap-2">
                  {TIME_TOKENS.map(renderTokenButton)}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Program (Programmable Codes)</Label>
                <div className="flex flex-wrap gap-2">
                  {PROGRAM_TOKENS.map(renderTokenButton)}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Separators</Label>
                <div className="flex flex-wrap gap-2">
                  {SEPARATOR_TOKENS.map(renderTokenButton)}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Custom Text</Label>
                <div className="flex gap-2">
                  <Input
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="e.g. LOT"
                    className="flex-1 h-9"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomLiteral()}
                  />
                  <button
                    onClick={addCustomLiteral}
                    className="industrial-button px-3 py-1.5 rounded text-sm"
                    disabled={!customText.trim()}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Add button */}
        <div className="border-t px-4 py-3 flex justify-end">
          <button
            onClick={handleDone}
            disabled={tokens.length === 0}
            className="industrial-button px-6 py-2.5 rounded font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Add to Message
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
