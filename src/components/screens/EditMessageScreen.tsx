import { useState, useEffect, useRef } from 'react';
import { Save, X, FilePlus, SaveAll, Trash2, Settings, AlignHorizontalDistributeCenter, ChevronLeft, ChevronRight, Copy, SlidersHorizontal, Database } from 'lucide-react';
import { toast } from 'sonner';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageCanvas } from '@/components/messages/MessageCanvas';
import { loadTemplate, templateToMultilineConfig, type ParsedTemplate } from '@/lib/templateParser';
import { TEMPLATE_LINE_Y_POSITIONS, getValidCanvasYPositions } from '@/lib/messageProtocol';
import { computeAutoCodeValue } from '@/lib/autoCodeProtocol';
import { NewFieldDialog } from '@/components/messages/NewFieldDialog';
import { AutoCodeFieldDialog } from '@/components/messages/AutoCodeFieldDialog';
import { TimeCodesDialog } from '@/components/messages/TimeCodesDialog';
import { DateCodesDialog } from '@/components/messages/DateCodesDialog';
import { DateCodeBuilder, DateCodeBuilderResult } from '@/components/messages/DateCodeBuilder';
import { CounterDialog } from '@/components/messages/CounterDialog';
import { UserDefineDialog, UserDefineConfig } from '@/components/messages/UserDefineDialog';
import { UserDefineEntryDialog, UserDefinePrompt } from '@/components/messages/UserDefineEntryDialog';
import { BarcodeFieldDialog, BarcodeFieldConfig } from '@/components/messages/BarcodeFieldDialog';
import { estimateBarcodeWidthDots } from '@/lib/barcodeRenderer';

import { GraphicFieldDialog, GraphicFieldConfig } from '@/components/messages/GraphicFieldDialog';
import { MessageSettingsDialog, MessageSettings, defaultMessageSettings } from '@/components/messages/MessageSettingsDialog';
import { AdvancedSettingsDialog, AdvancedSettings, defaultAdvancedSettings } from '@/components/messages/AdvancedSettingsDialog';
import { DataLinkDialog } from '@/components/messages/DataLinkDialog';
import { supabase } from '@/integrations/supabase/client';
import { FieldSettingsPanel, FieldSettings, defaultFieldSettings } from '@/components/messages/FieldSettingsPanel';
import { getModelCapabilities } from '@/lib/modelCapabilities';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { validateMessageName, sanitizeMessageName } from '@/lib/messageNameValidation';


export interface MessageField {
  id: number;
  type: 'text' | 'date' | 'time' | 'counter' | 'logo' | 'userdefine' | 'barcode';
  data: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: string;
  // Per-field settings (manual pages 49-50)
  bold?: number;
  gap?: number;
  rotation?: FieldSettings['rotation'];
  autoNumerals?: number;
  // AutoCode metadata for live refresh
  autoCodeFormat?: string;       // e.g. 'HH:MM:SS', 'MM/DD/YY'
  autoCodeFieldType?: string;    // e.g. 'time', 'date_normal', 'program_hour'
  autoCodeExpiryDays?: number;   // expiry offset
  // Prompt before print: text field that asks operator for input before message selection
  promptBeforePrint?: boolean;
  promptLabel?: string;          // Display label for the prompt (e.g. "LOT CODE")
  promptLength?: number;         // Max characters allowed
}

export interface MessageDetails {
  name: string;
  height: number;
  width: number;
  fields: MessageField[];
  templateValue?: string; // Track which template was selected
  settings?: MessageSettings; // Message-level print settings
  advancedSettings?: AdvancedSettings; // Advanced settings (pages 52-55)
}

// Template options - single heights for mixed font messages (loaded from .BIN files)
const SINGLE_TEMPLATES = [
  { value: '32', label: '32 dots', file: '1L32U.BIN' },
  { value: '25', label: '25 dots', file: '1L25U.BIN' },
  { value: '19', label: '19 dots', file: '1L19U.BIN' },
  { value: '16', label: '16 dots', file: '1L16U.BIN' },
  { value: '12', label: '12 dots', file: '1L12U.BIN' },
  { value: '9', label: '9 dots', file: '1L9U.BIN' },
  { value: '7', label: '7 dots', file: '1L7U.BIN' },
  { value: '7s', label: '7 dots (narrow)', file: '1L7sU.BIN' },
  { value: '5', label: '5 dots', file: '1L5U.BIN' },
  { value: '5s', label: '5 dots (standard)', file: '1L5sU.BIN' },
] as const;

// Multi-line templates - loaded from .BIN files
// Heights calculated as: (lines × dotsPerLine) + (lines - 1) for 1-dot spacing between lines
const MULTILINE_TEMPLATES = [
  { value: 'multi-5x5', label: '5L×5', height: 29, lines: 5, dotsPerLine: 5, file: '5L5U.BIN' },
  { value: 'multi-4x7', label: '4L×7', height: 31, lines: 4, dotsPerLine: 7, file: '4L7U.BIN' },
  { value: 'multi-4x5', label: '4L×5', height: 23, lines: 4, dotsPerLine: 5, file: '4L5U.BIN' },
  { value: 'multi-3x9', label: '3L×9', height: 29, lines: 3, dotsPerLine: 9, file: '3L9U.BIN' },
  { value: 'multi-3x7', label: '3L×7', height: 23, lines: 3, dotsPerLine: 7, file: '3L7U.BIN' },
  { value: 'multi-2x12', label: '2L×12', height: 25, lines: 2, dotsPerLine: 12, file: '2L12U.BIN' },
  { value: 'multi-2x9', label: '2L×9', height: 19, lines: 2, dotsPerLine: 9, file: '2L9U.BIN' },
  { value: 'multi-2x7', label: '2L×7', height: 16, lines: 2, dotsPerLine: 7, file: '2L7U.BIN' },
  { value: 'multi-2x5', label: '2L×5', height: 11, lines: 2, dotsPerLine: 5, file: '2L5U.BIN' },
] as const;

// Font size options - matching actual printer fonts
const FONT_SIZES = [
  { value: 'Standard5High', label: '5 High', height: 5 },
  { value: 'Standard7High', label: '7 High', height: 7 },
  { value: 'Narrow7High', label: '7 High Narrow', height: 7 },
  { value: 'Standard9High', label: '9 High', height: 9 },
  { value: 'Standard12High', label: '12 High', height: 12 },
  { value: 'Standard16High', label: '16 High', height: 16 },
  { value: 'Standard19High', label: '19 High', height: 19 },
  { value: 'Standard25High', label: '25 High', height: 25 },
  { value: 'Standard32High', label: '32 High', height: 32 },
] as const;

type SingleTemplateValue = typeof SINGLE_TEMPLATES[number]['value'];
type MultilineTemplateValue = typeof MULTILINE_TEMPLATES[number]['value'];
type TemplateValue = SingleTemplateValue | MultilineTemplateValue;

interface EditMessageScreenProps {
  messageName: string;
  onSave: (message: MessageDetails, isNew?: boolean) => Promise<MessageDetails | null> | void;
  onCancel: () => void;
  onGetMessageDetails?: (name: string) => Promise<MessageDetails | null>;
  printerTime?: Date | null;
  customCounters?: number[];
  connectedPrinterId?: number | null;
  isConnected?: boolean;
  startEmpty?: boolean;
  printerModel?: string | null;
  preset?: 'metrc-retail-id';
}

export function EditMessageScreen({
  messageName,
  onSave,
  onCancel,
  onGetMessageDetails,
  printerTime,
  customCounters,
  connectedPrinterId,
  isConnected = false,
  startEmpty = false,
  printerModel,
  preset,
}: EditMessageScreenProps) {
  // Filter templates and fonts based on connected printer model
  const capabilities = getModelCapabilities(printerModel);
  const availableSingleTemplates = capabilities
    ? SINGLE_TEMPLATES.filter(t => capabilities.templates.includes(t.value as any))
    : SINGLE_TEMPLATES;
  const availableMultilineTemplates = capabilities
    ? MULTILINE_TEMPLATES.filter(t => capabilities.templates.includes(t.value as any))
    : MULTILINE_TEMPLATES;
  const availableFontSizes = capabilities
    ? FONT_SIZES.filter(f => capabilities.fonts.includes(f.value as any))
    : FONT_SIZES;
  // Build initial fields based on preset or defaults
  const buildInitialFields = (): MessageField[] => {
    if (preset === 'metrc-retail-id') {
      // 25-dot template for max throughput (~200 units/min)
      // QR/DataMatrix: 18 dots tall at bottom (y=7), Text: 5 dots at top (y=0)
      return [
        { id: 1, type: 'barcode', data: '[QR] https://d.1a4.com/sample', x: 0, y: 7, width: 25, height: 25, fontSize: 'Standard25High', bold: 0, gap: 1, rotation: 'Normal', autoNumerals: 0 },
        { id: 2, type: 'text', data: 'RETAIL ID', x: 38, y: 17, width: 60, height: 5, fontSize: 'Standard5High', bold: 0, gap: 1, rotation: 'Normal', autoNumerals: 0 },
      ];
    }
    if (startEmpty) return [];
    return [
      { id: 1, type: 'text', data: messageName, x: 0, y: 16, width: 60, height: 16, fontSize: 'Standard16High', bold: 0, gap: 1, rotation: 'Normal', autoNumerals: 0 },
    ];
  };

  const [message, setMessage] = useState<MessageDetails>({
    name: messageName,
    height: preset === 'metrc-retail-id' ? 25 : 16,
    width: 200,
    fields: buildInitialFields(),
    templateValue: preset === 'metrc-retail-id' ? '25' : '16',
    settings: defaultMessageSettings,
    advancedSettings: defaultAdvancedSettings,
  });
  const [loading, setLoading] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(startEmpty && !preset ? null : 1);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<number>>(new Set());
  const [loadedTemplate, setLoadedTemplate] = useState<ParsedTemplate | null>(null);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [newFieldDialogOpen, setNewFieldDialogOpen] = useState(false);
  const [autoCodeDialogOpen, setAutoCodeDialogOpen] = useState(false);
  const [timeCodesDialogOpen, setTimeCodesDialogOpen] = useState(false);
  const [dateCodesDialogOpen, setDateCodesDialogOpen] = useState(false);
  const [dateBuilderOpen, setDateBuilderOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [advancedSettingsDialogOpen, setAdvancedSettingsDialogOpen] = useState(false);
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  
  const [counterDialogOpen, setCounterDialogOpen] = useState(false);
  const [userDefineDialogOpen, setUserDefineDialogOpen] = useState(false);
  const [graphicDialogOpen, setGraphicDialogOpen] = useState(false);
  const [dataLinkDialogOpen, setDataLinkDialogOpen] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [userDefineEntryOpen, setUserDefineEntryOpen] = useState(false);
  const [userDefinePrompts, setUserDefinePrompts] = useState<UserDefinePrompt[]>([]);
  const fetchStartedRef = useRef(false); // Guard against duplicate fetches from unstable callback refs
  const printerOffsetMsRef = useRef(0);

  useEffect(() => {
    printerOffsetMsRef.current = printerTime ? printerTime.getTime() - Date.now() : 0;
  }, [printerTime]);

  // Mobile: lock the parent horizontal scroller while long-press dragging fields
  const [isCanvasScrollLocked, setIsCanvasScrollLocked] = useState(false);
  const canvasScrollerRef = useRef<HTMLDivElement>(null);

  // Load message details when component mounts (only once)
  // Uses a ref guard because onGetMessageDetails may be an unstable inline function
  // that changes reference every parent render (from polling), which would re-trigger
  // this effect before the first fetch completes.
  useEffect(() => {
    if (startEmpty) {
      setInitialLoadDone(true);
      return;
    }

    if (onGetMessageDetails && !initialLoadDone && !fetchStartedRef.current) {
      fetchStartedRef.current = true;
      setLoading(true);
      onGetMessageDetails(messageName)
        .then((details) => {
          if (details) {
            setMessage(details);
            if (details.fields.length > 0) {
              setSelectedFieldId(details.fields[0].id);
            }
            // Detect user define fields and prompt for entry
            const udFields = details.fields.filter(f => f.type === 'userdefine');
            if (udFields.length > 0) {
              const prompts: UserDefinePrompt[] = udFields.map(f => {
                // Extract label and length from field data
                // Format from ^LF: Element D: contains the ID/label
                // The field width gives us a hint about character count
                const label = f.data || 'USER';
                // Estimate length from width and font, fallback to data length or 3
                const fontWidth = f.fontSize?.includes('5High') ? 4 : f.fontSize?.includes('7') ? 5 : f.fontSize?.includes('9') ? 7 : f.fontSize?.includes('12') ? 8 : f.fontSize?.includes('16') ? 10 : f.fontSize?.includes('19') ? 12 : f.fontSize?.includes('25') ? 18 : 20;
                const gap = f.gap ?? 1;
                const estimatedLen = f.width > 0 ? Math.max(1, Math.round(f.width / (fontWidth + gap))) : (f.data?.length || 3);
                return {
                  fieldId: f.id,
                  label,
                  length: estimatedLen,
                };
              });
              setUserDefinePrompts(prompts);
              setUserDefineEntryOpen(true);
            }
          }
        })
        .finally(() => {
          setLoading(false);
          setInitialLoadDone(true);
        });
    }
  }, [messageName, onGetMessageDetails, initialLoadDone, startEmpty]);

  // Auto-load linked data source values (first row) when editor opens
  useEffect(() => {
    if (!initialLoadDone) return;
    const loadLinkedData = async () => {
      try {
        const { data: job } = await supabase
          .from('print_jobs')
          .select('data_source_id, field_mappings')
          .eq('message_name', messageName)
          .limit(1)
          .maybeSingle();
        if (!job) return;

        const { data: firstRow } = await supabase
          .from('data_source_rows')
          .select('values')
          .eq('data_source_id', job.data_source_id)
          .order('row_index', { ascending: true })
          .limit(1)
          .single();
        if (!firstRow) return;

        const rowValues = firstRow.values as Record<string, string>;
        const fieldMappings = job.field_mappings as Record<string, string | string[]>;

        setMessage((prev) => {
          const updatedFields = prev.fields.map((f, idx) => {
            const fieldNum = idx + 1;
            // Find which column maps to this field (supports single and multi-mapping)
            const mappedCol = Object.entries(fieldMappings).find(([, mapped]) => {
              const mappedFields = Array.isArray(mapped) ? mapped : [mapped];
              return mappedFields.some((v) => parseInt(v, 10) === fieldNum);
            });
            if (mappedCol && rowValues[mappedCol[0]] != null) {
              const newValue = String(rowValues[mappedCol[0]]);
              if (f.type === 'barcode') {
                const prefixMatch = f.data.match(/^(\[[^\]]+\])\s*/);
                const prefix = prefixMatch ? prefixMatch[1] : '[QR]';
                return { ...f, data: `${prefix} ${newValue}` };
              }
              return { ...f, data: newValue };
            }
            return f;
          });
          return { ...prev, fields: updatedFields, width: autoResizeWidth(updatedFields) };
        });
      } catch {
        // No linked data, that's fine
      }
    };
    loadLinkedData();
  }, [messageName, initialLoadDone]);

  // Prevent the overflow-x container from taking over horizontal swipes while dragging
  useEffect(() => {
    const el = canvasScrollerRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      if (isCanvasScrollLocked) e.preventDefault();
    };

    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [isCanvasScrollLocked]);

  // Live-refresh time and date fields every second using printer time
  useEffect(() => {
    const hasAutoCodeFields = message.fields.some(
      f => f.type === 'time' || f.type === 'date' || f.type === 'counter'
    );
    if (!hasAutoCodeFields) return;

    const interval = setInterval(() => {
      setMessage((prev) => ({
        ...prev,
        fields: prev.fields.map((f) => {
          if (!f.autoCodeFieldType) return f;
          const now = new Date(Date.now() + printerOffsetMsRef.current);
          let newData = f.data;

          if (f.autoCodeFieldType === 'time' && f.autoCodeFormat) {
            const h = now.getHours().toString().padStart(2, '0');
            const m = now.getMinutes().toString().padStart(2, '0');
            const s = now.getSeconds().toString().padStart(2, '0');
            switch (f.autoCodeFormat) {
              case 'HH:MM:SS': newData = `${h}:${m}:${s}`; break;
              case 'HH:MM': newData = `${h}:${m}`; break;
              case 'HH': newData = h; break;
              case 'MM:SS': newData = `${m}:${s}`; break;
              case 'MM': newData = m; break;
              case 'SS': newData = s; break;
              default: newData = `${h}:${m}:${s}`;
            }
          } else if (f.autoCodeFieldType === 'program_hour') {
            newData = now.getHours().toString().padStart(2, '0');
          } else if (f.autoCodeFieldType === 'program_minute') {
            newData = now.getMinutes().toString().padStart(2, '0');
          } else if (f.autoCodeFieldType === 'program_second') {
            newData = now.getSeconds().toString().padStart(2, '0');
          } else if (f.autoCodeFieldType?.startsWith('date_') || f.autoCodeFieldType === 'program_hour' || f.autoCodeFieldType === 'program_minute' || f.autoCodeFieldType === 'program_second') {
            const computed = computeAutoCodeValue(f.autoCodeFieldType, f.autoCodeFormat, now, f.autoCodeExpiryDays);
            if (computed !== null) newData = computed;
          } else if (f.autoCodeFieldType?.startsWith('counter_')) {
            const ctrId = parseInt(f.autoCodeFieldType.split('_')[1]) || 1;
            // Use live counter value if available, otherwise show from advanced settings
            const ctrConfig = prev.advancedSettings?.counters?.find(c => c.id === ctrId);
            const ctrValue = customCounters?.[ctrId - 1] ?? ctrConfig?.startCount ?? 0;
            const endCount = ctrConfig?.endCount ?? 9999;
            const digits = endCount.toString().length;
            newData = ctrConfig?.leadingZeroes 
              ? ctrValue.toString().padStart(digits, '0') 
              : ctrValue.toString();
          }

          return newData !== f.data ? { ...f, data: newData } : f;
        }),
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [message.fields.length, message.advancedSettings, printerTime, customCounters]);

  const selectedField = message.fields.find((f) => f.id === selectedFieldId);

  // Auto-size message width to fit all fields (with some padding)
  const autoResizeWidth = (fields: MessageField[]) => {
    if (fields.length === 0) return 200; // Default minimum
    const maxRight = Math.max(...fields.map(f => f.x + f.width));
    return Math.max(200, maxRight + 20); // At least 200, plus 20px padding
  };

  const handleFieldDataChange = (value: string) => {
    if (!selectedFieldId) return;
    setMessage((prev) => {
      const updatedFields = prev.fields.map((f) =>
        f.id === selectedFieldId ? { ...f, data: value } : f
      );
      return {
        ...prev,
        fields: updatedFields,
        width: autoResizeWidth(updatedFields),
      };
    });
  };

  const handleTemplateChange = async (value: string) => {
    // Check if it's a multi-line template
    const multiTemplate = MULTILINE_TEMPLATES.find(t => t.value === value);
    const singleTemplate = SINGLE_TEMPLATES.find(t => t.value === value);
    
    const height = multiTemplate 
      ? multiTemplate.height 
      : (value === '5s' ? 5 : parseInt(value) || 16);
    
    // For multi-line templates, max font height is dotsPerLine; for single, it's the full height
    const maxFontHeight = multiTemplate ? multiTemplate.dotsPerLine : height;
    const blockedRows = 32 - height;
    
    // Calculate line positions for multi-line templates
    const getLinePositions = () => {
      if (!multiTemplate) return null;
      const { lines, dotsPerLine } = multiTemplate;
      const positions: number[] = [];
      let currentY = blockedRows;
      for (let i = 0; i < lines; i++) {
        positions.push(currentY);
        currentY += dotsPerLine + 1; // +1 for the 1-dot gap
      }
      return positions;
    };
    
    const linePositions = getLinePositions();
    
    // Try to load the template file if available
    const templateFile = multiTemplate?.file || singleTemplate?.file;
    if (templateFile) {
      console.log('Loading template file:', templateFile);
      const template = await loadTemplate(templateFile);
      if (template) {
        console.log('Template loaded successfully:', template);
        setLoadedTemplate(template);
      }
    } else {
      setLoadedTemplate(null);
    }
    
    setMessage((prev) => ({
      ...prev,
      height,
      templateValue: value, // Store the actual template selection
      // Update fields: adjust font if too tall, reposition Y to fit in lines
      fields: prev.fields.map((f, index) => {
        const currentFontHeight = FONT_SIZES.find(fs => fs.value === f.fontSize)?.height || 16;
        
        // If current font is too tall for the new template, find the largest available font that fits
        let newFontSize = f.fontSize;
        let newFieldHeight = currentFontHeight;
        if (currentFontHeight > maxFontHeight) {
          const fittingFonts = availableFontSizes.filter(fs => fs.height <= maxFontHeight);
          if (fittingFonts.length > 0) {
            // Pick the largest font that fits
            const bestFont = fittingFonts[fittingFonts.length - 1];
            newFontSize = bestFont.value;
            newFieldHeight = bestFont.height;
          }
        }
        
        // Calculate new Y position
        let newY = f.y;
        if (multiTemplate && linePositions) {
          // For multi-line templates, assign fields to lines (distribute them)
          const lineIndex = Math.min(index, linePositions.length - 1);
          newY = linePositions[lineIndex];
        } else {
          // For single-line templates, position at the bottom of the template area
          newY = Math.max(blockedRows, 32 - newFieldHeight);
        }
        
        // Barcode fields: 2D codes (QR/DM/DotCode) keep their explicit height
        // (set from version/size selection); 1D codes resize to template height
        const isBarcode = f.type === 'barcode';
        const is2DCode = isBarcode && f.data && /^\[(QR|QRCODE|DATAMATRIX|DM|DATA MATRIX|DOTCODE)/i.test(f.data);
        const effectiveHeight = is2DCode ? f.height : isBarcode ? maxFontHeight : newFieldHeight;

        return {
          ...f,
          fontSize: newFontSize,
          height: effectiveHeight,
          y: newY,
        };
      }),
    }));
  };

  // Combined list of all templates for navigation (filtered by model)
  const ALL_TEMPLATES = [
    ...availableSingleTemplates.map(t => ({ ...t, type: 'single' as const })),
    ...availableMultilineTemplates.map(t => ({ ...t, type: 'multi' as const })),
  ];

  // Handle template navigation (delta-based: +1 = next, -1 = prev)
  const handleTemplateNavigate = (delta: number) => {
    const currentValue = getCurrentTemplateValue();
    const currentIdx = ALL_TEMPLATES.findIndex(t => t.value === currentValue);
    const newIdx = Math.max(0, Math.min(ALL_TEMPLATES.length - 1, currentIdx + delta));
    if (newIdx !== currentIdx) {
      handleTemplateChange(ALL_TEMPLATES[newIdx].value);
    }
  };

  // Get the current template value for the dropdown
  const getCurrentTemplateValue = (): string => {
    return message.templateValue || message.height.toString();
  };

  // Get current multiline template info (if any) - only if explicitly selected
  const currentMultilineTemplate = message.templateValue?.startsWith('multi-') 
    ? MULTILINE_TEMPLATES.find(t => t.value === message.templateValue)
    : null;
  
  // Get allowed font sizes based on current template and model capabilities
  const getAllowedFonts = () => {
    if (currentMultilineTemplate) {
      // For multiline templates, only allow fonts that match the dots per line AND are available for this model
      return availableFontSizes.filter(fs => fs.height <= currentMultilineTemplate.dotsPerLine);
    }
    // For single-height templates, allow fonts up to the template height that are available for this model
    return availableFontSizes.filter(fs => fs.height <= message.height);
  };

  // Use printer time (^SD) to stay in sync with the printer HMI.
  // Falls back to local PC time when not connected.
  const getCurrentTime = () => {
    return new Date(Date.now() + printerOffsetMsRef.current);
  };

  // Helper to format time based on format string
  const formatTimeValue = (format: string): string => {
    const now = getCurrentTime();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    
    switch (format) {
      case 'HH:MM:SS': return `${hours}:${minutes}:${seconds}`;
      case 'HH:MM': return `${hours}:${minutes}`;
      case 'HH': return hours;
      case 'MM:SS': return `${minutes}:${seconds}`;
      case 'MM': return minutes;
      case 'SS': return seconds;
      default: return `${hours}:${minutes}:${seconds}`;
    }
  };

  // Helper to format date/time values — delegates to shared autoCodeProtocol utility
  const getAutoCodeDisplayValue = (fieldType: string, format?: string, expiryDays?: number): string => {
    const now = getCurrentTime();
    const computed = computeAutoCodeValue(fieldType, format, now, expiryDays);
    return computed ?? fieldType.toUpperCase();
  };

  const handleAddField = (fieldType: string, formatOrOptions?: string | { promptBeforePrint?: boolean; promptLabel?: string; promptLength?: number }) => {
    // Extract prompt options if provided as object
    const promptOptions = typeof formatOrOptions === 'object' ? formatOrOptions : undefined;
    const format = typeof formatOrOptions === 'string' ? formatOrOptions : undefined;
    const newId = Math.max(0, ...message.fields.map((f) => f.id)) + 1;
    
    // Determine field data based on type
    let fieldData = fieldType === 'text' ? '' : fieldType.toUpperCase();
    let counterId: number | undefined;
    
    // Parse expiry days from format if present
    let expiryDays = 0;
    if (format?.includes('|expiry:')) {
      const match = format.match(/\|expiry:(\d+)/);
      if (match) expiryDays = parseInt(match[1]) || 0;
    }
    
    if (fieldType === 'time' && format) {
      fieldData = formatTimeValue(format);
    } else if (fieldType === 'program_hour' || fieldType === 'program_minute' || fieldType === 'program_second') {
      fieldData = getAutoCodeDisplayValue(fieldType);
    } else if (fieldType.startsWith('date_')) {
      fieldData = getAutoCodeDisplayValue(fieldType, format, expiryDays);
    } else if (fieldType.startsWith('counter_')) {
      counterId = parseInt(fieldType.split('_')[1]) || 1;
      const ctrConfig = message.advancedSettings?.counters?.find(c => c.id === counterId);
      const startVal = ctrConfig?.startCount ?? 0;
      const endCount = ctrConfig?.endCount ?? 9999;
      const digits = endCount.toString().length;
      fieldData = ctrConfig?.leadingZeroes 
        ? startVal.toString().padStart(digits, '0') 
        : startVal.toString();
    }
    
    // Calculate Y position and font size based on template
    const blockedRows = 32 - message.height;
    const multiTemplate = message.templateValue?.startsWith('multi-')
      ? MULTILINE_TEMPLATES.find(t => t.value === message.templateValue)
      : null;
    
    // For multi-line templates, pick the largest font that fits the line height
    let fontHeight: number;
    let fontSize: string;
    if (multiTemplate) {
      const maxH = multiTemplate.dotsPerLine;
      const fittingFonts = availableFontSizes.filter(fs => fs.height <= maxH);
      const bestFont = fittingFonts.length > 0 ? fittingFonts[fittingFonts.length - 1] : availableFontSizes[0];
      fontHeight = bestFont.height;
      fontSize = bestFont.value;
    } else {
      fontHeight = Math.min(16, message.height);
      fontSize = 'Standard16High';
      // Ensure font fits single-line template height
      if (fontHeight > message.height) {
        const fittingFonts = availableFontSizes.filter(fs => fs.height <= message.height);
        const bestFont = fittingFonts.length > 0 ? fittingFonts[fittingFonts.length - 1] : availableFontSizes[0];
        fontHeight = bestFont.height;
        fontSize = bestFont.value;
      }
    }
    
    let newY = blockedRows; // default: top of template area
    
    // Use firmware-defined Y grid positions for ALL templates
    const validYPositions = getValidCanvasYPositions(
      message.templateValue ?? String(message.height),
      message.height,
      fontHeight,
    );

    if (validYPositions.length > 0) {
      // Find occupied Y positions from existing fields
      const occupiedYs = new Set(message.fields.map(f => f.y));
      
      // Round-robin: place on the next available grid position
      const lineIndex = message.fields.length % validYPositions.length;
      newY = validYPositions[lineIndex];
      
      // If that position is already taken, find the first unoccupied one
      if (occupiedYs.has(newY)) {
        const unoccupied = validYPositions.find(y => !occupiedYs.has(y));
        if (unoccupied !== undefined) {
          newY = unoccupied;
        }
        // If all positions are occupied, stack horizontally on the same row
      }
    }
    
    const newField: MessageField = {
      id: newId,
      type: fieldType === 'time' || fieldType.startsWith('program_') ? 'time' 
            : fieldType.startsWith('counter_') ? 'counter'
            : fieldType.startsWith('date_') ? 'date'
            : fieldType as MessageField['type'],
      data: promptOptions ? 'X'.repeat(promptOptions.promptLength || 3) : fieldData,
      x: message.fields.length * 50,
      y: newY,
      width: 50,
      height: fontHeight,
      fontSize,
      // Store AutoCode metadata for live refresh
      autoCodeFormat: format,
      autoCodeFieldType: fieldType,
      autoCodeExpiryDays: expiryDays || undefined,
      // Prompt before print metadata
      promptBeforePrint: promptOptions?.promptBeforePrint,
      promptLabel: promptOptions?.promptLabel,
      promptLength: promptOptions?.promptLength,
    };
    setMessage((prev) => {
      const updatedFields = [...prev.fields, newField];
      return {
        ...prev,
        fields: updatedFields,
        width: autoResizeWidth(updatedFields),
      };
    });
    setSelectedFieldId(newId);
  };

  const handleAddBarcode = (config: BarcodeFieldConfig) => {
    const newId = Math.max(0, ...message.fields.map((f) => f.id)) + 1;
    
    // Format barcode data string with encoding info and flags for display/protocol
    // Include HR flag if human readable is enabled
    const preferredSize =
      config.encoding === 'qrcode'
        ? config.size
        : config.encoding === 'dotcode'
          ? config.dotcodeScale
          : undefined;

    const barcodeFlags: string[] = [];
    if (preferredSize && /^\d+$/.test(preferredSize)) {
      barcodeFlags.push(`S=${preferredSize}`);
    }
    if (config.humanReadable) {
      barcodeFlags.push('HR');
    }

    const encodingWithFlags = [config.encoding.toUpperCase(), ...barcodeFlags].join('|');
    const barcodeLabel = `[${encodingWithFlags}] ${config.data}`;
    
    // Estimate barcode width in dots based on encoding type and data
    const widthDots = estimateBarcodeWidthDots(config.encoding, config.data, config.humanReadable, config.magnification ? config.magnification - 1 : 0);
    
    // For QR codes, height = version dot size (V1=21, V2=25, V3=29)
    // For DataMatrix, derive from selected matrix size (e.g. "12x12" → 12)
    // For others, use template height
    const is2DBarcode = ['qrcode', 'datamatrix', 'dotcode'].includes(config.encoding);
    let barcodeHeight = Math.min(message.height, 32);
    if (config.encoding === 'qrcode' && config.size) {
      const QR_VERSION_DOTS: Record<string, number> = { '1': 21, '2': 25, '3': 29 };
      barcodeHeight = QR_VERSION_DOTS[config.size] || 25;
    } else if (config.encoding === 'datamatrix' && config.size) {
      // size is like "12x12", "16x16", etc. — extract the height portion
      const dmMatch = config.size.match(/(\d+)x(\d+)/);
      if (dmMatch) barcodeHeight = parseInt(dmMatch[2], 10);
    }

    const newField: MessageField = {
      id: newId,
      type: 'barcode',
      data: barcodeLabel,
      x: message.fields.length * 50,
      y: 32 - barcodeHeight,
      width: widthDots,
      height: barcodeHeight,
      fontSize: 'Standard16High',
      bold: config.magnification ? config.magnification - 1 : 0,
    };
    
    setMessage((prev) => {
      const updatedFields = [...prev.fields, newField];
      return {
        ...prev,
        fields: updatedFields,
        width: autoResizeWidth(updatedFields),
      };
    });
    setSelectedFieldId(newId);
  };


  // Handle Date/Time Code Builder output: create multiple fields from composed tokens
  // Groups consecutive literal tokens together with their adjacent auto-code tokens,
  // and creates one field per auto-code token (date/time/program).
  const handleAddDateCodeBuilderFields = (result: DateCodeBuilderResult) => {
    const { tokens, dateMode, offset, selectedFont } = result;
    if (tokens.length === 0) return;

    // Convert offset to days for autoCodeExpiryDays storage
    let expiryDays = 0;
    if (dateMode === 'expiration' && offset && offset.value > 0) {
      switch (offset.unit) {
        case 'days': expiryDays = offset.value; break;
        case 'weeks': expiryDays = offset.value * 7; break;
        case 'months': expiryDays = offset.value * 30; break;  // approximate
        case 'years': expiryDays = offset.value * 365; break;  // approximate
      }
    }

    // Apply offset for initial preview computation
    const now = new Date();
    if (expiryDays > 0) {
      now.setDate(now.getDate() + expiryDays);
    }
    const blockedRows = 32 - message.height;
    const multiTemplate = message.templateValue?.startsWith('multi-')
      ? MULTILINE_TEMPLATES.find(t => t.value === message.templateValue)
      : null;

    // Use the font selected in the builder
    const chosenFont = FONT_SIZES.find(f => f.value === selectedFont);
    const fontHeight = chosenFont?.height ?? 16;
    const fontSize = chosenFont?.value ?? 'Standard16High';

    // Get valid Y position
    const validYPositions = getValidCanvasYPositions(
      message.templateValue ?? String(message.height),
      message.height,
      fontHeight,
    );
    const occupiedYs = new Set(message.fields.map(f => f.y));
    let newY = blockedRows;
    if (validYPositions.length > 0) {
      const lineIndex = message.fields.length % validYPositions.length;
      newY = validYPositions[lineIndex];
      if (occupiedYs.has(newY)) {
        const unoccupied = validYPositions.find(y => !occupiedYs.has(y));
        if (unoccupied !== undefined) newY = unoccupied;
      }
    }

    // Group tokens into fields: each auto-code token becomes its own field,
    // consecutive literals get merged with their nearest auto-code token.
    // For simplicity, generate one field per token group where separators
    // attach to the preceding auto-code field as a suffix.
    const newFields: MessageField[] = [];
    let nextId = Math.max(0, ...message.fields.map(f => f.id)) + 1;
    let currentX = message.fields.length > 0
      ? Math.max(...message.fields.filter(f => Math.abs(f.y - newY) < fontHeight).map(f => f.x + f.width), 0)
      : 0;

    // Build all tokens into individual fields
    for (const token of tokens) {
      const def = token.def;

      if (def.category === 'literal') {
        // Literal/separator → text field
        const data = def.literalValue ?? token.customText ?? '';
        const charWidth = fontHeight <= 7 ? 5 : fontHeight <= 9 ? 7 : fontHeight <= 12 ? 8 : 10;
        const width = data.length * (charWidth + 1);
        newFields.push({
          id: nextId++,
          type: 'text',
          data,
          x: currentX,
          y: newY,
          width: Math.max(width, 5),
          height: fontHeight,
          fontSize,
          autoNumerals: 0,
        });
        currentX += width;
        continue;
      }

      // Date/Time/Program token → auto-code field
      let fieldType: string;
      let autoCodeFieldType: string;
      let fieldTypeTag: MessageField['type'];

      if (def.category === 'time') {
        fieldTypeTag = 'time';
        if (def.id === 'HH') {
          autoCodeFieldType = 'program_hour'; // We use AH for live, but store as specific
          // Actually for a simple time code builder, use time field type
          autoCodeFieldType = 'time';
        }
        // Map time tokens: HH, MIN, SEC
        const timeFormatMap: Record<string, string> = { 'HH': 'HH', 'MIN': 'MM', 'SEC': 'SS' };
        autoCodeFieldType = 'time';
        fieldType = 'time';
      } else if (def.category === 'program') {
        fieldTypeTag = 'time'; // program_hour etc are stored as 'time' type
        if (def.id.includes('hour') || def.id.includes('minute') || def.id.includes('second')) {
          fieldTypeTag = 'time';
        } else {
          fieldTypeTag = 'date';
        }
        autoCodeFieldType = def.id;
        fieldType = def.id;
      } else {
        // date category
        fieldTypeTag = 'date';
        autoCodeFieldType = `date_normal_${def.id}`;
        fieldType = `date_normal_${def.id}`;
      }

      // Compute live preview value
      const liveValue = computeAutoCodeValue(autoCodeFieldType, undefined, now) ?? def.chip;
      const charWidth = fontHeight <= 7 ? 5 : fontHeight <= 9 ? 7 : fontHeight <= 12 ? 8 : 10;
      const width = liveValue.length * (charWidth + 1);

      newFields.push({
        id: nextId++,
        type: fieldTypeTag,
        data: liveValue,
        x: currentX,
        y: newY,
        width: Math.max(width, 10),
        height: fontHeight,
        fontSize,
        autoCodeFieldType,
        autoCodeFormat: def.category === 'time'
          ? ({ 'HH': 'HH', 'MIN': 'MM', 'SEC': 'SS', 'HHMM': 'HH:MM', 'HHMMSS': 'HH:MM:SS' }[def.id] ?? 'HH:MM:SS')
          : undefined,
        autoCodeExpiryDays: expiryDays > 0 ? expiryDays : undefined,
        autoNumerals: 0,
      });
      currentX += width;
    }

    if (newFields.length === 0) return;

    setMessage((prev) => {
      const updatedFields = [...prev.fields, ...newFields];
      return {
        ...prev,
        fields: updatedFields,
        width: autoResizeWidth(updatedFields),
      };
    });
    setSelectedFieldId(newFields[0].id);
  };

  const handleAddUserDefine = (config: UserDefineConfig) => {
    const newId = Math.max(0, ...message.fields.map((f) => f.id)) + 1;
    
    // Create user define field representation
    const userDefineLabel = `[${config.id}:${'_'.repeat(config.length)}]`;
    
    const newField: MessageField = {
      id: newId,
      type: 'userdefine',
      data: userDefineLabel,
      x: message.fields.length * 50,
      y: 32 - message.height,
      width: config.length * 8 + 16, // Estimate width based on length
      height: Math.min(16, message.height),
      fontSize: 'Standard16High',
    };
    
    setMessage((prev) => {
      const updatedFields = [...prev.fields, newField];
      return {
        ...prev,
        fields: updatedFields,
        width: autoResizeWidth(updatedFields),
      };
    });
    setSelectedFieldId(newId);
  };

  const handleAddGraphic = (config: GraphicFieldConfig) => {
    const newId = Math.max(0, ...message.fields.map((f) => f.id)) + 1;
    
    // Create graphic field representation
    const graphicLabel = `[GRAPHIC: ${config.name}]`;
    
    const newField: MessageField = {
      id: newId,
      type: 'logo',
      data: graphicLabel,
      x: message.fields.length * 50,
      y: 32 - message.height,
      width: 32, // Fixed width for graphic placeholder
      height: Math.min(message.height, 32),
      fontSize: 'Standard16High',
    };
    
    setMessage((prev) => {
      const updatedFields = [...prev.fields, newField];
      return {
        ...prev,
        fields: updatedFields,
        width: autoResizeWidth(updatedFields),
      };
    });
    setSelectedFieldId(newId);
  };

  const handleDeleteField = () => {
    if (!selectedFieldId || message.fields.length <= 1) return;
    const currentIdx = message.fields.findIndex(f => f.id === selectedFieldId);
    setMessage((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== selectedFieldId),
    }));
    // Select next or previous field
    const newFields = message.fields.filter((f) => f.id !== selectedFieldId);
    setSelectedFieldId(newFields[Math.min(currentIdx, newFields.length - 1)]?.id ?? null);
  };

  // Navigate to previous field
  const handlePrevField = () => {
    if (message.fields.length === 0) return;
    const currentIdx = message.fields.findIndex(f => f.id === selectedFieldId);
    const newIdx = currentIdx <= 0 ? message.fields.length - 1 : currentIdx - 1;
    setSelectedFieldId(message.fields[newIdx].id);
  };

  // Navigate to next field
  const handleNextField = () => {
    if (message.fields.length === 0) return;
    const currentIdx = message.fields.findIndex(f => f.id === selectedFieldId);
    const newIdx = currentIdx >= message.fields.length - 1 ? 0 : currentIdx + 1;
    setSelectedFieldId(message.fields[newIdx].id);
  };

  // Copy selected field
  const handleCopyField = () => {
    if (!selectedFieldId) return;
    const fieldToCopy = message.fields.find(f => f.id === selectedFieldId);
    if (!fieldToCopy) return;
    
    const newId = Math.max(0, ...message.fields.map((f) => f.id)) + 1;
    const copiedField: MessageField = {
      ...fieldToCopy,
      id: newId,
      x: fieldToCopy.x + 20, // Offset slightly
      y: fieldToCopy.y,
    };
    
    setMessage((prev) => ({
      ...prev,
      fields: [...prev.fields, copiedField],
    }));
    setSelectedFieldId(newId);
  };

  // Update field settings (bold, gap, rotation, autoNumerals)
  const handleUpdateFieldSetting = (key: keyof MessageField, value: any) => {
    if (!selectedFieldId) return;
    setMessage((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.id === selectedFieldId ? { ...f, [key]: value } : f
      ),
    }));
  };

  /**
   * ^AL - Align Fields: Eliminates overlap by shifting overlapping fields to the right
   * Per protocol: If one field overlaps another, the field that starts farther to the right is moved
   */
  const handleAlignFields = () => {
    if (message.fields.length < 2) return;
    
    // Sort fields by X position (leftmost first)
    const sortedFields = [...message.fields].sort((a, b) => a.x - b.x);
    
    // Build new field positions, eliminating overlaps
    const newFields = sortedFields.map((field, idx) => {
      if (idx === 0) return field;
      
      // Check previous fields for overlaps
      let newX = field.x;
      for (let i = 0; i < idx; i++) {
        const prevField = sortedFields[i];
        const prevRight = prevField.x + prevField.width;
        
        // Check if this field overlaps with previous field (same Y-line)
        const sameRow = Math.abs(field.y - prevField.y) < field.height;
        if (sameRow && newX < prevRight) {
          // Move field to eliminate overlap (add 2 pixel gap)
          newX = prevRight + 2;
        }
      }
      
      return { ...field, x: newX };
    });
    
    setMessage((prev) => ({ ...prev, fields: newFields }));
    setFieldError(null);
  };

  const handleCanvasClick = (x: number, y: number, fieldId?: number) => {
    // Use field ID from canvas hit detection if provided (more accurate)
    if (fieldId != null) {
      setSelectedFieldId(fieldId);
      setFieldError(null);
      return;
    }
    // Fallback: find which field was clicked using stored dimensions
    const clickedField = message.fields.find(
      (f) => x >= f.x && x < f.x + f.width && y >= f.y && y < f.y + f.height
    );
    if (clickedField) {
      setSelectedFieldId(clickedField.id);
      setFieldError(null);
    }
  };

  const handleFieldMove = (fieldId: number, newX: number, newY: number) => {
    setMessage((prev) => {
      const updatedFields = prev.fields.map((f) =>
        f.id === fieldId ? { ...f, x: newX, y: newY } : f
      );
      return {
        ...prev,
        fields: updatedFields,
        width: autoResizeWidth(updatedFields),
      };
    });
    setFieldError(null);
  };

  const handleFieldsMove = (moves: { fieldId: number; newX: number; newY: number }[]) => {
    setMessage((prev) => {
      const moveMap = new Map(moves.map(m => [m.fieldId, m]));
      const updatedFields = prev.fields.map((f) => {
        const move = moveMap.get(f.id);
        return move ? { ...f, x: move.newX, y: move.newY } : f;
      });
      return {
        ...prev,
        fields: updatedFields,
        width: autoResizeWidth(updatedFields),
      };
    });
    setFieldError(null);
  };

  const handleFieldError = (fieldId: number, error: string | null) => {
    setFieldError(error);
  };

  return (
    <div className="flex-1 p-2 md:p-4 flex flex-col h-full min-h-0 md:overflow-hidden">
      <SubPageHeader title={`Edit: ${messageName}`} onHome={onCancel} />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-muted-foreground">Loading message...</span>
        </div>
      ) : (
        <>
          {/* Scrollable content (everything above the sticky action bar) */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y pb-[calc(12rem+env(safe-area-inset-bottom))] scroll-pb-[calc(12rem+env(safe-area-inset-bottom))] md:pb-0 md:scroll-pb-0">
            {/* Error message */}
            {fieldError && (
              <div className="mb-2 p-2 md:p-3 bg-destructive/10 border border-destructive rounded-lg text-destructive text-xs md:text-sm flex items-center gap-2">
                <span className="font-medium">⚠️ Error:</span>
                <span>{fieldError}</span>
              </div>
            )}

            {/* Message Canvas - component handles its own horizontal scrolling */}
            <div
              ref={canvasScrollerRef}
              className={`mb-2 md:mb-4 -mx-2 px-2 md:mx-0 md:px-0 pb-2 touch-pan-y overflow-x-auto scrollbar-thin`}
            >
              <MessageCanvas
                templateHeight={message.height}
                templateValue={message.templateValue}
                width={message.width}
                fields={message.fields}
                onCanvasClick={handleCanvasClick}
                onFieldMove={handleFieldMove}
                onFieldsMove={handleFieldsMove}
                onFieldDataChange={(fieldId, newData) => {
                  setMessage((prev) => ({
                    ...prev,
                    fields: prev.fields.map((f) =>
                      f.id === fieldId ? { ...f, data: newData } : f
                    ),
                  }));
                }}
                onFieldError={handleFieldError}
                selectedFieldId={selectedFieldId}
                selectedFieldIds={selectedFieldIds}
                onSelectionChange={setSelectedFieldIds}
                multilineTemplate={currentMultilineTemplate ? {
                  lines: currentMultilineTemplate.lines,
                  dotsPerLine: currentMultilineTemplate.dotsPerLine,
                } : null}
                onScrollLockChange={setIsCanvasScrollLocked}
              />
              <p className="text-[10px] md:text-xs text-muted-foreground mt-1">Double-click to edit • Click+drag empty space to select multiple fields</p>
            </div>

            {/* Field Settings Panel - Per-field settings like manual page 49-50 */}
            {selectedField && (
              <FieldSettingsPanel
                fontSize={selectedField.fontSize}
                bold={selectedField.bold ?? 0}
                gap={selectedField.gap ?? 1}
                rotation={selectedField.rotation ?? 'Normal'}
                autoNumerals={selectedField.autoNumerals ?? 0}
                templateLabel={getCurrentTemplateValue().startsWith('multi-') 
                  ? MULTILINE_TEMPLATES.find(t => t.value === getCurrentTemplateValue())?.label || getCurrentTemplateValue()
                  : `${message.height}`
                }
                onFontSizeChange={(delta) => {
                  const fonts = getAllowedFonts();
                  if (fonts.length === 0) return;
                  // Determine which fields to update: multi-selected or just the active one
                  const targetIds = selectedFieldIds.size > 0 ? selectedFieldIds : new Set([selectedFieldId!]);
                  setMessage((prev) => ({
                    ...prev,
                    fields: prev.fields.map((f) => {
                      if (!targetIds.has(f.id)) return f;
                      const currentIdx = fonts.findIndex(fs => fs.value === f.fontSize);
                      let newFont;
                      if (currentIdx === -1) {
                        newFont = fonts[fonts.length - 1];
                      } else {
                        const newIdx = Math.max(0, Math.min(fonts.length - 1, currentIdx + delta));
                        newFont = fonts[newIdx];
                      }
                      const isBarcode = f.type === 'barcode';
                      const is2DCode = isBarcode && f.data && /^\[(QR|QRCODE|DATAMATRIX|DM|DATA MATRIX|DOTCODE)/i.test(f.data);
                      const newHeight = is2DCode ? f.height : isBarcode ? message.height : newFont.height;
                      const blockedRows = 32 - message.height;
                      const newY = currentMultilineTemplate
                        ? f.y
                        : Math.max(blockedRows, 32 - newHeight);
                      return { ...f, fontSize: newFont.value, height: newHeight, y: newY };
                    }),
                  }));
                }}
                onBoldChange={(v) => handleUpdateFieldSetting('bold', v)}
                onGapChange={(v) => handleUpdateFieldSetting('gap', v)}
                onRotationChange={(v) => handleUpdateFieldSetting('rotation', v)}
                onAutoNumeralsChange={(v) => handleUpdateFieldSetting('autoNumerals', v)}
                onTemplateChange={handleTemplateNavigate}
                disabled={!selectedFieldId}
                allowedFonts={getAllowedFonts()}
                currentFontIndex={getAllowedFonts().findIndex(f => f.value === selectedField.fontSize)}
                fieldType={selectedField.type}
              />
            )}

          </div>

          {/* Sticky action bar (always reachable on mobile) */}
          <div className="shrink-0 -mx-2 px-2 md:mx-0 md:px-0 pt-2 pb-[env(safe-area-inset-bottom)] bg-background border-t border-border">
            <div className="overflow-x-auto touch-pan-x pb-2 scrollbar-thin">
              {/* Field navigation row */}
              <div className="flex gap-2 justify-center mb-2 min-w-max">
                <button
                  onClick={handlePrevField}
                  disabled={message.fields.length <= 1}
                  className="industrial-button text-white px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-50"
                  title="Previous Field"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="text-xs">Prev</span>
                </button>
                <button
                  onClick={handleNextField}
                  disabled={message.fields.length <= 1}
                  className="industrial-button text-white px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-50"
                  title="Next Field"
                >
                  <span className="text-xs">Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCopyField}
                  disabled={!selectedFieldId}
                  className="industrial-button text-white px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-50"
                  title="Copy Field"
                >
                  <Copy className="w-4 h-4" />
                  <span className="text-xs">Copy</span>
                </button>
              </div>

              {/* Main action buttons */}
              <div className="flex gap-2 md:gap-3 justify-center min-w-max">
                <button
                  onClick={() => setNewFieldDialogOpen(true)}
                  className="industrial-button text-white px-3 md:px-6 py-2 md:py-3 rounded-lg flex flex-col items-center min-w-[60px] md:min-w-[80px]"
                >
                  <FilePlus className="w-4 h-4 md:w-6 md:h-6 mb-0.5" />
                  <span className="text-[9px] md:text-xs font-medium">New</span>
                </button>

                <button
                  onClick={handleDeleteField}
                  disabled={!selectedFieldId || message.fields.length <= 1}
                  className="industrial-button-danger text-white px-3 md:px-6 py-2 md:py-3 rounded-lg flex flex-col items-center min-w-[60px] md:min-w-[80px] disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4 md:w-6 md:h-6 mb-0.5" />
                  <span className="text-[9px] md:text-xs font-medium">Delete</span>
                </button>

                <button
                  onClick={handleAlignFields}
                  disabled={message.fields.length < 2}
                  className="industrial-button text-white px-3 md:px-6 py-2 md:py-3 rounded-lg flex flex-col items-center min-w-[60px] md:min-w-[80px] disabled:opacity-50"
                  title="Auto-align overlapping fields (^AL)"
                >
                  <AlignHorizontalDistributeCenter className="w-4 h-4 md:w-6 md:h-6 mb-0.5" />
                  <span className="text-[9px] md:text-xs font-medium">Align</span>
                </button>

                <button
                  onClick={() => setSettingsDialogOpen(true)}
                  className="industrial-button text-white px-3 md:px-6 py-2 md:py-3 rounded-lg flex flex-col items-center min-w-[60px] md:min-w-[80px]"
                >
                  <Settings className="w-4 h-4 md:w-6 md:h-6 mb-0.5" />
                  <span className="text-[9px] md:text-xs font-medium">Settings</span>
                </button>

                <button
                  onClick={() => setAdvancedSettingsDialogOpen(true)}
                  className="industrial-button text-white px-3 md:px-6 py-2 md:py-3 rounded-lg flex flex-col items-center min-w-[60px] md:min-w-[80px]"
                >
                  <SlidersHorizontal className="w-4 h-4 md:w-6 md:h-6 mb-0.5" />
                  <span className="text-[9px] md:text-xs font-medium">Advanced</span>
                </button>

                <button
                  onClick={() => setDataLinkDialogOpen(true)}
                  className="industrial-button text-white px-3 md:px-6 py-2 md:py-3 rounded-lg flex flex-col items-center min-w-[60px] md:min-w-[80px]"
                >
                  <Database className="w-4 h-4 md:w-6 md:h-6 mb-0.5" />
                  <span className="text-[9px] md:text-xs font-medium">Data</span>
                </button>

                <button
                  onClick={async () => {
                    const result = await onSave(message, false);
                    if (result && result.fields.length > 0) {
                      // Check if printer adjusted any positions
                      const positionsChanged = result.fields.some((rf, i) => {
                        const ef = message.fields[i];
                        return ef && (rf.y !== ef.y || rf.x !== ef.x);
                      });
                      setMessage(prev => ({
                        ...prev,
                        fields: result.fields,
                        templateValue: result.templateValue ?? prev.templateValue,
                        height: result.height ?? prev.height,
                      }));
                      if (positionsChanged) {
                        toast.info('Field positions adjusted by printer firmware');
                      } else {
                        toast.success('Message saved');
                      }
                    } else {
                      toast.success('Message saved');
                    }
                  }}
                  className="industrial-button-success text-white px-3 md:px-6 py-2 md:py-3 rounded-lg flex flex-col items-center min-w-[60px] md:min-w-[80px]"
                >
                  <Save className="w-4 h-4 md:w-6 md:h-6 mb-0.5" />
                  <span className="text-[9px] md:text-xs font-medium">Save</span>
                </button>

                <button
                  onClick={() => {
                    setSaveAsName(message.name + '_copy');
                    setSaveAsDialogOpen(true);
                  }}
                  className="industrial-button text-white px-3 md:px-6 py-2 md:py-3 rounded-lg flex flex-col items-center min-w-[60px] md:min-w-[80px]"
                >
                  <SaveAll className="w-4 h-4 md:w-6 md:h-6 mb-0.5" />
                  <span className="text-[9px] md:text-xs font-medium">Save As</span>
                </button>

                <button
                  onClick={onCancel}
                  className="industrial-button-gray text-white px-3 md:px-6 py-2 md:py-3 rounded-lg flex flex-col items-center min-w-[60px] md:min-w-[80px]"
                >
                  <X className="w-4 h-4 md:w-6 md:h-6 mb-0.5" />
                  <span className="text-[9px] md:text-xs font-medium">Cancel</span>
                </button>
              </div>
            </div>
          </div>


          {/* New Field Dialog */}
          <NewFieldDialog
            open={newFieldDialogOpen}
            onOpenChange={setNewFieldDialogOpen}
            onSelectFieldType={handleAddField}
            onOpenAutoCode={() => setAutoCodeDialogOpen(true)}
            onOpenBarcode={() => setBarcodeDialogOpen(true)}
            
            onOpenUserDefine={() => setUserDefineDialogOpen(true)}
            onOpenGraphic={() => setGraphicDialogOpen(true)}
          />

          {/* AutoCode Field Dialog */}
          <AutoCodeFieldDialog
            open={autoCodeDialogOpen}
            onOpenChange={setAutoCodeDialogOpen}
            onBack={() => setNewFieldDialogOpen(true)}
            onSelectType={handleAddField}
            onOpenTimeCodes={() => setTimeCodesDialogOpen(true)}
            onOpenDateCodes={() => setDateBuilderOpen(true)}
            onOpenCounter={() => setCounterDialogOpen(true)}
          />

          {/* Time Codes Dialog */}
          <TimeCodesDialog
            open={timeCodesDialogOpen}
            onOpenChange={setTimeCodesDialogOpen}
            onBack={() => setAutoCodeDialogOpen(true)}
            onAddField={handleAddField}
          />

          {/* Date Codes Dialog (legacy — kept for individual code access) */}
          <DateCodesDialog
            open={dateCodesDialogOpen}
            onOpenChange={setDateCodesDialogOpen}
            onBack={() => setAutoCodeDialogOpen(true)}
            onAddField={handleAddField}
          />

          {/* Date/Time Code Builder (new streamlined flow) */}
          <DateCodeBuilder
            open={dateBuilderOpen}
            onOpenChange={setDateBuilderOpen}
            onBack={() => setAutoCodeDialogOpen(true)}
            onAddFields={handleAddDateCodeBuilderFields}
            allowedFonts={getAllowedFonts().map(f => ({ value: f.value, label: f.label, height: f.height }))}
            defaultFont={getAllowedFonts()[getAllowedFonts().length - 1]?.value}
          />

          {/* Counter Dialog */}
          <CounterDialog
            open={counterDialogOpen}
            onOpenChange={setCounterDialogOpen}
            onBack={() => setAutoCodeDialogOpen(true)}
            onAddField={handleAddField}
          />

          {/* Barcode Field Dialog */}
          <BarcodeFieldDialog
            open={barcodeDialogOpen}
            onOpenChange={setBarcodeDialogOpen}
            onBack={() => setNewFieldDialogOpen(true)}
            onAddBarcode={handleAddBarcode}
          />


          {/* User Define Dialog */}
          <UserDefineDialog
            open={userDefineDialogOpen}
            onOpenChange={setUserDefineDialogOpen}
            onBack={() => setNewFieldDialogOpen(true)}
            onAddField={handleAddUserDefine}
          />

          {/* User Define Entry Prompt (shown when fetched message has user define fields) */}
          <UserDefineEntryDialog
            open={userDefineEntryOpen}
            onOpenChange={setUserDefineEntryOpen}
            prompts={userDefinePrompts}
            onConfirm={(entries) => {
              setMessage((prev) => {
                const updatedFields = prev.fields.map(f => {
                  if (entries[f.id] !== undefined) {
                    return { ...f, data: entries[f.id] };
                  }
                  return f;
                });
                return { ...prev, fields: updatedFields, width: autoResizeWidth(updatedFields) };
              });
              toast.success('User define data entered');
            }}
          />

          {/* Graphic Field Dialog */}
          <GraphicFieldDialog
            open={graphicDialogOpen}
            onOpenChange={setGraphicDialogOpen}
            onBack={() => setNewFieldDialogOpen(true)}
            onAddGraphic={handleAddGraphic}
          />

          {/* Message Settings Dialog */}
          <MessageSettingsDialog
            open={settingsDialogOpen}
            onOpenChange={setSettingsDialogOpen}
            settings={message.settings || defaultMessageSettings}
            onUpdate={(newSettings) => {
              setMessage((prev) => ({
                ...prev,
                settings: { ...(prev.settings || defaultMessageSettings), ...newSettings },
              }));
            }}
          />

          {/* Advanced Settings Dialog */}
          <AdvancedSettingsDialog
            open={advancedSettingsDialogOpen}
            onOpenChange={setAdvancedSettingsDialogOpen}
            settings={message.advancedSettings || defaultAdvancedSettings}
            onUpdate={(newSettings) => {
              setMessage((prev) => ({
                ...prev,
                advancedSettings: { ...(prev.advancedSettings || defaultAdvancedSettings), ...newSettings },
              }));
            }}
          />

          <Dialog open={saveAsDialogOpen} onOpenChange={setSaveAsDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Save As New Message</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="saveAsName">Message Name</Label>
                <Input
                  id="saveAsName"
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(sanitizeMessageName(e.target.value))}
                  placeholder="Enter message name"
                  maxLength={20}
                  className="mt-2"
                  autoFocus
                />
                {saveAsName && !validateMessageName(saveAsName).valid && (
                  <p className="text-sm text-destructive mt-1">{validateMessageName(saveAsName).error}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveAsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (validateMessageName(saveAsName).valid) {
                      const result = await onSave({ ...message, name: saveAsName.trim().toUpperCase() }, true);
                      setSaveAsDialogOpen(false);
                      if (result && result.fields.length > 0) {
                        setMessage(prev => ({
                          ...prev,
                          fields: result.fields,
                          templateValue: result.templateValue ?? prev.templateValue,
                          height: result.height ?? prev.height,
                        }));
                      }
                    }
                  }}
                  disabled={!validateMessageName(saveAsName).valid}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Data Link Dialog */}
          <DataLinkDialog
            open={dataLinkDialogOpen}
            onOpenChange={setDataLinkDialogOpen}
            messageName={messageName}
            fieldCount={message.fields.length}
            printerId={connectedPrinterId ?? null}
            isConnected={isConnected}
            onLink={(fieldValues) => {
              // Update field data with values from the first data row
              // Preserve barcode encoding prefix (e.g. [QR], [CODE128|HR]) for barcode fields
              setMessage((prev) => {
                const updatedFields = prev.fields.map((f, idx) => {
                  const fieldNum = idx + 1;
                  if (fieldValues[fieldNum] == null) return f;

                  const newValue = fieldValues[fieldNum];
                  if (f.type === 'barcode') {
                    // Extract existing encoding prefix like [QR] or [CODE128|HR]
                    const prefixMatch = f.data.match(/^(\[[^\]]+\])\s*/);
                    const prefix = prefixMatch ? prefixMatch[1] : '[QR]';
                    return { ...f, data: `${prefix} ${newValue}` };
                  }
                  return { ...f, data: newValue };
                });
                return {
                  ...prev,
                  fields: updatedFields,
                  width: autoResizeWidth(updatedFields),
                };
              });
            }}
          />
        </>
      )}
    </div>
  );
}
