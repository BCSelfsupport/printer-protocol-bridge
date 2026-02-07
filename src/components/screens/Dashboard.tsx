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

          {/* Count panel */}
          <div className="bg-primary text-primary-foreground rounded-lg p-2 md:p-6 min-w-[120px] md:min-w-[200px] flex-shrink-0">
            <div className="flex justify-between items-center mb-1 md:mb-4 gap-2">
              <span className="text-[10px] md:text-lg whitespace-nowrap">Product:</span>
              <span className="font-bold text-lg md:text-3xl">{status?.productCount ?? 0}</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-[10px] md:text-lg whitespace-nowrap">Print:</span>
              <span className="font-bold text-lg md:text-3xl">{status?.printCount ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Message preview area - horizontal scroll on mobile */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden -mx-2 px-2 md:mx-0 md:px-0 min-h-0">
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

function MessagePreviewCanvas({ message, printerTime, messageContent }: MessagePreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dotSize, setDotSize] = useState<number>(DOT_SIZE_DESKTOP);

  // Keep dot size in sync with breakpoint (but keep width fixed to avoid scaling/overlap artifacts)
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const update = () => setDotSize(mql.matches ? DOT_SIZE_MOBILE : DOT_SIZE_DESKTOP);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  const renderWidth = MIN_CANVAS_WIDTH;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = renderWidth;
    const height = TOTAL_ROWS * dotSize;

    // Set backing store size to match CSS size (prevents scaling artifacts/"overlap")
    canvas.width = width;
    canvas.height = height;

    // Draw background
    ctx.fillStyle = '#f5e6c8';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#d4c4a8';
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= width; x += dotSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= TOTAL_ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * dotSize);
      ctx.lineTo(width, y * dotSize);
      ctx.stroke();
    }

    // Render message content if available
    if (messageContent && messageContent.fields.length > 0) {
      ctx.fillStyle = '#1a1a1a';

      messageContent.fields.forEach((field) => {
        const fontName = field.fontSize || 'Standard16High';
        const x = field.x * dotSize;
        const y = field.y * dotSize;

        renderText(ctx, field.data, x, y, fontName, dotSize);
      });
      return;
    }

    if (message) {
      ctx.fillStyle = '#1a1a1a';

      const mainFontName = 'Standard16High';
      const mainFontInfo = getFontInfo(mainFontName);

      const mainY = (32 - mainFontInfo.height) * dotSize;
      const padding = 10;

      renderText(ctx, message, padding, mainY, mainFontName, dotSize);

      const time = printerTime ?? new Date();
      const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const dateStr = time.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });

      const smallFontName = 'Standard7High';
      const smallFontInfo = getFontInfo(smallFontName);

      const timeWidth = timeStr.length * (smallFontInfo.charWidth + 1) * dotSize;
      const timeX = width - timeWidth - padding;

      const timeY = 16 * dotSize;
      const dateY = (16 + smallFontInfo.height + 1) * dotSize;

      renderText(ctx, timeStr, timeX, timeY, smallFontName, dotSize);
      renderText(ctx, dateStr, timeX, dateY, smallFontName, dotSize);
      return;
    }

    // No message - show placeholder
    ctx.fillStyle = '#888';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No message selected', width / 2, height / 2 + 5);
  }, [message, printerTime, messageContent, renderWidth, dotSize]);

  const canvasHeight = TOTAL_ROWS * dotSize;

  return (
    <div
      className="bg-white rounded-lg overflow-hidden border-2 border-muted flex-shrink-0"
      style={{ width: renderWidth, height: canvasHeight }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: renderWidth, height: canvasHeight }}
      />
    </div>
  );
}
