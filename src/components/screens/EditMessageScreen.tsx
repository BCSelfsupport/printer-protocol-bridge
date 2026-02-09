import { useState, useEffect, useRef } from 'react';
import { Save, X, FilePlus, SaveAll, Trash2, Settings, AlignHorizontalDistributeCenter, ChevronLeft, ChevronRight, Copy, SlidersHorizontal } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageCanvas } from '@/components/messages/MessageCanvas';
import { loadTemplate, templateToMultilineConfig, type ParsedTemplate } from '@/lib/templateParser';
import { NewFieldDialog } from '@/components/messages/NewFieldDialog';
import { AutoCodeFieldDialog } from '@/components/messages/AutoCodeFieldDialog';
import { TimeCodesDialog } from '@/components/messages/TimeCodesDialog';
import { DateCodesDialog } from '@/components/messages/DateCodesDialog';
import { CounterDialog } from '@/components/messages/CounterDialog';
import { UserDefineDialog, UserDefineConfig } from '@/components/messages/UserDefineDialog';
import { BarcodeFieldDialog, BarcodeFieldConfig } from '@/components/messages/BarcodeFieldDialog';
import { BlockFieldDialog, BlockFieldConfig } from '@/components/messages/BlockFieldDialog';
import { GraphicFieldDialog, GraphicFieldConfig } from '@/components/messages/GraphicFieldDialog';
import { MessageSettingsDialog, MessageSettings, defaultMessageSettings } from '@/components/messages/MessageSettingsDialog';
import { AdvancedSettingsDialog, AdvancedSettings, defaultAdvancedSettings } from '@/components/messages/AdvancedSettingsDialog';
import { FieldSettingsPanel, FieldSettings, defaultFieldSettings } from '@/components/messages/FieldSettingsPanel';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';


export interface MessageField {
  id: number;
  type: 'text' | 'date' | 'time' | 'counter' | 'logo' | 'userdefine' | 'block' | 'barcode';
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
  { value: 'multi-5x5-2', label: '5L×5 v2', height: 29, lines: 5, dotsPerLine: 5, file: '5L5U-2.BIN' },
  { value: 'multi-4x7', label: '4L×7', height: 31, lines: 4, dotsPerLine: 7, file: '4L7U.BIN' },
  { value: 'multi-4x5', label: '4L×5', height: 23, lines: 4, dotsPerLine: 5, file: '4L5U.BIN' },
  { value: 'multi-4x5h', label: '4L×5 H', height: 23, lines: 4, dotsPerLine: 5, file: '4L5H.BIN' },
  { value: 'multi-4x5g', label: '4L×5 G', height: 23, lines: 4, dotsPerLine: 5, file: '4L5G.BIN' },
  { value: 'multi-4x5f', label: '4L×5 F', height: 23, lines: 4, dotsPerLine: 5, file: '4L5F.BIN' },
  { value: 'multi-3x9', label: '3L×9', height: 29, lines: 3, dotsPerLine: 9, file: '3L9U.BIN' },
  { value: 'multi-3x7', label: '3L×7', height: 23, lines: 3, dotsPerLine: 7, file: '3L7U.BIN' },
  { value: 'multi-2x12', label: '2L×12', height: 25, lines: 2, dotsPerLine: 12, file: '2L12U.BIN' },
  { value: 'multi-2x9', label: '2L×9', height: 19, lines: 2, dotsPerLine: 9, file: '2L9U.BIN' },
  { value: 'multi-2x7', label: '2L×7', height: 16, lines: 2, dotsPerLine: 7, file: '2L7U.BIN' },
  { value: 'multi-2x7-2', label: '2L×7 v2', height: 16, lines: 2, dotsPerLine: 7, file: '2L7U-2.BIN' },
  { value: 'multi-2x7s', label: '2L×7n', height: 16, lines: 2, dotsPerLine: 7, file: '2L7sU.BIN' },
  { value: 'multi-2x7s-2', label: '2L×7n v2', height: 16, lines: 2, dotsPerLine: 7, file: '2L7sU-2.BIN' },
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
  onSave: (message: MessageDetails, isNew?: boolean) => void;
  onCancel: () => void;
  onGetMessageDetails?: (name: string) => Promise<MessageDetails | null>;
}

export function EditMessageScreen({
  messageName,
  onSave,
  onCancel,
  onGetMessageDetails,
}: EditMessageScreenProps) {
  const [message, setMessage] = useState<MessageDetails>({
    name: messageName,
    height: 16,
    width: 200,
    fields: [
      { id: 1, type: 'text', data: messageName, x: 0, y: 16, width: 60, height: 16, fontSize: 'Standard16High', bold: 0, gap: 1, rotation: 'Normal', autoNumerals: 0 },
    ],
    templateValue: '16', // Default to 16 dots single template
    settings: defaultMessageSettings,
    advancedSettings: defaultAdvancedSettings,
  });
  const [loading, setLoading] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(1);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loadedTemplate, setLoadedTemplate] = useState<ParsedTemplate | null>(null);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [newFieldDialogOpen, setNewFieldDialogOpen] = useState(false);
  const [autoCodeDialogOpen, setAutoCodeDialogOpen] = useState(false);
  const [timeCodesDialogOpen, setTimeCodesDialogOpen] = useState(false);
  const [dateCodesDialogOpen, setDateCodesDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [advancedSettingsDialogOpen, setAdvancedSettingsDialogOpen] = useState(false);
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [counterDialogOpen, setCounterDialogOpen] = useState(false);
  const [userDefineDialogOpen, setUserDefineDialogOpen] = useState(false);
  const [graphicDialogOpen, setGraphicDialogOpen] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Mobile: lock the parent horizontal scroller while long-press dragging fields
  const [isCanvasScrollLocked, setIsCanvasScrollLocked] = useState(false);
  const canvasScrollerRef = useRef<HTMLDivElement>(null);

  // Load message details when component mounts (only once)
  useEffect(() => {
    if (onGetMessageDetails && !initialLoadDone) {
      setLoading(true);
      onGetMessageDetails(messageName)
        .then((details) => {
          if (details) {
            setMessage(details);
            if (details.fields.length > 0) {
              setSelectedFieldId(details.fields[0].id);
            }
          }
        })
        .finally(() => {
          setLoading(false);
          setInitialLoadDone(true);
        });
    }
  }, [messageName, onGetMessageDetails, initialLoadDone]);

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

  const selectedField = message.fields.find((f) => f.id === selectedFieldId);

  const handleFieldDataChange = (value: string) => {
    if (!selectedFieldId) return;
    setMessage((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.id === selectedFieldId ? { ...f, data: value } : f
      ),
    }));
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
        
        // If current font is too tall for the new template, find the largest font that fits
        let newFontSize = f.fontSize;
        let newFieldHeight = currentFontHeight;
        if (currentFontHeight > maxFontHeight) {
          const fittingFonts = FONT_SIZES.filter(fs => fs.height <= maxFontHeight);
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
        
        return {
          ...f,
          fontSize: newFontSize,
          height: newFieldHeight,
          y: newY,
        };
      }),
    }));
  };

  // Combined list of all templates for navigation
  const ALL_TEMPLATES = [
    ...SINGLE_TEMPLATES.map(t => ({ ...t, type: 'single' as const })),
    ...MULTILINE_TEMPLATES.map(t => ({ ...t, type: 'multi' as const })),
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
  
  // Get allowed font sizes based on current template
  const getAllowedFonts = () => {
    if (currentMultilineTemplate) {
      // For multiline templates, only allow fonts that match the dots per line
      return FONT_SIZES.filter(fs => fs.height <= currentMultilineTemplate.dotsPerLine);
    }
    // For single-height templates, allow all fonts up to the template height
    return FONT_SIZES.filter(fs => fs.height <= message.height);
  };

  // Helper to format time based on format string
  const formatTimeValue = (format: string): string => {
    const now = new Date();
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

  // Helper to format date based on format string
  const formatDateValue = (format: string, expiryDays: number = 0): string => {
    const now = new Date();
    // Add expiry days if specified
    if (expiryDays > 0) {
      now.setDate(now.getDate() + expiryDays);
    }
    
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const yearFull = now.getFullYear().toString();
    const yearShort = yearFull.slice(-2);
    
    // Parse the format - strip any expiry/rollover metadata
    const cleanFormat = format.split('|')[0];
    
    switch (cleanFormat) {
      case 'MMDDYY': return `${month}${day}${yearShort}`;
      case 'DDMMYY': return `${day}${month}${yearShort}`;
      case 'YYMMDD': return `${yearShort}${month}${day}`;
      case 'MM/DD/YY': return `${month}/${day}/${yearShort}`;
      case 'DD/MM/YY': return `${day}/${month}/${yearShort}`;
      case 'YY/MM/DD': return `${yearShort}/${month}/${day}`;
      case 'MM-DD-YY': return `${month}-${day}-${yearShort}`;
      case 'DD-MM-YY': return `${day}-${month}-${yearShort}`;
      case 'YY-MM-DD': return `${yearShort}-${month}-${day}`;
      case 'MM.DD.YY': return `${month}.${day}.${yearShort}`;
      case 'DD.MM.YY': return `${day}.${month}.${yearShort}`;
      default: return `${month}/${day}/${yearShort}`;
    }
  };

  // Helper to get specific date code value
  const getDateCodeValue = (codeType: string, expiryDays: number = 0): string => {
    const now = new Date();
    if (expiryDays > 0) {
      now.setDate(now.getDate() + expiryDays);
    }
    
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const dayOfYear = Math.floor((now.getTime() - new Date(year, 0, 0).getTime()) / 86400000);
    const weekNum = Math.ceil(dayOfYear / 7);
    const dayOfWeek = now.getDay() || 7; // 1-7, Sunday=7
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    
    switch (codeType) {
      // Year codes
      case 'yyyy': return year.toString();
      case 'yy': return year.toString().slice(-2);
      case 'y': return year.toString().slice(-1);
      case 'doy': return dayOfYear.toString().padStart(3, '0');
      case 'julian': return `${year.toString().slice(-2)}${dayOfYear.toString().padStart(3, '0')}`;
      case 'program_year': return year.toString().slice(-2);
      case 'program_doy': return dayOfYear.toString().padStart(3, '0');
      // Month codes
      case 'mm': return month.toString().padStart(2, '0');
      case 'alpha_month': return monthNames[month - 1];
      case 'dom': return day.toString().padStart(2, '0');
      case 'program_month': return month.toString().padStart(2, '0');
      case 'program_dom': return day.toString().padStart(2, '0');
      // Week codes
      case 'ww': return weekNum.toString().padStart(2, '0');
      case 'dow_num': return dayOfWeek.toString();
      case 'dow_alpha': return dayNames[now.getDay()];
      case 'program_week': return weekNum.toString().padStart(2, '0');
      case 'program_dow': return dayOfWeek.toString();
      default: return codeType.toUpperCase();
    }
  };

  const handleAddField = (fieldType: string, format?: string) => {
    const newId = Math.max(0, ...message.fields.map((f) => f.id)) + 1;
    
    // Determine field data based on type
    let fieldData = fieldType === 'text' ? '' : fieldType.toUpperCase();
    
    // Parse expiry days from format if present
    let expiryDays = 0;
    if (format?.includes('|expiry:')) {
      const match = format.match(/\|expiry:(\d+)/);
      if (match) expiryDays = parseInt(match[1]) || 0;
    }
    
    if (fieldType === 'time' && format) {
      fieldData = formatTimeValue(format);
    } else if (fieldType === 'program_hour') {
      fieldData = new Date().getHours().toString().padStart(2, '0');
    } else if (fieldType === 'program_minute') {
      fieldData = new Date().getMinutes().toString().padStart(2, '0');
    } else if (fieldType === 'program_second') {
      fieldData = new Date().getSeconds().toString().padStart(2, '0');
    } else if (fieldType.startsWith('date_')) {
      // Parse date field type: date_normal, date_expiry, date_normal_yyyy, etc.
      const parts = fieldType.split('_');
      const dateType = parts[1]; // normal, expiry, rollover, expiry_rollover
      const codeType = parts.slice(2).join('_'); // yyyy, mm, doy, etc. or empty
      
      if (codeType) {
        // Specific code type (year, month, week codes)
        fieldData = getDateCodeValue(codeType, expiryDays);
      } else if (format) {
        // Full date format
        fieldData = formatDateValue(format, expiryDays);
      }
    }
    
    const newField: MessageField = {
      id: newId,
      type: fieldType === 'time' || fieldType.startsWith('program_') ? 'time' : fieldType as MessageField['type'],
      data: fieldData,
      x: message.fields.length * 50,
      y: 32 - message.height,
      width: 50,
      height: Math.min(16, message.height),
      fontSize: 'Standard16High',
    };
    setMessage((prev) => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
    setSelectedFieldId(newId);
  };

  const handleAddBarcode = (config: BarcodeFieldConfig) => {
    const newId = Math.max(0, ...message.fields.map((f) => f.id)) + 1;
    
    // Format barcode data string with encoding info for display/protocol
    const barcodeLabel = `[${config.encoding.toUpperCase()}] ${config.data}`;
    
    const newField: MessageField = {
      id: newId,
      type: 'barcode',
      data: barcodeLabel,
      x: message.fields.length * 50,
      y: 32 - message.height,
      width: Math.max(60, config.data.length * 8), // Estimate width based on data length
      height: Math.min(message.height, 32),
      fontSize: 'Standard16High',
    };
    
    setMessage((prev) => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
    setSelectedFieldId(newId);
  };

  const handleAddBlock = (config: BlockFieldConfig) => {
    const newId = Math.max(0, ...message.fields.map((f) => f.id)) + 1;
    
    // Create block field representation
    const blockLabel = `[BLOCK L:${config.blockLength} G:${config.gap}]`;
    
    const newField: MessageField = {
      id: newId,
      type: 'block',
      data: blockLabel,
      x: message.fields.length * 50,
      y: 32 - message.height,
      width: config.blockLength + config.gap + 8, // Width based on block+gap
      height: Math.min(message.height, 32),
      fontSize: 'Standard16High',
    };
    
    setMessage((prev) => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
    setSelectedFieldId(newId);
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
    
    setMessage((prev) => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
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
    
    setMessage((prev) => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
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

  const handleCanvasClick = (x: number, y: number) => {
    // Find which field was clicked
    const clickedField = message.fields.find(
      (f) => x >= f.x && x < f.x + f.width && y >= f.y && y < f.y + f.height
    );
    if (clickedField) {
      setSelectedFieldId(clickedField.id);
      setFieldError(null); // Clear error on new selection
    }
  };

  const handleFieldMove = (fieldId: number, newX: number, newY: number) => {
    setMessage((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.id === fieldId ? { ...f, x: newX, y: newY } : f
      ),
    }));
    setFieldError(null);
  };

  const handleFieldError = (fieldId: number, error: string | null) => {
    setFieldError(error);
  };

  return (
    <div className="flex-1 p-2 md:p-4 flex flex-col h-full min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y md:overflow-hidden">
      <SubPageHeader title={`Edit: ${messageName}`} onHome={onCancel} />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-muted-foreground">Loading message...</span>
        </div>
      ) : (
        <>
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
            className={`mb-2 md:mb-4 -mx-2 px-2 md:mx-0 md:px-0 pb-2 touch-pan-y`}
          >
            <MessageCanvas
              templateHeight={message.height}
              width={message.width}
              fields={message.fields}
              onCanvasClick={handleCanvasClick}
              onFieldMove={handleFieldMove}
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
              multilineTemplate={currentMultilineTemplate ? {
                lines: currentMultilineTemplate.lines,
                dotsPerLine: currentMultilineTemplate.dotsPerLine,
              } : null}
              onScrollLockChange={setIsCanvasScrollLocked}
            />
            <p className="text-[10px] md:text-xs text-muted-foreground mt-1">Double-click a field to edit text inline</p>
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
                const currentIdx = fonts.findIndex(f => f.value === selectedField.fontSize);
                const newIdx = Math.max(0, Math.min(fonts.length - 1, currentIdx + delta));
                handleUpdateFieldSetting('fontSize', fonts[newIdx].value);
              }}
              onBoldChange={(v) => handleUpdateFieldSetting('bold', v)}
              onGapChange={(v) => handleUpdateFieldSetting('gap', v)}
              onRotationChange={(v) => handleUpdateFieldSetting('rotation', v)}
              onAutoNumeralsChange={(v) => handleUpdateFieldSetting('autoNumerals', v)}
              onTemplateChange={handleTemplateNavigate}
              disabled={!selectedFieldId}
              allowedFonts={getAllowedFonts()}
              currentFontIndex={getAllowedFonts().findIndex(f => f.value === selectedField.fontSize)}
            />
          )}

          {/* Message properties row */}
          <div className="bg-card rounded-lg p-2 md:p-3 mb-2 overflow-x-auto touch-pan-y">
            <div className="flex gap-2 md:gap-3 min-w-max">
              <div className="min-w-[120px]">
                <Label className="text-[10px] md:text-xs">Template</Label>
                <Select
                  value={getCurrentTemplateValue()}
                  onValueChange={handleTemplateChange}
                >
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent className="z-[100] max-h-[300px]">
                    <SelectItem value="header-single" disabled className="font-semibold text-muted-foreground text-xs">
                      Single Height
                    </SelectItem>
                    {SINGLE_TEMPLATES.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">
                        {t.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="header-multi" disabled className="font-semibold text-muted-foreground mt-2 text-xs">
                      Multi-Line
                    </SelectItem>
                    {MULTILINE_TEMPLATES.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[80px]">
                <Label className="text-[10px] md:text-xs">Width</Label>
                <Input
                  type="number"
                  value={message.width}
                  onChange={(e) =>
                    setMessage((prev) => ({
                      ...prev,
                      width: parseInt(e.target.value) || 135,
                    }))
                  }
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Navigation and Action buttons - scrollable on mobile */}
          <div className="overflow-x-auto touch-pan-y -mx-2 px-2 md:mx-0 md:px-0 pb-2 scrollbar-thin">
            {/* Field navigation row */}
            <div className="flex gap-2 justify-center mb-2">
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
                onClick={() => onSave(message, false)}
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

          {/* New Field Dialog */}
          <NewFieldDialog
            open={newFieldDialogOpen}
            onOpenChange={setNewFieldDialogOpen}
            onSelectFieldType={handleAddField}
            onOpenAutoCode={() => setAutoCodeDialogOpen(true)}
            onOpenBarcode={() => setBarcodeDialogOpen(true)}
            onOpenBlock={() => setBlockDialogOpen(true)}
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
            onOpenDateCodes={() => setDateCodesDialogOpen(true)}
            onOpenCounter={() => setCounterDialogOpen(true)}
          />

          {/* Time Codes Dialog */}
          <TimeCodesDialog
            open={timeCodesDialogOpen}
            onOpenChange={setTimeCodesDialogOpen}
            onBack={() => setAutoCodeDialogOpen(true)}
            onAddField={handleAddField}
          />

          {/* Date Codes Dialog */}
          <DateCodesDialog
            open={dateCodesDialogOpen}
            onOpenChange={setDateCodesDialogOpen}
            onBack={() => setAutoCodeDialogOpen(true)}
            onAddField={handleAddField}
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

          {/* Block Field Dialog */}
          <BlockFieldDialog
            open={blockDialogOpen}
            onOpenChange={setBlockDialogOpen}
            onSave={handleAddBlock}
            maxHeight={message.height}
          />

          {/* User Define Dialog */}
          <UserDefineDialog
            open={userDefineDialogOpen}
            onOpenChange={setUserDefineDialogOpen}
            onBack={() => setNewFieldDialogOpen(true)}
            onAddField={handleAddUserDefine}
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
                  onChange={(e) => setSaveAsName(e.target.value.toUpperCase())}
                  placeholder="Enter message name"
                  className="mt-2"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveAsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (saveAsName.trim()) {
                      onSave({ ...message, name: saveAsName.trim() }, true);
                      setSaveAsDialogOpen(false);
                    }
                  }}
                  disabled={!saveAsName.trim()}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
