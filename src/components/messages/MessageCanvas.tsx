import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { renderText, getFontInfo, PRINTER_FONTS } from '@/lib/dotMatrixFonts';

interface CanvasField {
  id: number;
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
  /** Selected field ID */
  selectedFieldId?: number | null;
  /** Multi-line template info (if applicable) */
  multilineTemplate?: MultilineTemplate | null;
  /** Callback for field errors */
  onFieldError?: (fieldId: number, error: string | null) => void;
}

const TOTAL_ROWS = 32;
const DOT_SIZE = 8; // pixels per dot

export function MessageCanvas({
  templateHeight = 16,
  width = 200,
  fields = [],
  onCanvasClick,
  onFieldMove,
  selectedFieldId,
  multilineTemplate,
  onFieldError,
}: MessageCanvasProps) {
  const [scrollX, setScrollX] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTrackRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(640);
  
  // Drag state for fields
  const [isDragging, setIsDragging] = useState(false);
  const [dragFieldId, setDragFieldId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  
  // Scrollbar drag state
  const [isScrollDragging, setIsScrollDragging] = useState(false);
  
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
  
  // Render the dot matrix grid
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const totalHeight = TOTAL_ROWS * DOT_SIZE;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid background - cream/beige color like the reference
    ctx.fillStyle = '#f5e6c8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid lines
    ctx.strokeStyle = '#d4c4a8';
    ctx.lineWidth = 0.5;
    
    // Vertical lines - draw across full canvas width
    for (let x = 0; x <= visibleCols; x++) {
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
      for (let x = 0; x <= visibleCols; x++) {
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
    
    // Draw multi-line template dividers (red dotted lines between lines)
    if (multilineTemplate && multilineTemplate.lines > 1) {
      const { lines, dotsPerLine } = multilineTemplate;
      const startY = blockedRows;
      
      ctx.strokeStyle = 'rgba(220, 53, 69, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]); // Dotted line
      
      // Draw horizontal divider lines between each text line
      for (let line = 1; line < lines; line++) {
        const lineY = (startY + line * dotsPerLine) * DOT_SIZE;
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(canvas.width, lineY);
        ctx.stroke();
      }
      
      ctx.setLineDash([]); // Reset to solid line
    }
    
    // Draw each field with its font size
    fields.forEach((field) => {
      const isSelected = field.id === selectedFieldId;
      const isBeingDragged = isDragging && field.id === dragFieldId;
      const fontInfo = getFontInfo(field.fontSize);
      
      // Use drag position if being dragged, otherwise use field position
      const displayX = isBeingDragged ? dragPosition.x : field.x;
      const displayY = isBeingDragged ? dragPosition.y : field.y;
      
      // Calculate field dimensions based on font
      const fieldX = (displayX - scrollX) * DOT_SIZE;
      const fieldY = displayY * DOT_SIZE;
      const textWidth = field.data.length * (fontInfo.charWidth + 1) * DOT_SIZE;
      const fieldH = fontInfo.height * DOT_SIZE;
      
      // Skip if field is outside visible area
      if (fieldX + textWidth < 0 || fieldX > canvas.width) return;
      
      // Draw drag preview with semi-transparency
      if (isBeingDragged) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = 'rgba(100, 149, 237, 0.3)'; // Cornflower blue
        ctx.fillRect(fieldX, fieldY, textWidth, fieldH);
        ctx.strokeStyle = '#6495ED';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(fieldX, fieldY, textWidth, fieldH);
        ctx.setLineDash([]);
      }
      // Draw selection highlight
      else if (isSelected) {
        ctx.fillStyle = 'rgba(255, 193, 7, 0.3)';
        ctx.fillRect(fieldX, fieldY, textWidth, fieldH);
        ctx.strokeStyle = '#ffc107';
        ctx.lineWidth = 2;
        ctx.strokeRect(fieldX, fieldY, textWidth, fieldH);
      }
      
      // Draw the field text using the font system
      ctx.fillStyle = '#1a1a1a';
      renderText(ctx, field.data, fieldX, fieldY, field.fontSize, DOT_SIZE);
      ctx.globalAlpha = 1.0; // Reset alpha
    });
    
  }, [templateHeight, width, fields, scrollX, blockedRows, selectedFieldId, canvasWidth, visibleCols, multilineTemplate, isDragging, dragFieldId, dragPosition]);
  
  const handleScroll = (direction: 'left' | 'right') => {
    const step = 10;
    if (direction === 'left') {
      setScrollX(Math.max(0, scrollX - step));
    } else {
      setScrollX(Math.min(width - visibleCols, scrollX + step));
    }
  };
  
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
      const fieldWidth = field.data.length * (fontInfo.charWidth + 1);
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
    const startY = blockedRows;
    
    for (let i = 0; i < lines; i++) {
      const lineY = startY + i * dotsPerLine;
      if (y >= lineY && y < lineY + dotsPerLine) {
        return { lineIndex: i, lineY, lineHeight: dotsPerLine };
      }
    }
    return null;
  };
  
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
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

  // Scrollbar drag handlers
  const maxScroll = Math.max(0, width - visibleCols);
  
  const handleScrollbarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsScrollDragging(true);
  };

  const handleScrollTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollTrackRef.current || isScrollDragging) return;
    
    const rect = scrollTrackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const trackWidth = rect.width;
    const thumbWidth = (visibleCols / width) * trackWidth;
    
    // Calculate new scroll position centered on click
    const clickRatio = (clickX - thumbWidth / 2) / (trackWidth - thumbWidth);
    const newScrollX = Math.round(Math.max(0, Math.min(maxScroll, clickRatio * maxScroll)));
    setScrollX(newScrollX);
  };

  useEffect(() => {
    if (!isScrollDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!scrollTrackRef.current) return;
      
      const rect = scrollTrackRef.current.getBoundingClientRect();
      const trackWidth = rect.width;
      const thumbWidth = (visibleCols / width) * trackWidth;
      
      const mouseX = e.clientX - rect.left;
      const scrollableWidth = trackWidth - thumbWidth;
      const scrollRatio = (mouseX - thumbWidth / 2) / scrollableWidth;
      
      const newScrollX = Math.round(Math.max(0, Math.min(maxScroll, scrollRatio * maxScroll)));
      setScrollX(newScrollX);
    };

    const handleMouseUp = () => {
      setIsScrollDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrollDragging, maxScroll, visibleCols, width]);

  return (
    <div className="flex flex-col w-full">
      {/* Canvas area */}
      <div ref={containerRef} className="border-2 border-muted rounded-t-lg overflow-hidden w-full">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={TOTAL_ROWS * DOT_SIZE}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          className={`w-full ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
        />
      </div>
      
      {/* Scroll bar */}
      <div className="flex items-center bg-gradient-to-b from-sky-400 to-sky-500 rounded-b-lg p-1 gap-2">
        <div className="flex items-center bg-sky-300 rounded px-2 py-1">
          <span className="text-sm font-mono text-sky-800 min-w-[30px]">{scrollX}</span>
          <button
            onClick={() => handleScroll('left')}
            disabled={scrollX <= 0}
            className="p-0.5 hover:bg-sky-200 rounded disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4 text-sky-700" />
          </button>
        </div>
        
        {/* Scroll track - clickable */}
        <div 
          ref={scrollTrackRef}
          onClick={handleScrollTrackClick}
          className="flex-1 h-5 bg-sky-300 rounded relative cursor-pointer"
        >
          {/* Scroll thumb - draggable */}
          <div 
            onMouseDown={handleScrollbarMouseDown}
            className={`absolute h-full bg-sky-600 rounded cursor-grab active:cursor-grabbing hover:bg-sky-700 transition-colors ${isScrollDragging ? 'bg-sky-700' : ''}`}
            style={{
              left: `${maxScroll > 0 ? (scrollX / maxScroll) * (100 - (visibleCols / width) * 100) : 0}%`,
              width: `${Math.min(100, (visibleCols / width) * 100)}%`,
            }}
          />
        </div>
        
        <button
          onClick={() => handleScroll('right')}
          disabled={scrollX >= width - visibleCols}
          className="p-1 bg-sky-300 hover:bg-sky-200 rounded disabled:opacity-50"
        >
          <ChevronRight className="w-4 h-4 text-sky-700" />
        </button>
      </div>
    </div>
  );
}
