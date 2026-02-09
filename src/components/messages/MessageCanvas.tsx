import { useState, useRef, useEffect, useCallback, ChangeEvent } from 'react';
import { renderText, getFontInfo, PRINTER_FONTS } from '@/lib/dotMatrixFonts';
import { parseBarcodeLabelData, renderBarcodeToCanvas } from '@/lib/barcodeRenderer';

interface CanvasField {
  id: number;
  type?: 'text' | 'date' | 'time' | 'counter' | 'logo' | 'userdefine' | 'block' | 'barcode';
  data: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: string;
}

interface MultilineTemplate {
  lines: number;
  dotsPerLine: number;
}

interface MessageCanvasProps {
  /** Total height is always 32 dots */
  templateHeight: number; // 7, 9, 11, 16, 24, or 32
  /** Width in dots (scrollable) */
  width?: number;
  /** The fields to render on the canvas */
  fields?: CanvasField[];
  /** Callback when canvas is clicked (for field selection) */
  onCanvasClick?: (x: number, y: number) => void;
  /** Callback when a field is moved */
  onFieldMove?: (fieldId: number, newX: number, newY: number) => void;
  /** Callback when field text is changed */
  onFieldDataChange?: (fieldId: number, newData: string) => void;
  /** Selected field ID */
  selectedFieldId?: number | null;
  /** Multi-line template info (if applicable) */
  multilineTemplate?: MultilineTemplate | null;
  /** Callback for field errors */
  onFieldError?: (fieldId: number, error: string | null) => void;
  /** Let parent temporarily disable its horizontal scroller while dragging */
  onScrollLockChange?: (locked: boolean) => void;
}

const TOTAL_ROWS = 32;
const DOT_SIZE = 8; // pixels per dot

export function MessageCanvas({
  templateHeight = 16,
  width = 200,
  fields = [],
  onCanvasClick,
  onFieldMove,
  onFieldDataChange,
  selectedFieldId,
  multilineTemplate,
  onFieldError,
  onScrollLockChange,
}: MessageCanvasProps) {
  const [scrollX, setScrollX] = useState(0); // derived from scroller scrollLeft (in dots)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null); // Hidden input for mobile keyboard
  const [canvasWidth, setCanvasWidth] = useState(640);
  
  // Cache for rendered barcode images
  const barcodeImagesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  
  // Drag state for fields
  const [isDragging, setIsDragging] = useState(false);
  const [dragFieldId, setDragFieldId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  
  // Horizontal scroll container (native swipe-to-scroll on mobile)
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollLeftDotsRef = useRef(0);

  // Touch/long-press state for mobile drag
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isLongPressActive, setIsLongPressActive] = useState(false);
  const [isLongPressPending, setIsLongPressPending] = useState(false); // Waiting for long press
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const LONG_PRESS_DURATION = 400; // ms to hold before drag activates
  const TOUCH_MOVE_THRESHOLD = 10; // pixels - if moved more than this, cancel long press and allow swipe
  
  // Inline editing state - cursor-based editing on canvas
  const [isEditing, setIsEditing] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [cursorPosition, setCursorPosition] = useState(0); // Character position in text
  const [cursorVisible, setCursorVisible] = useState(true); // For blinking effect
  const [editingText, setEditingText] = useState(''); // Current text being edited (for hidden input sync)

  // Inform parent when we need to lock its horizontal scroll (mobile drag)
  const scrollLock = isLongPressPending || (isLongPressActive && isDragging);
  useEffect(() => {
    onScrollLockChange?.(scrollLock);
  }, [scrollLock, onScrollLockChange]);

  // While long-press dragging, prevent the page from scrolling under the finger
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchMove = (e: TouchEvent) => {
      if (scrollLock) e.preventDefault();
    };

    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => canvas.removeEventListener('touchmove', onTouchMove);
  }, [scrollLock]);
  
  // Calculate blocked rows (from top)
  const blockedRows = TOTAL_ROWS - templateHeight;
  const visibleCols = Math.floor(canvasWidth / DOT_SIZE);
  
  // Update canvas width when container resizes
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setCanvasWidth(containerRef.current.clientWidth);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Blinking cursor effect
  useEffect(() => {
    if (!isEditing) {
      setCursorVisible(true);
      return;
    }
    
    const interval = setInterval(() => {
      setCursorVisible(prev => !prev);
    }, 500); // Blink every 500ms
    
    return () => clearInterval(interval);
  }, [isEditing]);

  // Load barcode images asynchronously and trigger re-render
  const [barcodeImages, setBarcodeImages] = useState<Map<string, HTMLCanvasElement>>(new Map());
  
  useEffect(() => {
    // Find all barcode fields and load their images
    const barcodeFields = fields.filter(f => f.type === 'barcode');
    if (barcodeFields.length === 0) return;
    
    let cancelled = false;
    
    const loadBarcodes = async () => {
      const newImages = new Map(barcodeImages);
      let hasChanges = false;
      
      for (const field of barcodeFields) {
        const parsed = parseBarcodeLabelData(field.data);
        if (!parsed) continue;
        
        const cacheKey = `${field.id}:${parsed.encoding}:${parsed.data}:${templateHeight}:${parsed.humanReadable}`;
        if (newImages.has(cacheKey)) continue;
        
        try {
          const barcodeCanvas = await renderBarcodeToCanvas(
            parsed.encoding,
            parsed.data,
            templateHeight,
            parsed.humanReadable
          );
          if (barcodeCanvas && !cancelled) {
            newImages.set(cacheKey, barcodeCanvas);
            hasChanges = true;
          }
        } catch (err) {
          console.warn('Failed to render barcode:', err);
        }
      }
      
      if (hasChanges && !cancelled) {
        setBarcodeImages(newImages);
      }
    };
    
    loadBarcodes();
    
    return () => {
      cancelled = true;
    };
  }, [fields, templateHeight]);
  
  // Render the dot matrix grid
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const totalHeight = TOTAL_ROWS * DOT_SIZE;
    const totalCols = Math.floor(canvas.width / DOT_SIZE);
    const viewLeftPx = scrollX * DOT_SIZE;
    const viewRightPx = viewLeftPx + canvasWidth;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid background - cream/beige color like the reference
    ctx.fillStyle = '#f5e6c8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    ctx.strokeStyle = '#d4c4a8';
    ctx.lineWidth = 0.5;

    // Vertical lines - draw across full canvas width
    for (let x = 0; x <= totalCols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * DOT_SIZE, 0);
      ctx.lineTo(x * DOT_SIZE, totalHeight);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y <= TOTAL_ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * DOT_SIZE);
      ctx.lineTo(canvas.width, y * DOT_SIZE);
      ctx.stroke();
    }

    // Draw blocked (red) area at top - full width
    if (blockedRows > 0) {
      ctx.fillStyle = 'rgba(220, 90, 100, 0.9)'; // Industrial red
      ctx.fillRect(0, 0, canvas.width, blockedRows * DOT_SIZE);

      // Redraw grid lines over the red area
      ctx.strokeStyle = 'rgba(180, 60, 70, 0.5)';
      for (let x = 0; x <= totalCols; x++) {
        ctx.beginPath();
        ctx.moveTo(x * DOT_SIZE, 0);
        ctx.lineTo(x * DOT_SIZE, blockedRows * DOT_SIZE);
        ctx.stroke();
      }
      for (let y = 0; y <= blockedRows; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * DOT_SIZE);
        ctx.lineTo(canvas.width, y * DOT_SIZE);
        ctx.stroke();
      }
    }

    // Draw multi-line template spacing as filled red rows (1 dot between each line)
    if (multilineTemplate && multilineTemplate.lines > 1) {
      const { lines, dotsPerLine } = multilineTemplate;
      const gap = 1; // Always 1 dot spacing between lines

      // Draw filled red rows for inter-line spacing
      let currentY = blockedRows;
      for (let line = 0; line < lines; line++) {
        currentY += dotsPerLine;
        if (line < lines - 1) {
          const gapY = currentY * DOT_SIZE;
          const gapHeight = gap * DOT_SIZE;
          
          // Fill with same red as blocked area
          ctx.fillStyle = 'rgba(220, 90, 100, 0.9)';
          ctx.fillRect(0, gapY, canvas.width, gapHeight);
          
          // Redraw grid lines over the red gap area
          ctx.strokeStyle = 'rgba(180, 60, 70, 0.5)';
          ctx.lineWidth = 0.5;
          for (let x = 0; x <= totalCols; x++) {
            ctx.beginPath();
            ctx.moveTo(x * DOT_SIZE, gapY);
            ctx.lineTo(x * DOT_SIZE, gapY + gapHeight);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.moveTo(0, gapY);
          ctx.lineTo(canvas.width, gapY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, gapY + gapHeight);
          ctx.lineTo(canvas.width, gapY + gapHeight);
          ctx.stroke();
          
          currentY += gap;
        }
      }
    }

    // Draw each field with its font size
    fields.forEach((field) => {
      const isSelected = field.id === selectedFieldId;
      const isBeingDragged = isDragging && field.id === dragFieldId;
      const isBeingEdited = isEditing && field.id === editingFieldId;
      const fontInfo = getFontInfo(field.fontSize);
      const isBarcode = field.type === 'barcode';

      // Use drag position if being dragged, otherwise use field position
      const displayX = isBeingDragged ? dragPosition.x : field.x;
      const displayY = isBeingDragged ? dragPosition.y : field.y;

      // Canvas is physically wide and is clipped by the scroll container, so don't offset drawing.
      const fieldX = displayX * DOT_SIZE;
      const fieldY = displayY * DOT_SIZE;

      // Calculate field dimensions
      let fieldW: number;
      let fieldH: number;
      
      if (isBarcode) {
        // For barcodes, use the stored width or estimate from data
        fieldW = field.width * DOT_SIZE;
        fieldH = templateHeight * DOT_SIZE;
      } else {
        // Ensure minimum visible width for empty fields (3 chars minimum)
        const minChars = 3;
        const textLength = Math.max(field.data.length, minChars);
        fieldW = textLength * (fontInfo.charWidth + 1) * DOT_SIZE;
        fieldH = fontInfo.height * DOT_SIZE;
      }

      // Skip if field is outside visible viewport (optimization)
      if (fieldX + fieldW < viewLeftPx || fieldX > viewRightPx) return;

      // Draw drag preview with semi-transparency
      if (isBeingDragged) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = 'rgba(100, 149, 237, 0.3)'; // Cornflower blue
        ctx.fillRect(fieldX, fieldY, fieldW, fieldH);
        ctx.strokeStyle = '#6495ED';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(fieldX, fieldY, fieldW, fieldH);
        ctx.setLineDash([]);
      }
      // Draw selection highlight (including when editing) - always show for empty fields
      else if (isSelected || isBeingEdited || field.data.length === 0) {
        const highlightColor =
          isBeingEdited
            ? 'rgba(255, 220, 100, 0.4)'
            : field.data.length === 0
              ? 'rgba(200, 200, 200, 0.5)'
              : isBarcode
                ? 'rgba(100, 200, 255, 0.3)' // Light blue for barcodes
                : 'rgba(255, 193, 7, 0.3)';
        const borderColor =
          isBeingEdited ? '#ff6600' : field.data.length === 0 ? '#999999' : isBarcode ? '#0088cc' : '#ffc107';
        ctx.fillStyle = highlightColor;
        ctx.fillRect(fieldX, fieldY, fieldW, fieldH);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(fieldX, fieldY, fieldW, fieldH);
      }

      // Draw the field content
      if (isBarcode) {
        // Try to render actual barcode
        const parsed = parseBarcodeLabelData(field.data);
        if (parsed) {
          const cacheKey = `${field.id}:${parsed.encoding}:${parsed.data}:${templateHeight}:${parsed.humanReadable}`;
          const barcodeCanvas = barcodeImages.get(cacheKey);
          
          if (barcodeCanvas) {
            // Draw the barcode image, scaled to fit the field height
            const scale = fieldH / barcodeCanvas.height;
            const drawWidth = Math.min(barcodeCanvas.width * scale, fieldW);
            ctx.drawImage(
              barcodeCanvas,
              0, 0, barcodeCanvas.width, barcodeCanvas.height,
              fieldX, fieldY, drawWidth, fieldH
            );
          } else {
            // Placeholder while loading - draw barcode icon pattern
            ctx.fillStyle = '#1a1a1a';
            const barWidth = 2;
            const numBars = Math.floor(fieldW / (barWidth * 2));
            for (let i = 0; i < numBars; i++) {
              const barX = fieldX + i * barWidth * 2;
              const barH = fieldH * (0.6 + Math.random() * 0.3); // Varying heights
              ctx.fillRect(barX, fieldY + (fieldH - barH) / 2, barWidth, barH);
            }
            // Show encoding label
            ctx.font = '10px sans-serif';
            ctx.fillStyle = '#666';
            ctx.fillText(parsed.encoding.toUpperCase(), fieldX + 2, fieldY + 10);
          }
        } else {
          // Fallback: render as text if parsing fails
          ctx.fillStyle = '#1a1a1a';
          renderText(ctx, field.data, fieldX, fieldY, field.fontSize, DOT_SIZE);
        }
      } else {
        // Regular text field
        ctx.fillStyle = '#1a1a1a';
        renderText(ctx, field.data, fieldX, fieldY, field.fontSize, DOT_SIZE);
      }
      
      ctx.globalAlpha = 1.0; // Reset alpha

      // Draw blinking cursor if editing this field (not for barcodes)
      if (isBeingEdited && cursorVisible && !isBarcode) {
        const charWidth = (fontInfo.charWidth + 1) * DOT_SIZE;
        const cursorX = fieldX + cursorPosition * charWidth;

        // Draw red vertical line cursor
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cursorX, fieldY);
        ctx.lineTo(cursorX, fieldY + fieldH);
        ctx.stroke();
      }
    });
  }, [templateHeight, width, fields, scrollX, blockedRows, selectedFieldId, canvasWidth, multilineTemplate, isDragging, dragFieldId, dragPosition, isEditing, editingFieldId, cursorPosition, cursorVisible, barcodeImages]);
  
  const getMousePosition = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = Math.floor((e.clientX - rect.left) / DOT_SIZE) + scrollX;
    const y = Math.floor((e.clientY - rect.top) / DOT_SIZE);
    return { x, y };
  };

  const findFieldAtPosition = (x: number, y: number) => {
    // Find which field is at this position (check in reverse order for z-index)
    for (let i = fields.length - 1; i >= 0; i--) {
      const field = fields[i];
      const fontInfo = getFontInfo(field.fontSize);
      // Ensure minimum clickable width of 3 characters for empty fields
      const textLength = Math.max(field.data.length, 3);
      const fieldWidth = textLength * (fontInfo.charWidth + 1);
      const fieldHeight = fontInfo.height;
      
      if (x >= field.x && x < field.x + fieldWidth &&
          y >= field.y && y < field.y + fieldHeight) {
        return field;
      }
    }
    return null;
  };

  const getLineForY = (y: number): { lineIndex: number; lineY: number; lineHeight: number } | null => {
    if (!multilineTemplate) return null;
    
    const { lines, dotsPerLine } = multilineTemplate;
    const gap = 1; // Always 1 dot spacing between lines
    
    let currentY = blockedRows;
    for (let i = 0; i < lines; i++) {
      const lineY = currentY;
      if (y >= lineY && y < lineY + dotsPerLine) {
        return { lineIndex: i, lineY, lineHeight: dotsPerLine };
      }
      currentY += dotsPerLine;
      if (i < lines - 1) {
        currentY += gap;
      }
    }
    return null;
  };
  
  const startEditing = useCallback((fieldId: number, clickX?: number) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    
    setIsEditing(true);
    setEditingFieldId(fieldId);
    setEditingText(field.data);
    
    // Set cursor position based on click location or end of text
    let cursorPos: number;
    if (clickX !== undefined) {
      const fontInfo = getFontInfo(field.fontSize);
      const charWidth = fontInfo.charWidth + 1;
      const relativeX = clickX - field.x;
      const charPos = Math.round(relativeX / charWidth);
      cursorPos = Math.max(0, Math.min(charPos, field.data.length));
    } else {
      cursorPos = field.data.length; // Default to end
    }
    setCursorPosition(cursorPos);
    
    // Focus the hidden input to trigger mobile keyboard and set its cursor
    setTimeout(() => {
      if (hiddenInputRef.current) {
        hiddenInputRef.current.focus();
        hiddenInputRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    }, 50);
  }, [fields]);

  const stopEditing = useCallback(() => {
    setIsEditing(false);
    setEditingFieldId(null);
    setCursorPosition(0);
    setEditingText('');
    hiddenInputRef.current?.blur();
  }, []);

  // Keyboard handler for canvas-based editing
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!isEditing || editingFieldId === null) return;
    
    const field = fields.find(f => f.id === editingFieldId);
    if (!field || !onFieldDataChange) return;
    
    const text = field.data;
    
    if (e.key === 'Escape' || e.key === 'Enter') {
      stopEditing();
      e.preventDefault();
    } else if (e.key === 'Backspace') {
      if (cursorPosition > 0) {
        const newText = text.slice(0, cursorPosition - 1) + text.slice(cursorPosition);
        onFieldDataChange(editingFieldId, newText);
        setCursorPosition(cursorPosition - 1);
      }
      e.preventDefault();
    } else if (e.key === 'Delete') {
      if (cursorPosition < text.length) {
        const newText = text.slice(0, cursorPosition) + text.slice(cursorPosition + 1);
        onFieldDataChange(editingFieldId, newText);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      setCursorPosition(Math.max(0, cursorPosition - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      setCursorPosition(Math.min(text.length, cursorPosition + 1));
      e.preventDefault();
    } else if (e.key === 'Home') {
      setCursorPosition(0);
      e.preventDefault();
    } else if (e.key === 'End') {
      setCursorPosition(text.length);
      e.preventDefault();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // Regular character input - convert to uppercase for printer
      const char = e.key.toUpperCase();
      const newText = text.slice(0, cursorPosition) + char + text.slice(cursorPosition);
      onFieldDataChange(editingFieldId, newText);
      setCursorPosition(cursorPosition + 1);
      e.preventDefault();
    }
  }, [isEditing, editingFieldId, fields, onFieldDataChange, cursorPosition, stopEditing]);

  // Handle hidden input changes (for mobile keyboard support)
  const handleHiddenInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (!isEditing || editingFieldId === null || !onFieldDataChange) return;
    
    const field = fields.find(f => f.id === editingFieldId);
    if (!field) return;
    
    const newText = e.target.value.toUpperCase();
    const oldText = field.data;
    
    // Determine cursor position based on what changed
    // If text got shorter, it was a backspace/delete
    // If text got longer, it was an insertion
    let newCursorPos: number;
    
    if (newText.length < oldText.length) {
      // Deletion occurred - find where the deletion happened
      // The cursor in the hidden input tells us where we are after the delete
      const inputCursor = e.target.selectionStart ?? newText.length;
      newCursorPos = inputCursor;
    } else if (newText.length > oldText.length) {
      // Insertion occurred
      const inputCursor = e.target.selectionStart ?? newText.length;
      newCursorPos = inputCursor;
    } else {
      // Length same (replacement) - keep cursor at input position
      newCursorPos = e.target.selectionStart ?? newText.length;
    }
    
    setEditingText(newText);
    onFieldDataChange(editingFieldId, newText);
    setCursorPosition(newCursorPos);
  }, [isEditing, editingFieldId, onFieldDataChange, fields]);

  // Sync editingText when field data changes externally
  useEffect(() => {
    if (isEditing && editingFieldId !== null) {
      const field = fields.find(f => f.id === editingFieldId);
      if (field && field.data !== editingText) {
        setEditingText(field.data);
      }
    }
  }, [fields, isEditing, editingFieldId, editingText]);

  // Keep hidden input cursor position in sync with visual cursor
  useEffect(() => {
    if (isEditing && hiddenInputRef.current) {
      const input = hiddenInputRef.current;
      // Only update if different to avoid infinite loops
      if (input.selectionStart !== cursorPosition || input.selectionEnd !== cursorPosition) {
        input.setSelectionRange(cursorPosition, cursorPosition);
      }
    }
  }, [isEditing, cursorPosition]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // If currently editing, stop editing on click elsewhere
    if (isEditing) {
      const pos = getMousePosition(e);
      const field = findFieldAtPosition(pos.x, pos.y);
      
      // If clicking on the same field, just move cursor
      if (field && field.id === editingFieldId) {
        const fontInfo = getFontInfo(field.fontSize);
        const charWidth = fontInfo.charWidth + 1;
        const relativeX = pos.x - field.x;
        const charPos = Math.round(relativeX / charWidth);
        const newCursorPos = Math.max(0, Math.min(charPos, field.data.length));
        setCursorPosition(newCursorPos);
        
        // Immediately sync the hidden input cursor
        if (hiddenInputRef.current) {
          hiddenInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
        e.preventDefault();
        return;
      }
      
      stopEditing();
    }
    
    const pos = getMousePosition(e);
    const field = findFieldAtPosition(pos.x, pos.y);
    
    if (field) {
      setIsDragging(true);
      setDragFieldId(field.id);
      setDragOffset({ x: pos.x - field.x, y: pos.y - field.y });
      setDragPosition({ x: field.x, y: field.y });
      onCanvasClick?.(pos.x, pos.y); // Also select the field
      e.preventDefault();
    } else {
      onCanvasClick?.(pos.x, pos.y);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePosition(e);
    const field = findFieldAtPosition(pos.x, pos.y);
    
    if (field) {
      startEditing(field.id, pos.x);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || dragFieldId === null) return;
    
    const draggedField = fields.find(f => f.id === dragFieldId);
    if (!draggedField) return;
    
    const fontInfo = getFontInfo(draggedField.fontSize);
    const pos = getMousePosition(e);
    let newX = pos.x - dragOffset.x;
    let newY = pos.y - dragOffset.y;
    
    // Clamp to valid area - prevent dropping off top (blocked rows) or bottom (past row 32)
    newX = Math.max(0, newX);
    newY = Math.max(blockedRows, newY);
    newY = Math.min(TOTAL_ROWS - fontInfo.height, newY); // Prevent going past bottom
    
    // Snap to line if multiline template
    if (multilineTemplate) {
      const lineInfo = getLineForY(newY);
      if (lineInfo) {
        newY = lineInfo.lineY;
      }
    }
    
    setDragPosition({ x: newX, y: newY });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || dragFieldId === null) return;
    
    const draggedField = fields.find(f => f.id === dragFieldId);
    if (draggedField && onFieldMove) {
      const fontInfo = getFontInfo(draggedField.fontSize);
      
      // Check if font fits in the target line
      if (multilineTemplate) {
        const lineInfo = getLineForY(dragPosition.y);
        if (lineInfo && fontInfo.height > lineInfo.lineHeight) {
          onFieldError?.(dragFieldId, `Font "${fontInfo.height}px" is too tall for this line (max ${lineInfo.lineHeight}px)`);
          // Reset to original position
          setIsDragging(false);
          setDragFieldId(null);
          return;
        } else {
          onFieldError?.(dragFieldId, null); // Clear error
        }
      }
      
      onFieldMove(dragFieldId, dragPosition.x, dragPosition.y);
    }
    
    setIsDragging(false);
    setDragFieldId(null);
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
      setDragFieldId(null);
    }
  };

  // Touch event helpers
  const getTouchPosition = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !e.touches[0]) return { x: 0, y: 0 };
    const x = Math.floor((e.touches[0].clientX - rect.left) / DOT_SIZE) + scrollX;
    const y = Math.floor((e.touches[0].clientY - rect.top) / DOT_SIZE);
    return { x, y };
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setIsLongPressPending(false);
    setIsLongPressActive(false);
  };

  // Touch handlers for long-press drag on mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    if (!touch) return;

    const pos = getTouchPosition(e);
    const field = findFieldAtPosition(pos.x, pos.y);

    // Store touch start position for movement threshold check
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    if (field) {
      // Mark that we're waiting for long press (to prevent scroll)
      setIsLongPressPending(true);

      // Start long press timer
      longPressTimerRef.current = setTimeout(() => {
        // Long press activated - start dragging
        setIsLongPressPending(false);
        setIsLongPressActive(true);
        setIsDragging(true);
        setDragFieldId(field.id);
        setDragOffset({ x: pos.x - field.x, y: pos.y - field.y });
        setDragPosition({ x: field.x, y: field.y });
        onCanvasClick?.(pos.x, pos.y); // Select the field

        // Provide haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }, LONG_PRESS_DURATION);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    if (!touch) return;

    // If we're in active drag mode, handle the drag
    if (isDragging && dragFieldId !== null && isLongPressActive) {
      e.preventDefault(); // Prevent scrolling while dragging

      const draggedField = fields.find(f => f.id === dragFieldId);
      if (!draggedField) return;

      const fontInfo = getFontInfo(draggedField.fontSize);
      const pos = getTouchPosition(e);
      let newX = pos.x - dragOffset.x;
      let newY = pos.y - dragOffset.y;

      // Clamp to valid area
      newX = Math.max(0, newX);
      newY = Math.max(blockedRows, newY);
      newY = Math.min(TOTAL_ROWS - fontInfo.height, newY);

      // Snap to line if multiline template
      if (multilineTemplate) {
        const lineInfo = getLineForY(newY);
        if (lineInfo) {
          newY = lineInfo.lineY;
        }
      }

      setDragPosition({ x: newX, y: newY });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    clearLongPressTimer();
    touchStartPosRef.current = null;

    if (isDragging && dragFieldId !== null && isLongPressActive) {
      // Complete the drag
      const draggedField = fields.find(f => f.id === dragFieldId);
      if (draggedField && onFieldMove) {
        const fontInfo = getFontInfo(draggedField.fontSize);

        // Check if font fits in the target line
        if (multilineTemplate) {
          const lineInfo = getLineForY(dragPosition.y);
          if (lineInfo && fontInfo.height > lineInfo.lineHeight) {
            onFieldError?.(dragFieldId, `Font "${fontInfo.height}px" is too tall for this line (max ${lineInfo.lineHeight}px)`);
          } else {
            onFieldError?.(dragFieldId, null);
            onFieldMove(dragFieldId, dragPosition.x, dragPosition.y);
          }
        } else {
          onFieldMove(dragFieldId, dragPosition.x, dragPosition.y);
        }
      }

      setIsDragging(false);
      setDragFieldId(null);
      setIsLongPressActive(false);
      e.preventDefault();
    }
  };

  const handleTouchCancel = () => {
    clearLongPressTimer();
    touchStartPosRef.current = null;
    setIsDragging(false);
    setDragFieldId(null);
    setIsLongPressActive(false);
  };

  // Sync scrollX (in dots) from the native horizontal scroller
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const dots = Math.round(el.scrollLeft / DOT_SIZE);
      scrollLeftDotsRef.current = dots;
      setScrollX(dots);
    };

    handleScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const canvasPixelWidth = Math.max(canvasWidth, width * DOT_SIZE);

  return (
    <div className="flex flex-col w-full">
      {/* Hidden input for mobile keyboard - positioned off-screen */}
      <input
        ref={hiddenInputRef}
        type="text"
        value={editingText}
        onChange={handleHiddenInputChange}
        onBlur={() => {
          // Delay stop editing slightly to allow for tap events
          setTimeout(() => {
            if (document.activeElement !== hiddenInputRef.current) {
              stopEditing();
            }
          }, 100);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            stopEditing();
            e.preventDefault();
          }
        }}
        className="absolute -top-[9999px] -left-[9999px] opacity-0 pointer-events-none"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-hidden="true"
      />

      {/* Canvas area - native horizontal swipe (same as the button bars) */}
      <div ref={containerRef} className="border-2 border-muted rounded-lg overflow-hidden w-full relative">
        <div ref={scrollerRef} className="overflow-x-auto overflow-y-hidden">
          <canvas
            ref={canvasRef}
            width={canvasPixelWidth}
            height={TOTAL_ROWS * DOT_SIZE}
            tabIndex={0}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={handleDoubleClick}
            onKeyDown={handleKeyDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            className={`${isDragging && isLongPressActive ? 'cursor-grabbing' : isEditing ? 'cursor-text' : 'cursor-crosshair'} block max-w-none outline-none`}
            style={{ touchAction: scrollLock ? 'none' : 'pan-x pan-y' }}
          />
        </div>

        {/* Scroll position indicator - subtle, shown when scrolled */}
        {scrollX > 0 && (
          <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-2 py-0.5 rounded pointer-events-none">
            {scrollX}
          </div>
        )}
      </div>
    </div>
  );
}
