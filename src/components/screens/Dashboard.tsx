import { useEffect, useRef, useState } from 'react';
import { Key, HelpCircle, Printer as PrinterIcon, Droplets, Palette, Play, Square, Plus, Pencil } from 'lucide-react';
import { Wifi } from 'lucide-react';
import { PrinterStatus } from '@/types/printer';
import { renderText, getFontInfo } from '@/lib/dotMatrixFonts';
import { MessageDetails, MessageField } from '@/components/screens/EditMessageScreen';

interface DashboardProps {
  status: PrinterStatus | null;
  isConnected: boolean;
  onStart: () => void;
  onStop: () => void;
  onJetStop: () => void;
  onNewMessage: () => void;
  onEditMessage: () => void;
  onSignIn: () => void;
  onHelp: () => void;
  onCounters: () => void;
  onMount?: () => void;
  onUnmount?: () => void;
  // Countdown timer props
  countdownSeconds?: number | null; // null = no countdown, number = seconds remaining
  countdownType?: 'starting' | 'stopping' | null;
  // Sign-in state
  isSignedIn?: boolean;
  // Message content for preview
  messageContent?: MessageDetails;
}

export function Dashboard({
  status,
  isConnected,
  onStart,
  onStop,
  onJetStop,
  onNewMessage,
  onEditMessage,
  onSignIn,
  onHelp,
  onCounters,
  onMount,
  onUnmount,
  countdownSeconds,
  countdownType,
  isSignedIn = false,
  messageContent,
}: DashboardProps) {
  // Notify parent when this screen mounts/unmounts for polling control
  useEffect(() => {
    onMount?.();
    return () => onUnmount?.();
  }, [onMount, onUnmount]);

  // Derive HV state from status
  const isHvOn = status?.isRunning ?? false;
  
  // Format countdown time as M:SS
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Determine banner state
  const showCountdown = countdownSeconds !== null && countdownSeconds !== undefined && countdownSeconds > 0;
  const showReady = isHvOn && !showCountdown;
  
  return (
    <div className="flex-1 flex flex-col">
      {/* Countdown banner - shown during jet startup/shutdown */}
      {showCountdown && (
        <div className={`w-full py-3 px-6 flex items-center justify-center ${
          countdownType === 'starting' 
            ? 'bg-gradient-to-r from-red-600 via-red-500 to-red-400' 
            : 'bg-gradient-to-r from-orange-600 via-orange-500 to-orange-400'
        }`}>
          <span className="text-xl font-bold text-white tracking-wide drop-shadow-md font-mono">
            {countdownType === 'starting' ? 'Starting...' : 'Stopping...'} {formatCountdown(countdownSeconds)}
          </span>
        </div>
      )}
      
      {/* Ready banner - only shown when HV is on and no countdown */}
      {showReady && (
        <div className="w-full py-3 px-6 flex items-center justify-center bg-gradient-to-r from-green-600 via-green-500 to-green-400">
          <span className="text-xl font-bold text-white tracking-wide drop-shadow-md">
            Ready
          </span>
        </div>
      )}
      
      <div className="flex-1 p-2 md:p-4 flex flex-col gap-2 md:gap-4 overflow-hidden">
      {/* Top row buttons - horizontal scroll on mobile */}
      <div className="overflow-x-auto pb-2 -mx-2 px-2 md:mx-0 md:px-0 md:overflow-visible">
        <div className="flex gap-2 min-w-max md:min-w-0 md:flex-wrap">
          <button 
            onClick={onSignIn}
            className={`${isSignedIn ? 'industrial-button-success' : 'industrial-button-gray'} text-white px-3 md:px-4 py-2 md:py-3 rounded-lg flex flex-col items-center justify-center min-w-[70px] md:min-w-[100px] flex-shrink-0`}
          >
            <Key className="w-7 h-7 md:w-10 md:h-10 mb-1" />
            <span className="text-[10px] md:text-sm">{isSignedIn ? 'Sign Out' : 'Sign In'}</span>
          </button>

          <button 
            onClick={onHelp}
            className="industrial-button text-white px-3 md:px-4 py-2 md:py-3 rounded-lg flex flex-col items-center justify-center min-w-[70px] md:min-w-[100px] flex-shrink-0"
          >
            <HelpCircle className="w-7 h-7 md:w-10 md:h-10 mb-1" />
            <span className="text-[10px] md:text-sm">Help</span>
          </button>

          <button 
            onClick={isHvOn ? onStop : onStart}
            disabled={!isConnected}
            className={`${isHvOn ? 'industrial-button-success' : 'industrial-button-danger'} text-white px-3 md:px-4 py-2 md:py-3 rounded-lg flex flex-col items-center justify-center min-w-[70px] md:min-w-[100px] flex-shrink-0 disabled:opacity-50`}
          >
            <PrinterIcon className="w-7 h-7 md:w-10 md:h-10 mb-1" />
            <span className="text-[10px] md:text-sm">{isHvOn ? 'HV On' : 'HV Off'}</span>
          </button>

          {/* Makeup Level Indicator */}
          <div className={`w-[80px] md:w-[120px] h-[70px] md:h-[100px] rounded-lg flex items-center justify-between px-2 md:px-3 flex-shrink-0 ${
            status?.makeupLevel === 'EMPTY' ? 'bg-destructive' :
            status?.makeupLevel === 'LOW' ? 'bg-warning' :
            'industrial-button'
          }`}>
            <div className="flex flex-col items-center">
              <div className="relative">
                <Droplets className="w-5 h-5 md:w-8 md:h-8 text-white" />
                {(status?.makeupLevel === 'FULL' || status?.makeupLevel === 'GOOD') && (
                  <Wifi className="w-2 h-2 md:w-3 md:h-3 absolute -top-0.5 -right-0.5 text-white" />
                )}
              </div>
              <span className="text-[8px] md:text-xs text-white font-medium mt-1">Makeup</span>
            </div>
            <div className="flex flex-col-reverse gap-0.5 h-10 md:h-16 w-3 md:w-5 bg-black/20 rounded p-0.5">
              {[0, 1, 2, 3].map((seg) => {
                const level = status?.makeupLevel;
                const filledSegments = level === 'FULL' ? 4 : level === 'GOOD' ? 2 : level === 'LOW' ? 1 : 0;
                const isFilled = seg < filledSegments;
                return (
                  <div
                    key={seg}
                    className={`flex-1 rounded-sm transition-colors ${
                      isFilled ? 'bg-white' : 'bg-white/20'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Ink Level Indicator */}
          <div className={`w-[80px] md:w-[120px] h-[70px] md:h-[100px] rounded-lg flex items-center justify-between px-2 md:px-3 flex-shrink-0 ${
            status?.inkLevel === 'EMPTY' ? 'bg-destructive' :
            status?.inkLevel === 'LOW' ? 'bg-warning' :
            'industrial-button'
          }`}>
            <div className="flex flex-col items-center">
              <div className="relative">
                <Palette className="w-5 h-5 md:w-8 md:h-8 text-white" />
                {status?.inkLevel === 'FULL' && (
                  <span className="absolute -top-0.5 -right-0.5 text-white text-[10px] md:text-sm">✓</span>
                )}
              </div>
              <span className="text-[8px] md:text-xs text-white font-medium mt-1">Ink</span>
            </div>
            <div className="flex flex-col-reverse gap-0.5 h-10 md:h-16 w-3 md:w-5 bg-black/20 rounded p-0.5">
              {[0, 1, 2, 3].map((seg) => {
                const level = status?.inkLevel;
                const filledSegments = level === 'FULL' ? 4 : level === 'LOW' ? 1 : 0;
                const isFilled = seg < filledSegments;
                return (
                  <div
                    key={seg}
                    className={`flex-1 rounded-sm transition-colors ${
                      isFilled ? 'bg-white' : 'bg-white/20'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Count panel - moved next to Start/Stop */}
          <div className="bg-primary text-primary-foreground rounded-lg p-2 md:p-4 min-w-[100px] md:min-w-[140px] flex-shrink-0">
            <div className="flex justify-between items-center mb-1 md:mb-2 gap-2">
              <span className="text-[10px] md:text-sm whitespace-nowrap">Product:</span>
              <span className="font-bold text-base md:text-2xl">{status?.productCount ?? 0}</span>
            </div>
            <div className="flex justify-between items-center mb-2 gap-2">
              <span className="text-[10px] md:text-sm whitespace-nowrap">Print:</span>
              <span className="font-bold text-base md:text-2xl">{status?.printCount ?? 0}</span>
            </div>
            <button
              onClick={onCounters}
              className="w-full text-[10px] md:text-xs bg-white/20 hover:bg-white/30 rounded px-2 py-1 transition-colors"
            >
              Access
            </button>
          </div>

          {/* Start/Stop buttons */}
          <div className="flex gap-2 md:flex-col md:ml-auto flex-shrink-0">
            <button
              onClick={onStart}
              disabled={!isConnected || status?.isRunning}
              className="industrial-button-success text-white px-3 md:px-8 py-2 md:py-4 rounded-lg flex items-center justify-center gap-1 md:gap-2 disabled:opacity-50"
            >
              <Play className="w-5 h-5 md:w-10 md:h-10" />
              <span className="text-sm md:text-xl font-medium">Start</span>
            </button>

            <button
              onClick={onJetStop}
              disabled={!isConnected || !status?.isRunning}
              className="industrial-button-danger text-white px-3 md:px-8 py-2 md:py-4 rounded-lg flex items-center justify-center gap-1 md:gap-2 disabled:opacity-50"
            >
              <Square className="w-4 h-4 md:w-6 md:h-6" />
              <span className="text-sm md:text-xl font-medium">Stop</span>
            </button>
          </div>
        </div>
      </div>

      {/* Middle section - horizontal scroll on mobile */}
      <div className="overflow-x-auto pb-2 -mx-2 px-2 md:mx-0 md:px-0 md:overflow-visible">
        <div className="flex gap-2 md:gap-4 min-w-max md:min-w-0">
          {/* Message name area */}
          <div className="min-w-[100px] md:flex-1 bg-card rounded-lg p-2 md:p-4 min-h-[50px] md:min-h-[80px] flex items-center flex-shrink-0">
            <div className="text-xs md:text-lg">
              <div className="font-medium">Message name</div>
              <div className="text-foreground truncate max-w-[100px] md:max-w-none">
                {status?.currentMessage || 'No message selected'}
              </div>
            </div>
          </div>

          {/* New/Edit buttons */}
          <div className="flex gap-2 md:flex-col flex-shrink-0">
            <button 
              onClick={onNewMessage}
              className="industrial-button text-white px-3 md:px-6 py-2 md:py-3 rounded-lg flex items-center gap-1 md:gap-2"
            >
              <Plus className="w-4 h-4 md:w-6 md:h-6" />
              <span className="text-sm md:text-lg font-medium">New</span>
            </button>
            <button 
              onClick={onEditMessage}
              className="industrial-button text-white px-3 md:px-6 py-2 md:py-3 rounded-lg flex items-center gap-1 md:gap-2"
            >
              <Pencil className="w-4 h-4 md:w-6 md:h-6" />
              <span className="text-sm md:text-lg font-medium">Edit</span>
            </button>
          </div>
        </div>
      </div>

      {/* Message preview area - horizontal scroll on mobile */}
      <div className="flex-1 overflow-x-auto overflow-y-auto -mx-2 px-2 md:mx-0 md:px-0 min-h-0">
        <MessagePreviewCanvas 
          message={status?.currentMessage}
          printerTime={status?.printerTime}
          messageContent={messageContent}
        />
      </div>
    </div>
  </div>
  );
}

// Dot matrix message preview component
interface MessagePreviewCanvasProps {
  message?: string;
  printerTime?: Date;
  messageContent?: MessageDetails;
}

const DOT_SIZE_MOBILE = 3; // Smaller dots on mobile
const DOT_SIZE_DESKTOP = 4; // Pixels per dot on desktop
const TOTAL_ROWS = 32; // Total printable height in dots
const MIN_CANVAS_WIDTH = 420; // Minimum width to prevent any layout squeezing

// Calculate required canvas width based on message content
function calculateRequiredWidth(messageContent: MessageDetails | undefined, message: string | undefined, dotSize: number): number {
  // If we have messageContent fields, calculate based on those
  if (messageContent && messageContent.fields.length > 0) {
    let maxXEnd = 0;
    messageContent.fields.forEach((field) => {
      const fontName = field.fontSize || 'Standard16High';
      const fontInfo = getFontInfo(fontName);
      const x = field.x * dotSize;
      const textWidth = field.data.length * (fontInfo.charWidth + 1) * dotSize;
      maxXEnd = Math.max(maxXEnd, x + textWidth);
    });
    // Add some padding
    return Math.max(MIN_CANVAS_WIDTH, maxXEnd + 20);
  }

  // Fallback path: message string with time/date on right
  if (message) {
    const mainFontInfo = getFontInfo('Standard16High');
    const smallFontInfo = getFontInfo('Standard7High');
    const padding = 10;
    
    // Calculate message text width
    const messageWidth = message.length * (mainFontInfo.charWidth + 1) * dotSize;
    
    // Time string is typically "HH:MM:SS" = 8 chars, date is "MM/DD/YY" = 8 chars
    const timeWidth = 8 * (smallFontInfo.charWidth + 1) * dotSize;
    
    // Total width: padding + message + gap + time/date + padding
    const totalNeeded = padding + messageWidth + 20 + timeWidth + padding;
    return Math.max(MIN_CANVAS_WIDTH, totalNeeded);
  }

  return MIN_CANVAS_WIDTH;
}

// Zoom levels to cycle through on each click
const ZOOM_LEVELS = [1, 1.5, 2];

function MessagePreviewCanvas({ message, printerTime, messageContent }: MessagePreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dotSize, setDotSize] = useState<number>(DOT_SIZE_DESKTOP);
  const [zoomIndex, setZoomIndex] = useState(0);

  // Current zoom multiplier based on index
  const zoomMultiplier = ZOOM_LEVELS[zoomIndex];
  const effectiveDotSize = dotSize * zoomMultiplier;

  // Keep base dot size in sync with breakpoint
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const update = () => setDotSize(mql.matches ? DOT_SIZE_MOBILE : DOT_SIZE_DESKTOP);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  // Calculate dynamic width based on message content
  const renderWidth = calculateRequiredWidth(messageContent, message, effectiveDotSize);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = renderWidth;
    // Add 1 CSS pixel safety margin to avoid bottom-edge clipping on some DPR/rounding combos
    const height = TOTAL_ROWS * effectiveDotSize + 1;

    // HiDPI: scale backing store to devicePixelRatio while keeping CSS size
    // Use ceil + derive the actual scale factors to avoid clipping on non-integer DPRs (e.g. 2.625)
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const scaledWidth = Math.ceil(width * dpr);
    const scaledHeight = Math.ceil(height * dpr);

    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Draw in CSS pixel space using the *actual* scale factors
    const scaleX = scaledWidth / width;
    const scaleY = scaledHeight / height;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Draw background
    ctx.fillStyle = '#f5e6c8';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#d4c4a8';
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= width; x += effectiveDotSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= TOTAL_ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * effectiveDotSize);
      ctx.lineTo(width, y * effectiveDotSize);
      ctx.stroke();
    }

    // Render message content if available
    if (messageContent && messageContent.fields.length > 0) {
      ctx.fillStyle = '#1a1a1a';

      // Home preview only: shift everything up by 1 dot row to avoid bottom-row clipping on some devices.
      const previewYOffsetDots = 1;

      // Calculate total width needed and use dynamic canvas sizing
      let maxXEnd = 0;

      messageContent.fields.forEach((field) => {
        const fontName = field.fontSize || 'Standard16High';
        const fontInfo = getFontInfo(fontName);

        // Clamp to keep the full font visible within the 32-dot canvas
        const clampedYDots = Math.min(field.y, Math.max(0, TOTAL_ROWS - fontInfo.height));

        const x = field.x * effectiveDotSize;
        const yDots = Math.max(0, clampedYDots - previewYOffsetDots);
        const y = yDots * effectiveDotSize;

        renderText(ctx, field.data, x, y, fontName, effectiveDotSize);

        // Track the rightmost edge of rendered content
        const textWidth = field.data.length * (fontInfo.charWidth + 1) * effectiveDotSize;
        maxXEnd = Math.max(maxXEnd, x + textWidth);
      });
      return;
    }

    if (message) {
      ctx.fillStyle = '#1a1a1a';

      // Home preview only: shift everything up by 1 dot row to avoid bottom-row clipping on some devices.
      const previewYOffsetDots = 1;

      const mainFontName = 'Standard16High';
      const mainFontInfo = getFontInfo(mainFontName);

      const mainYDots = Math.max(0, (32 - mainFontInfo.height) - previewYOffsetDots);
      const mainY = mainYDots * effectiveDotSize;
      const padding = 10;

      renderText(ctx, message, padding, mainY, mainFontName, effectiveDotSize);

      const time = printerTime ?? new Date();
      const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const dateStr = time.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });

      const smallFontName = 'Standard7High';
      const smallFontInfo = getFontInfo(smallFontName);

      const timeWidth = timeStr.length * (smallFontInfo.charWidth + 1) * effectiveDotSize;
      const timeX = width - timeWidth - padding;

      const timeYDots = Math.max(0, 16 - previewYOffsetDots);
      const dateYDots = Math.max(0, (16 + smallFontInfo.height + 1) - previewYOffsetDots);

      const timeY = timeYDots * effectiveDotSize;
      const dateY = dateYDots * effectiveDotSize;

      renderText(ctx, timeStr, timeX, timeY, smallFontName, effectiveDotSize);
      renderText(ctx, dateStr, timeX, dateY, smallFontName, effectiveDotSize);
      return;
    }

    // No message - show placeholder
    ctx.fillStyle = '#888';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No message selected', width / 2, height / 2 + 5);
  }, [message, printerTime, messageContent, renderWidth, effectiveDotSize]);

  const canvasHeight = TOTAL_ROWS * effectiveDotSize + 1;

  const handleClick = () => {
    // Cycle to next zoom level, wrap back to 0 at the end
    setZoomIndex((prev) => (prev + 1) % ZOOM_LEVELS.length);
  };

  const zoomLabel = zoomMultiplier === 1 ? '1×' : `${zoomMultiplier}×`;

  return (
    <div
      onClick={handleClick}
      className="bg-white rounded-lg overflow-hidden border-2 border-muted flex-shrink-0 cursor-pointer transition-all duration-200 hover:border-primary relative"
      style={{ width: renderWidth, height: canvasHeight }}
      title={`Zoom: ${zoomLabel} (click to change)`}
    >
      {/* Zoom indicator badge */}
      <div className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded font-mono">
        {zoomLabel}
      </div>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: renderWidth, height: canvasHeight }}
      />
    </div>
  );
}
