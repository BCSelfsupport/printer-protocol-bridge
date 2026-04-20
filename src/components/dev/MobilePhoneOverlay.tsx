import { useState, useRef, useEffect, useCallback } from 'react';
import { X, GripHorizontal, RotateCw, RefreshCw, Maximize2, Minimize2, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * MobilePhoneOverlay
 * A draggable, resizable iPhone-style frame containing an iframe of the app.
 * Used for live demos / training videos so a presenter can show the desktop
 * console and the mobile companion view simultaneously on one screen.
 *
 * Toggle via:  window.dispatchEvent(new CustomEvent('cs:toggle-phone-overlay'))
 */

const STORAGE_KEY = 'cs-phone-overlay-state-v1';

type Orientation = 'portrait' | 'landscape';
type Device = 'iphone' | 'pixel';

interface PersistedState {
  visible: boolean;
  x: number;
  y: number;
  scale: number;
  orientation: Orientation;
  device: Device;
  url: string;
}

const DEFAULTS: PersistedState = {
  visible: false,
  x: 40,
  y: 80,
  scale: 0.85,
  orientation: 'portrait',
  device: 'iphone',
  url: '/',
};

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function saveState(s: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

// iPhone 14 Pro logical resolution: 393 x 852 (CSS px)
// Pixel 7: 412 x 915
const DEVICE_DIMS = {
  iphone: { w: 393, h: 852, label: 'iPhone' },
  pixel:  { w: 412, h: 915, label: 'Pixel' },
};

export function MobilePhoneOverlay() {
  const [state, setState] = useState<PersistedState>(() => loadState());
  const [iframeKey, setIframeKey] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Persist state changes (debounced via microtask)
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Listen for global toggle events
  useEffect(() => {
    const onToggle = () => setState((s) => ({ ...s, visible: !s.visible }));
    window.addEventListener('cs:toggle-phone-overlay', onToggle);
    return () => window.removeEventListener('cs:toggle-phone-overlay', onToggle);
  }, []);

  // Drag handlers
  const onDragStart = useCallback((e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: state.x,
      origY: state.y,
    };
  }, [state.x, state.y]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setState((s) => ({
      ...s,
      x: Math.max(0, Math.min(window.innerWidth - 100, dragRef.current!.origX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 100, dragRef.current!.origY + dy)),
    }));
  }, []);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  if (!state.visible) return null;

  const dims = DEVICE_DIMS[state.device];
  const isLandscape = state.orientation === 'landscape';
  const frameW = isLandscape ? dims.h : dims.w;
  const frameH = isLandscape ? dims.w : dims.h;

  // Bezel padding (px in unscaled space)
  const bezel = 14;
  const outerW = frameW + bezel * 2;
  const outerH = frameH + bezel * 2 + 40; // +40 for the top control bar

  return (
    <div
      className="fixed z-[9999] select-none pointer-events-auto"
      style={{
        left: state.x,
        top: state.y,
        width: outerW * state.scale,
        height: outerH * state.scale,
        transform: 'translateZ(0)',
        filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.5))',
      }}
    >
      {/* Top control bar (draggable handle) */}
      <div
        className="h-10 bg-zinc-900 border border-zinc-700 rounded-t-2xl flex items-center justify-between px-3"
        style={{
          width: outerW * state.scale,
          height: 40 * state.scale,
        }}
      >
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="flex items-center gap-1.5 flex-1 h-full cursor-move"
          style={{ transform: `scale(${state.scale})`, transformOrigin: 'left center' }}
        >
          <GripHorizontal className="w-4 h-4 text-zinc-400" />
          <span className="text-[11px] font-medium text-zinc-300">{dims.label} · {Math.round(state.scale * 100)}%</span>
        </div>
        <div className="flex items-center gap-0.5" style={{ transform: `scale(${state.scale})`, transformOrigin: 'right center' }}>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
            onClick={() => setState((s) => ({ ...s, scale: Math.max(0.4, s.scale - 0.1) }))}
            title="Smaller"
          >
            <Minimize2 className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
            onClick={() => setState((s) => ({ ...s, scale: Math.min(1.2, s.scale + 0.1) }))}
            title="Bigger"
          >
            <Maximize2 className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
            onClick={() => setState((s) => ({ ...s, orientation: s.orientation === 'portrait' ? 'landscape' : 'portrait' }))}
            title="Rotate"
          >
            <RotateCw className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
            onClick={() => setIframeKey((k) => k + 1)}
            title="Reload"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 hover:bg-red-900 text-zinc-400 hover:text-red-200"
            onClick={() => setState((s) => ({ ...s, visible: false }))}
            title="Close"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Phone body — scaled wrapper */}
      <div
        style={{
          width: outerW,
          height: outerH - 40,
          transform: `scale(${state.scale})`,
          transformOrigin: 'top left',
        }}
        className="relative"
      >
        <div
          className={cn(
            'relative bg-zinc-950 border-[10px] border-zinc-800 shadow-2xl overflow-hidden',
            state.device === 'iphone' ? 'rounded-[44px]' : 'rounded-[36px]',
          )}
          style={{ width: outerW, height: outerH - 40 }}
        >
          {/* Notch (iPhone only) */}
          {state.device === 'iphone' && !isLandscape && (
            <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-full z-10 flex items-center justify-end pr-3">
              <div className="w-2 h-2 rounded-full bg-zinc-800" />
            </div>
          )}

          {/* Iframe */}
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={state.url}
            title="Mobile preview"
            className="absolute inset-0 w-full h-full bg-background"
            style={{
              border: 'none',
              borderRadius: state.device === 'iphone' ? 32 : 24,
            }}
            // Allow camera/microphone for the /scan demo
            allow="camera; microphone; clipboard-read; clipboard-write"
          />

          {/* Home indicator */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-28 h-1 bg-zinc-700 rounded-full z-10" />
        </div>

        {/* URL bar */}
        <div className="absolute -bottom-9 left-0 right-0 flex items-center gap-1.5 px-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
            onClick={() => iframeRef.current?.contentWindow?.history.back()}
            title="Back"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
            onClick={() => { setState((s) => ({ ...s, url: '/' })); setIframeKey((k) => k + 1); }}
            title="Home"
          >
            <Home className="w-3.5 h-3.5" />
          </Button>
          <input
            value={state.url}
            onChange={(e) => setState((s) => ({ ...s, url: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setIframeKey((k) => k + 1);
            }}
            className="flex-1 h-7 px-2 text-[11px] font-mono bg-zinc-900 text-zinc-200 border border-zinc-700 rounded focus:outline-none focus:border-emerald-500"
            placeholder="/"
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
            onClick={() => { setState((s) => ({ ...s, url: '/scan' })); setIframeKey((k) => k + 1); }}
            title="Quick: /scan"
          >
            scan
          </Button>
        </div>
      </div>
    </div>
  );
}
