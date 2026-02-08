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
  countdownType?: 'starting' | 'stopping' | null;
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
  countdownType,
}: PrinterListItemProps) {
  
  // Determine effective status (countdown overrides ready state)
  const getEffectiveStatus = () => {
    if (isConnected && countdownType === 'starting') return 'starting';
    if (isConnected && countdownType === 'stopping') return 'stopping';
    return printer.status;
  };
  
  const effectiveStatus = getEffectiveStatus();
  
  const getStatusBadge = () => {
    switch (effectiveStatus) {
      case 'ready':
        return { label: 'READY', className: 'bg-success text-white' };
      case 'starting':
        return { label: 'STARTING', className: 'bg-destructive text-white' };
      case 'stopping':
        return { label: 'STOPPING', className: 'bg-warning text-white' };
      case 'not_ready':
        return { label: 'NOT READY', className: 'bg-warning text-white' };
      default:
        return { label: 'OFFLINE', className: 'bg-muted text-muted-foreground' };
    }
  };
  
  // Compact mode for split-view layout
  if (compact) {
    return (
      <button
        onClick={onSelect}
        className={`w-full text-left p-4 rounded-xl transition-all border ${
          isConnected
            ? 'bg-success/20 border-success ring-2 ring-success/30'
            : isSelected 
              ? 'bg-primary/20 border-primary' 
              : 'bg-card/50 border-transparent hover:bg-card/80 hover:border-border'
        }`}
      >
        <div className="flex items-start gap-4">
          {/* Status indicator */}
          <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            printer.isAvailable ? 'bg-success/20' : 'bg-muted'
          }`}>
            <PrinterIcon className={`w-6 h-6 ${
              printer.isAvailable ? 'text-success' : 'text-muted-foreground'
            }`} />
            <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-card flex items-center justify-center ${
              printer.isAvailable ? 'bg-success' : 'bg-destructive'
            }`}>
              {printer.isAvailable ? (
                <Wifi className="w-2.5 h-2.5 text-white" />
              ) : (
                <WifiOff className="w-2.5 h-2.5 text-white" />
              )}
            </div>
          </div>

          {/* Printer info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-primary truncate text-base">{printer.name}</span>
              {isConnected && (
                <span className="text-xs px-2 py-0.5 rounded bg-success text-white font-medium">
                  ACTIVE
                </span>
              )}
            </div>
            <div className="text-sm text-primary font-mono truncate">
              {printer.ipAddress}:{printer.port}
            </div>
            
            {/* Message name with print count */}
            {printer.currentMessage && (
              <div className="flex items-center gap-2 mt-1.5 text-xs">
                <FileText className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                <span className="truncate text-primary font-medium">{printer.currentMessage}</span>
                {printer.printCount !== undefined && (
                  <span className="text-muted-foreground flex-shrink-0">
                    Prints: <span className="text-primary font-semibold">{printer.printCount.toLocaleString()}</span>
                  </span>
                )}
              </div>
            )}
            
            {/* Fluid levels */}
            {printer.isAvailable && (
              <div className="flex items-center gap-4 mt-1.5">
                <div className="flex items-center gap-1.5" title={`Ink: ${printer.inkLevel || 'Unknown'}`}>
                  <Palette className={`w-4 h-4 ${getFluidColor(printer.inkLevel)}`} />
                  <span className={`text-xs font-semibold ${getFluidColor(printer.inkLevel)}`}>
                    {printer.inkLevel || '?'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5" title={`Makeup: ${printer.makeupLevel || 'Unknown'}`}>
                  <Droplets className={`w-4 h-4 ${getFluidColor(printer.makeupLevel)}`} />
                  <span className={`text-xs font-semibold ${getFluidColor(printer.makeupLevel)}`}>
                    {printer.makeupLevel || '?'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Status badges */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {(() => {
              const badge = getStatusBadge();
              return (
                <span className={`text-xs px-2.5 py-1 rounded font-medium ${badge.className}`}>
                  {badge.label}
                </span>
              );
            })()}
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

  // Full mode (more compact layout)
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg transition-all border ${
        isSelected 
          ? 'bg-primary/20 border-primary shadow-lg' 
          : 'bg-card/50 border-transparent hover:bg-card/80 hover:border-border'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <div className={`relative w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
          printer.isAvailable ? 'bg-success/20' : 'bg-muted'
        }`}>
          <PrinterIcon className={`w-6 h-6 ${
            printer.isAvailable ? 'text-success' : 'text-muted-foreground'
          }`} />
          <div className={`absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-card flex items-center justify-center ${
            printer.isAvailable ? 'bg-success' : 'bg-destructive'
          }`}>
            {printer.isAvailable ? (
              <Wifi className="w-2.5 h-2.5 text-white" />
            ) : (
              <WifiOff className="w-2.5 h-2.5 text-white" />
            )}
          </div>
        </div>

        {/* Printer info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-primary truncate text-sm">{printer.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              ID: {printer.id}
            </span>
          </div>
          <div className="text-xs text-primary font-mono">
            {printer.ipAddress}:{printer.port}
          </div>
          
          {/* Current message with print count - inline */}
          {printer.currentMessage && (
            <div className="flex items-center gap-2 mt-1 text-[10px]">
              <FileText className="w-3 h-3 flex-shrink-0 text-primary" />
              <span className="truncate text-primary font-medium">{printer.currentMessage}</span>
              {printer.printCount !== undefined && (
                <span className="text-primary font-semibold flex-shrink-0">
                  #{printer.printCount.toLocaleString()}
                </span>
              )}
            </div>
          )}
          
          {/* Fluid levels - inline */}
          {printer.isAvailable && (
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1" title={`Ink: ${printer.inkLevel || 'Unknown'}`}>
                <Palette className={`w-3 h-3 ${getFluidColor(printer.inkLevel)}`} />
                <span className={`text-[10px] font-semibold ${getFluidColor(printer.inkLevel)}`}>
                  {printer.inkLevel || '?'}
                </span>
              </div>
              <div className="flex items-center gap-1" title={`Makeup: ${printer.makeupLevel || 'Unknown'}`}>
                <Droplets className={`w-3 h-3 ${getFluidColor(printer.makeupLevel)}`} />
                <span className={`text-[10px] font-semibold ${getFluidColor(printer.makeupLevel)}`}>
                  {printer.makeupLevel || '?'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right side: status + connect */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {(() => {
            const badge = getStatusBadge();
            return (
              <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${badge.className}`}>
                {badge.label}
              </span>
            );
          })()}
          {printer.hasActiveErrors && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-destructive text-white font-medium">
              ERROR
            </span>
          )}
          {showConnectButton && printer.isAvailable && onConnect && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onConnect();
              }}
              size="sm"
              className="h-6 text-[10px] px-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500"
            >
              <Plug className="w-2.5 h-2.5 mr-1" />
              Connect
            </Button>
          )}
        </div>
      </div>
    </button>
  );
}
