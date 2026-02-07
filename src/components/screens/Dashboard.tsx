import { useEffect, useRef } from 'react';
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
      
      <div className="flex-1 p-2 md:p-4 flex flex-col gap-2 md:gap-4 overflow-auto">
      {/* Top row buttons */}
      <div className="flex flex-wrap gap-2">
        <button 
          onClick={onSignIn}
          className={`${isSignedIn ? 'industrial-button-success' : 'industrial-button-gray'} text-white px-3 md:px-4 py-2 md:py-3 rounded-lg flex flex-col items-center justify-center min-w-[80px] md:min-w-[100px]`}
        >
          <Key className="w-8 h-8 md:w-10 md:h-10 mb-1" />
          <span className="text-xs md:text-sm">{isSignedIn ? 'Sign Out' : 'Sign In'}</span>
        </button>

        <button 
          onClick={onHelp}
          className="industrial-button text-white px-3 md:px-4 py-2 md:py-3 rounded-lg flex flex-col items-center justify-center min-w-[80px] md:min-w-[100px]"
        >
          <HelpCircle className="w-8 h-8 md:w-10 md:h-10 mb-1" />
          <span className="text-xs md:text-sm">Help</span>
        </button>

        <button 
          onClick={isHvOn ? onStop : onStart}
          disabled={!isConnected}
          className={`${isHvOn ? 'industrial-button-success' : 'industrial-button-danger'} text-white px-3 md:px-4 py-2 md:py-3 rounded-lg flex flex-col items-center justify-center min-w-[80px] md:min-w-[100px] disabled:opacity-50`}
        >
          <PrinterIcon className="w-8 h-8 md:w-10 md:h-10 mb-1" />
          <span className="text-xs md:text-sm">{isHvOn ? 'HV On' : 'HV Off'}</span>
        </button>

        {/* Makeup Level Indicator - HMI style with tank gauge */}
        <div className={`w-[100px] md:w-[120px] h-[80px] md:h-[100px] rounded-lg flex items-center justify-between px-2 md:px-3 ${
          status?.makeupLevel === 'EMPTY' ? 'bg-destructive' :
          status?.makeupLevel === 'LOW' ? 'bg-warning' :
          'industrial-button'
        }`}>
          {/* Left: Icon and label */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <Droplets className="w-6 h-6 md:w-8 md:h-8 text-white" />
              {(status?.makeupLevel === 'FULL' || status?.makeupLevel === 'GOOD') && (
                <Wifi className="w-2.5 h-2.5 md:w-3 md:h-3 absolute -top-0.5 -right-0.5 text-white" />
              )}
            </div>
            <span className="text-[10px] md:text-xs text-white font-medium mt-1">Makeup</span>
          </div>
          {/* Right: Tank level gauge (4 segments) */}
          <div className="flex flex-col-reverse gap-0.5 h-12 md:h-16 w-4 md:w-5 bg-black/20 rounded p-0.5">
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

        {/* Ink Level Indicator - HMI style with tank gauge */}
        <div className={`w-[100px] md:w-[120px] h-[80px] md:h-[100px] rounded-lg flex items-center justify-between px-2 md:px-3 ${
          status?.inkLevel === 'EMPTY' ? 'bg-destructive' :
          status?.inkLevel === 'LOW' ? 'bg-warning' :
          'industrial-button'
        }`}>
          {/* Left: Icon and label */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <Palette className="w-6 h-6 md:w-8 md:h-8 text-white" />
              {status?.inkLevel === 'FULL' && (
                <span className="absolute -top-0.5 -right-0.5 text-white text-xs md:text-sm">✓</span>
              )}
            </div>
            <span className="text-[10px] md:text-xs text-white font-medium mt-1">Ink</span>
          </div>
          {/* Right: Tank level gauge (4 segments) */}
          <div className="flex flex-col-reverse gap-0.5 h-12 md:h-16 w-4 md:w-5 bg-black/20 rounded p-0.5">
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

        {/* Start/Stop buttons - inline on mobile, stacked on desktop */}
        <div className="flex md:flex-col gap-2 md:ml-auto">
          <button
            onClick={onStart}
            disabled={!isConnected || status?.isRunning}
            className="industrial-button-success text-white px-4 md:px-8 py-2 md:py-4 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Play className="w-6 h-6 md:w-10 md:h-10" />
            <span className="text-base md:text-xl font-medium">Start</span>
          </button>

          <button
            onClick={onJetStop}
            disabled={!isConnected || !status?.isRunning}
            className="industrial-button-danger text-white px-4 md:px-8 py-2 md:py-4 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Square className="w-5 h-5 md:w-6 md:h-6" />
            <span className="text-base md:text-xl font-medium">Stop</span>
          </button>
        </div>
      </div>

      {/* Middle section */}
      <div className="flex flex-wrap gap-2 md:gap-4">
        {/* Message name area */}
        <div className="flex-1 min-w-[120px] bg-card rounded-lg p-3 md:p-4 min-h-[60px] md:min-h-[80px] flex items-center">
          <div className="text-sm md:text-lg">
            <div className="font-medium">Message name</div>
            <div className="text-foreground">
              {status?.currentMessage || 'No message selected'}
            </div>
          </div>
        </div>

        {/* New/Edit buttons */}
        <div className="flex md:flex-col gap-2">
          <button 
            onClick={onNewMessage}
            className="industrial-button text-white px-4 md:px-6 py-2 md:py-3 rounded-lg flex items-center gap-2"
          >
            <Plus className="w-5 h-5 md:w-6 md:h-6" />
            <span className="text-base md:text-lg font-medium">New</span>
          </button>
          <button 
            onClick={onEditMessage}
            className="industrial-button text-white px-4 md:px-6 py-2 md:py-3 rounded-lg flex items-center gap-2"
          >
            <Pencil className="w-5 h-5 md:w-6 md:h-6" />
            <span className="text-base md:text-lg font-medium">Edit</span>
          </button>
        </div>

        {/* Count panel */}
        <div className="bg-primary text-primary-foreground rounded-lg p-3 md:p-6 min-w-[150px] md:min-w-[200px]">
          <div className="flex justify-between items-center mb-2 md:mb-4">
            <span className="text-sm md:text-lg">Product count:</span>
            <span className="font-bold text-xl md:text-3xl">{status?.productCount ?? 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm md:text-lg">Print count:</span>
            <span className="font-bold text-xl md:text-3xl">{status?.printCount ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Message preview area - Dot matrix style print preview */}
      <MessagePreviewCanvas 
        message={status?.currentMessage}
        printerTime={status?.printerTime}
        messageContent={messageContent}
      />
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

const DOT_SIZE = 4; // Pixels per dot
const TOTAL_ROWS = 32; // Total printable height in dots

function MessagePreviewCanvas({ message, printerTime, messageContent }: MessagePreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size - full width, 32 dots high
    const width = container.clientWidth;
    const height = TOTAL_ROWS * DOT_SIZE;
    canvas.width = width;
    canvas.height = height;
    
    // Draw background - cream/beige like the message editor
    ctx.fillStyle = '#f5e6c8';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid
    ctx.strokeStyle = '#d4c4a8';
    ctx.lineWidth = 0.5;
    
    for (let x = 0; x <= width; x += DOT_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= TOTAL_ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * DOT_SIZE);
      ctx.lineTo(width, y * DOT_SIZE);
      ctx.stroke();
    }
    
    // Render message content if available
    if (messageContent && messageContent.fields.length > 0) {
      ctx.fillStyle = '#1a1a1a';
      
      // Render each field from the message content
      messageContent.fields.forEach((field) => {
        const fontName = field.fontSize || 'Standard16High';
        const x = field.x * DOT_SIZE;
        const y = field.y * DOT_SIZE;
        
        renderText(ctx, field.data, x, y, fontName, DOT_SIZE);
      });
    } else if (message) {
      ctx.fillStyle = '#1a1a1a';
      
      // Fallback: show message name if no content available
      const mainFontName = 'Standard16High';
      const mainFontInfo = getFontInfo(mainFontName);
      
      // Position main message: 16 dots high, starts at row 16 (bottom half of 32)
      const mainY = (32 - mainFontInfo.height) * DOT_SIZE;
      const padding = 10;
      
      renderText(ctx, message, padding, mainY, mainFontName, DOT_SIZE);
      
      // Time and date on the right - using 7 dot font
      const time = printerTime ?? new Date();
      const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const dateStr = time.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
      
      const smallFontName = 'Standard7High';
      const smallFontInfo = getFontInfo(smallFontName);
      
      const timeWidth = timeStr.length * (smallFontInfo.charWidth + 1) * DOT_SIZE;
      const timeX = width - timeWidth - padding;
      
      const timeY = 16 * DOT_SIZE;
      const dateY = (16 + smallFontInfo.height + 1) * DOT_SIZE;
      
      renderText(ctx, timeStr, timeX, timeY, smallFontName, DOT_SIZE);
      renderText(ctx, dateStr, timeX, dateY, smallFontName, DOT_SIZE);
    } else {
      // No message - show placeholder
      ctx.fillStyle = '#888';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No message selected', width / 2, height / 2 + 5);
    }
  }, [message, printerTime, messageContent]);
  
  return (
    <div ref={containerRef} className="flex-1 bg-white rounded-lg overflow-hidden border-2 border-muted" style={{ minHeight: TOTAL_ROWS * DOT_SIZE }}>
      <canvas ref={canvasRef} className="w-full" style={{ height: TOTAL_ROWS * DOT_SIZE }} />
    </div>
  );
}
