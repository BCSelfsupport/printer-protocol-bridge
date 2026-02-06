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
  /** Selected field ID */
  selectedFieldId?: number | null;
  /** Multi-line template info (if applicable) */
  multilineTemplate?: MultilineTemplate | null;
}

const TOTAL_ROWS = 32;
const DOT_SIZE = 8; // pixels per dot

export function MessageCanvas({
  templateHeight = 16,
  width = 200,
  fields = [],
  onCanvasClick,
  selectedFieldId,
  multilineTemplate,
}: MessageCanvasProps) {
  const [scrollX, setScrollX] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(640); // Default width, will be updated
  
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
      const fontInfo = getFontInfo(field.fontSize);
      
      // Calculate field dimensions based on font
      const fieldX = (field.x - scrollX) * DOT_SIZE;
      const fieldY = field.y * DOT_SIZE;
      const textWidth = field.data.length * (fontInfo.charWidth + 1) * DOT_SIZE;
      const fieldH = fontInfo.height * DOT_SIZE;
      
      // Skip if field is outside visible area
      if (fieldX + textWidth < 0 || fieldX > canvas.width) return;
      
      // Draw selection highlight
      if (isSelected) {
        ctx.fillStyle = 'rgba(255, 193, 7, 0.3)';
        ctx.fillRect(fieldX, fieldY, textWidth, fieldH);
        ctx.strokeStyle = '#ffc107';
        ctx.lineWidth = 2;
        ctx.strokeRect(fieldX, fieldY, textWidth, fieldH);
      }
      
      // Draw the field text using the font system
      ctx.fillStyle = '#1a1a1a';
      renderText(ctx, field.data, fieldX, fieldY, field.fontSize, DOT_SIZE);
    });
    
  }, [templateHeight, width, fields, scrollX, blockedRows, selectedFieldId, canvasWidth, visibleCols, multilineTemplate]);
  
  const handleScroll = (direction: 'left' | 'right') => {
    const step = 10;
    if (direction === 'left') {
      setScrollX(Math.max(0, scrollX - step));
    } else {
      setScrollX(Math.min(width - visibleCols, scrollX + step));
    }
  };
  
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onCanvasClick) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.floor((e.clientX - rect.left) / DOT_SIZE) + scrollX;
    const y = Math.floor((e.clientY - rect.top) / DOT_SIZE);
    onCanvasClick(x, y);
  };

  return (
    <div className="flex flex-col w-full">
      {/* Canvas area */}
      <div ref={containerRef} className="border-2 border-muted rounded-t-lg overflow-hidden w-full">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={TOTAL_ROWS * DOT_SIZE}
          onClick={handleCanvasClick}
          className="cursor-crosshair w-full"
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
        
        {/* Scroll track */}
        <div className="flex-1 h-3 bg-sky-300 rounded relative">
          <div 
            className="absolute h-full bg-sky-600 rounded"
            style={{
              left: `${(scrollX / Math.max(1, width - visibleCols)) * 100}%`,
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
