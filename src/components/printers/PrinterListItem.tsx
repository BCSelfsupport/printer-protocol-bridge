import { Printer as PrinterIcon, Wifi, WifiOff, Droplets, Palette, FileText, Plug, Settings2 } from 'lucide-react';
import { Printer } from '@/types/printer';
import { Button } from '@/components/ui/button';

interface PrinterListItemProps {
  printer: Printer;
  isSelected: boolean;
  onSelect: () => void;
  onConnect?: () => void;
  onEdit?: () => void;
  onService?: () => void;
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
  onEdit,
  onService,
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
  
  // Text color classes based on selection state
  const textColor = isSelected || isConnected ? 'text-primary' : 'text-slate-200';
  const subTextColor = isSelected || isConnected ? 'text-primary' : 'text-slate-300';
  const mutedTextColor = isSelected || isConnected ? 'text-primary/70' : 'text-slate-400';

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
              : 'bg-slate-800/60 border-slate-700/50 hover:bg-slate-700/60 hover:border-slate-600'
        }`}
      >
        <div className="flex items-start gap-4">
          {/* Status indicator - clickable for edit */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
            className={`relative w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:ring-2 hover:ring-primary/50 ${
              printer.isAvailable ? 'bg-success/20 hover:bg-success/30' : 'bg-muted hover:bg-muted/80'
            }`}
            title="Click to edit printer"
          >
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
          </button>

          {/* Printer info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-bold truncate text-base ${textColor}`}>{printer.name}</span>
              {isConnected && (
                <span className="text-xs px-2 py-0.5 rounded bg-success text-white font-medium">
                  ACTIVE
                </span>
              )}
            </div>
            <div className={`text-sm font-mono truncate ${subTextColor}`}>
              {printer.ipAddress}:{printer.port}
            </div>
            
            {/* Message name with print count */}
            {printer.currentMessage && (
              <div className={`flex items-center gap-2 mt-1.5 text-sm ${subTextColor}`}>
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="truncate font-medium">{printer.currentMessage}</span>
                {printer.printCount !== undefined && (
                  <span className="flex-shrink-0">
                    PRINTS: <span className="font-semibold">{printer.printCount.toString().padStart(7, '0')}</span>
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

          {/* Status badges + Service button */}
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
            {/* Service button */}
            {printer.isAvailable && onService && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onService();
                }}
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-2 text-slate-400 hover:text-white hover:bg-slate-600"
                title="View service metrics"
              >
                <Settings2 className="w-3 h-3 mr-1" />
                Service
              </Button>
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
      className={`w-full text-left p-3 rounded-lg transition-all border overflow-hidden ${
        isSelected 
          ? 'bg-primary/20 border-primary shadow-lg' 
          : 'bg-slate-800/60 border-slate-700/50 hover:bg-slate-700/60 hover:border-slate-600'
      }`}
    >
      <div className="flex items-center gap-2 md:gap-3">
        {/* Status indicator - clickable for edit */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          className={`relative w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:ring-2 hover:ring-primary/50 ${
            printer.isAvailable ? 'bg-success/20 hover:bg-success/30' : 'bg-muted hover:bg-muted/80'
          }`}
          title="Click to edit printer"
        >
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
        </button>

        {/* Printer info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-bold truncate text-sm ${textColor}`}>{printer.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded bg-slate-700 ${mutedTextColor}`}>
              ID: {printer.id}
            </span>
          </div>
          <div className={`text-xs font-mono ${subTextColor}`}>
            {printer.ipAddress}:{printer.port}
          </div>
          
          {/* Current message with print count - inline */}
          {printer.currentMessage && (
            <div className={`flex items-center gap-2 mt-1 text-[10px] ${subTextColor}`}>
              <FileText className="w-3 h-3 flex-shrink-0" />
              <span className="truncate font-medium">{printer.currentMessage}</span>
              {printer.printCount !== undefined && (
                <span className="font-semibold flex-shrink-0">
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

        {/* Right side: status + service + connect */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
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
          <div className="flex items-center gap-1 mt-1">
            {/* Service button */}
            {printer.isAvailable && onService && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onService();
                }}
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-1.5 text-slate-400 hover:text-white hover:bg-slate-600"
                title="View service metrics"
              >
                <Settings2 className="w-3 h-3" />
              </Button>
            )}
            {showConnectButton && printer.isAvailable && onConnect && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onConnect();
                }}
                size="sm"
                className="h-6 text-[10px] px-1.5 md:px-2 bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70"
              >
                <Plug className="w-2.5 h-2.5 mr-0.5 md:mr-1" />
                Connect
              </Button>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
