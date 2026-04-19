import { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  src: string;
  alt: string;
  caption?: string;
}

/**
 * Manual screenshot with two zoom modes:
 *  - Hover over the inline image → magnifier loupe follows the cursor (2.5x)
 *  - Click the image → fullscreen lightbox with pan + scroll-to-zoom (1x–5x)
 */
export function ScreenshotZoom({ src, alt, caption }: Props) {
  const [hovering, setHovering] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [open, setOpen] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <>
      <figure className="rounded-xl border bg-card overflow-hidden shadow-sm group">
        <div
          className="relative cursor-zoom-in overflow-hidden"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onMouseMove={handleMove}
          onClick={() => setOpen(true)}
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className="w-full h-auto block select-none"
            draggable={false}
          />
          {/* Loupe */}
          {hovering && (
            <div
              className="pointer-events-none absolute w-44 h-44 rounded-full border-2 border-primary shadow-2xl ring-4 ring-background/60"
              style={{
                left: `calc(${pos.x}% - 88px)`,
                top: `calc(${pos.y}% - 88px)`,
                backgroundImage: `url(${src})`,
                backgroundRepeat: 'no-repeat',
                backgroundSize: `${(imgRef.current?.naturalWidth ?? 0) * 1.2}px auto`,
                backgroundPosition: `${pos.x}% ${pos.y}%`,
              }}
            />
          )}
          {/* Hint badge */}
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-background/85 backdrop-blur text-[10px] uppercase tracking-wider font-bold text-foreground/80 opacity-0 group-hover:opacity-100 transition-opacity">
            <Maximize2 className="w-3 h-3" />
            Click to zoom
          </div>
        </div>
        {caption && (
          <figcaption className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold border-t bg-card/50">
            {caption}
          </figcaption>
        )}
      </figure>

      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale(s => Math.min(5, s + 0.5));
      if (e.key === '-') setScale(s => Math.max(1, s - 0.5));
      if (e.key === '0') { setScale(1); setOffset({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.max(1, Math.min(5, s - e.deltaY * 0.003)));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (scale === 1) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };
  const stopDrag = () => setDragging(false);

  return (
    <div
      className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-md flex flex-col"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b bg-card/50"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-xs font-bold uppercase tracking-wider text-foreground truncate">{alt}</p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setScale(s => Math.max(1, s - 0.5))}
            disabled={scale <= 1}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs font-mono tabular-nums w-12 text-center text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setScale(s => Math.min(5, s + 0.5))}
            disabled={scale >= 5}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 ml-2" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div
        className={cn(
          'flex-1 overflow-hidden flex items-center justify-center',
          scale > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-out'
        )}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onClick={e => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-w-[95vw] max-h-[85vh] object-contain transition-transform select-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center',
          }}
        />
      </div>
      <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground text-center border-t bg-card/50">
        Scroll to zoom · Drag to pan · Esc to close · 0 to reset
      </div>
    </div>
  );
}
