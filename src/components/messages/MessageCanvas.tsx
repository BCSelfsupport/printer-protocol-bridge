import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MessageCanvasProps {
  /** Total height is always 32 dots */
  templateHeight: number; // 7, 9, 11, 16, 24, or 32
  /** Width in dots (scrollable) */
  width?: number;
  /** The message content to render (for now just text, later could be actual bitmap) */
  content?: string;
  /** Callback when canvas is clicked (for field selection) */
  onCanvasClick?: (x: number, y: number) => void;
  /** Selected field highlight bounds */
  selectedField?: { x: number; y: number; width: number; height: number } | null;
}

const TOTAL_ROWS = 32;
const DOT_SIZE = 8; // pixels per dot
const VISIBLE_COLS = 80; // visible columns before scrolling

export function MessageCanvas({
  templateHeight = 16,
  width = 200,
  content = '',
  onCanvasClick,
  selectedField,
}: MessageCanvasProps) {
  const [scrollX, setScrollX] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Calculate blocked rows (from top)
  const blockedRows = TOTAL_ROWS - templateHeight;
  
  // Render the dot matrix grid
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const visibleWidth = Math.min(VISIBLE_COLS, width) * DOT_SIZE;
    const totalHeight = TOTAL_ROWS * DOT_SIZE;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid background (light gray with grid lines)
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid lines
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    
    // Vertical lines
    for (let x = 0; x <= VISIBLE_COLS; x++) {
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
    
    // Draw blocked (red) area at top
    if (blockedRows > 0) {
      ctx.fillStyle = 'rgba(220, 53, 69, 0.85)'; // Industrial red
      ctx.fillRect(0, 0, canvas.width, blockedRows * DOT_SIZE);
    }
    
    // Draw simulated dot-matrix text content
    // This is a simplified representation - real implementation would use actual bitmap data
    if (content) {
      const startY = blockedRows;
      const charWidth = 6; // dots per character (including spacing)
      const charHeight = Math.min(templateHeight, 16);
      
      // Simple dot-matrix font simulation
      ctx.fillStyle = '#1a1a1a';
      
      for (let i = 0; i < content.length; i++) {
        const charX = (i * charWidth - scrollX) * DOT_SIZE;
        if (charX < -charWidth * DOT_SIZE || charX > canvas.width) continue;
        
        // Draw a simple representation of each character as dots
        drawDotMatrixChar(ctx, content[i], charX, startY * DOT_SIZE, DOT_SIZE, charHeight);
      }
    }
    
    // Draw selected field highlight
    if (selectedField) {
      ctx.strokeStyle = '#ffc107';
      ctx.fillStyle = 'rgba(255, 193, 7, 0.2)';
      ctx.lineWidth = 2;
      const fx = (selectedField.x - scrollX) * DOT_SIZE;
      const fy = selectedField.y * DOT_SIZE;
      const fw = selectedField.width * DOT_SIZE;
      const fh = selectedField.height * DOT_SIZE;
      ctx.fillRect(fx, fy, fw, fh);
      ctx.strokeRect(fx, fy, fw, fh);
    }
    
  }, [templateHeight, width, content, scrollX, blockedRows, selectedField]);
  
  const handleScroll = (direction: 'left' | 'right') => {
    const step = 10;
    if (direction === 'left') {
      setScrollX(Math.max(0, scrollX - step));
    } else {
      setScrollX(Math.min(width - VISIBLE_COLS, scrollX + step));
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
    <div className="flex flex-col">
      {/* Canvas area */}
      <div className="border-2 border-muted rounded-t-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={VISIBLE_COLS * DOT_SIZE}
          height={TOTAL_ROWS * DOT_SIZE}
          onClick={handleCanvasClick}
          className="cursor-crosshair"
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
              left: `${(scrollX / Math.max(1, width - VISIBLE_COLS)) * 100}%`,
              width: `${Math.min(100, (VISIBLE_COLS / width) * 100)}%`,
            }}
          />
        </div>
        
        <button
          onClick={() => handleScroll('right')}
          disabled={scrollX >= width - VISIBLE_COLS}
          className="p-1 bg-sky-300 hover:bg-sky-200 rounded disabled:opacity-50"
        >
          <ChevronRight className="w-4 h-4 text-sky-700" />
        </button>
      </div>
    </div>
  );
}

/**
 * Draw a simplified dot-matrix character
 * This is a basic representation - real implementation would use actual font bitmaps
 */
function drawDotMatrixChar(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  dotSize: number,
  height: number
) {
  // Simple 5x7 dot matrix patterns for letters/numbers
  const patterns: Record<string, number[][]> = {
    'A': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
    'B': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0]],
    'C': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,1],[0,1,1,1,0]],
    'D': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0]],
    'E': [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
    'O': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
    'S': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[0,1,1,1,0],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
    'T': [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
    '-': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
    '0': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,1,1],[1,0,1,0,1],[1,1,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
    '1': [[0,0,1,0,0],[0,1,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,1,1,0]],
    '2': [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,1,1,1,1]],
    '3': [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,1,1,0],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
    ' ': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
  };
  
  const pattern = patterns[char.toUpperCase()] || patterns[' '];
  if (!pattern) return;
  
  const scale = Math.max(1, Math.floor(height / 7));
  
  pattern.forEach((row, rowIdx) => {
    if (rowIdx * scale >= height) return;
    row.forEach((dot, colIdx) => {
      if (dot === 1) {
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = x + (colIdx * scale + sx) * (dotSize / scale) + 1;
            const py = y + (rowIdx * scale + sy) * (dotSize / scale) + 1;
            ctx.fillRect(px, py, dotSize / scale - 1, dotSize / scale - 1);
          }
        }
      }
    });
  });
}
