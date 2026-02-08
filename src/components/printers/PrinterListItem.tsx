import { Printer as PrinterIcon, Wifi, WifiOff, Droplets, Palette, FileText, Plug } from 'lucide-react';
import { Printer } from '@/types/printer';
import { Button } from '@/components/ui/button';

interface PrinterListItemProps {
  printer: Printer;
  isSelected: boolean;
  onSelect: () => void;
  onConnect?: () => void;
  showConnectButton?: boolean;
  isConnected?: boolean;
  compact?: boolean;
}

// Helper to get color for fluid levels
function getFluidColor(level?: 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN'): string {
  switch (level) {
    case 'FULL':
    case 'GOOD':
      return 'text-success';
    case 'LOW':
      return 'text-warning';
    case 'EMPTY':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}

export function PrinterListItem({ 
  printer, 
  isSelected, 
  onSelect,
  onConnect,
  showConnectButton = true,
  isConnected = false,
  compact = false,
}: PrinterListItemProps) {
  
  // Compact mode for split-view layout
  if (compact) {
    return (
      <button
        onClick={onSelect}
        className={`w-full text-left p-3 rounded-lg transition-all border ${
          isConnected
            ? 'bg-success/20 border-success ring-2 ring-success/30'
            : isSelected 
              ? 'bg-primary/20 border-primary' 
              : 'bg-card/50 border-transparent hover:bg-card/80 hover:border-border'
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className={`relative w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            printer.isAvailable ? 'bg-success/20' : 'bg-muted'
          }`}>
            <PrinterIcon className={`w-5 h-5 ${
              printer.isAvailable ? 'text-success' : 'text-muted-foreground'
            }`} />
            <div className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card flex items-center justify-center ${
              printer.isAvailable ? 'bg-success' : 'bg-destructive'
            }`}>
              {printer.isAvailable ? (
                <Wifi className="w-2 h-2 text-white" />
              ) : (
                <WifiOff className="w-2 h-2 text-white" />
              )}
            </div>
          </div>

          {/* Printer info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground truncate text-sm">{printer.name}</span>
              {isConnected && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-success text-white font-medium">
                  ACTIVE
                </span>
              )}
            </div>
            <div className="text-xs text-primary font-mono truncate">
              {printer.ipAddress}
            </div>
          </div>

          {/* Status badge */}
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium flex-shrink-0 ${
            printer.status === 'ready' 
              ? 'bg-success text-white' 
              : printer.status === 'not_ready'
              ? 'bg-warning text-white'
              : 'bg-muted text-muted-foreground'
          }`}>
            {printer.status === 'ready' ? 'RDY' : 
             printer.status === 'not_ready' ? 'WAIT' : 'OFF'}
          </span>
        </div>
      </button>
    );
  }

  // Full mode (original layout)
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-5 rounded-xl transition-all border-2 ${
        isSelected 
          ? 'bg-primary/20 border-primary shadow-lg' 
          : 'bg-card/50 border-transparent hover:bg-card/80 hover:border-border'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Status indicator */}
        <div className={`relative w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${
          printer.isAvailable ? 'bg-success/20' : 'bg-muted'
        }`}>
          <PrinterIcon className={`w-8 h-8 ${
            printer.isAvailable ? 'text-success' : 'text-muted-foreground'
          }`} />
          <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full border-2 border-card flex items-center justify-center ${
            printer.isAvailable ? 'bg-success' : 'bg-destructive'
          }`}>
            {printer.isAvailable ? (
              <Wifi className="w-3 h-3 text-white" />
            ) : (
              <WifiOff className="w-3 h-3 text-white" />
            )}
          </div>
        </div>

        {/* Printer info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-foreground truncate text-base">{printer.name}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
              ID: {printer.id}
            </span>
          </div>
          <div className="text-sm text-primary font-mono">
            {printer.ipAddress}:{printer.port}
          </div>
          
          {/* Current message with print count */}
          {printer.currentMessage && (
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span className="truncate font-medium">{printer.currentMessage}</span>
              </div>
              {printer.printCount !== undefined && (
                <div className="flex items-center gap-1" title={`Print Count: ${printer.printCount}`}>
                  <span className="text-slate-400">PRINTS:</span>
                  <span className="font-semibold text-primary">
                    {printer.printCount.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
          
          {/* Fluid levels */}
          {printer.isAvailable && (
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5" title={`Ink: ${printer.inkLevel || 'Unknown'}`}>
                <Palette className={`w-4 h-4 ${getFluidColor(printer.inkLevel)}`} />
                <span className="text-xs text-slate-300 font-medium">INK:</span>
                <span className={`text-xs font-semibold ${getFluidColor(printer.inkLevel)}`}>
                  {printer.inkLevel || '?'}
                </span>
              </div>
              <div className="flex items-center gap-1.5" title={`Makeup: ${printer.makeupLevel || 'Unknown'}`}>
                <Droplets className={`w-4 h-4 ${getFluidColor(printer.makeupLevel)}`} />
                <span className="text-xs text-slate-300 font-medium">MU:</span>
                <span className={`text-xs font-semibold ${getFluidColor(printer.makeupLevel)}`}>
                  {printer.makeupLevel || '?'}
                </span>
              </div>
            </div>
          )}
          
          {/* Connect button (mobile / when details panel hidden) */}
          {showConnectButton && printer.isAvailable && onConnect && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onConnect();
              }}
              size="sm"
              className="mt-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500"
            >
              <Plug className="w-3 h-3 mr-1" />
              Connect
            </Button>
          )}
        </div>

        {/* Status badge */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded font-medium ${
            printer.status === 'ready' 
              ? 'bg-success text-white' 
              : printer.status === 'not_ready'
              ? 'bg-warning text-white'
              : 'bg-muted text-muted-foreground'
          }`}>
            {printer.status === 'ready' ? 'READY' : 
             printer.status === 'not_ready' ? 'NOT READY' : 'OFFLINE'}
          </span>
          {printer.hasActiveErrors && (
            <span className="text-xs px-2.5 py-1 rounded bg-destructive text-white font-medium">
              ERROR
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
