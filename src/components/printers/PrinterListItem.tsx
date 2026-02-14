import { Printer as PrinterIcon, Wifi, WifiOff, Droplets, Palette, FileText, Plug, Settings2, Crown, Link, RefreshCcw, Filter } from 'lucide-react';
import { getFilterStatus } from '@/lib/filterTracker';
import { parseStreamHoursToNumber } from '@/components/consumables/ConsumablePredictions';
import { Printer } from '@/types/printer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Color palette for sync groups (left border stripe)
const SYNC_GROUP_COLORS = [
  { border: 'border-l-amber-400', bg: 'bg-amber-400/5', badge: 'bg-amber-500/20 text-amber-400' },
  { border: 'border-l-cyan-400', bg: 'bg-cyan-400/5', badge: 'bg-cyan-500/20 text-cyan-400' },
  { border: 'border-l-rose-400', bg: 'bg-rose-400/5', badge: 'bg-rose-500/20 text-rose-400' },
  { border: 'border-l-emerald-400', bg: 'bg-emerald-400/5', badge: 'bg-emerald-500/20 text-emerald-400' },
  { border: 'border-l-violet-400', bg: 'bg-violet-400/5', badge: 'bg-violet-500/20 text-violet-400' },
  { border: 'border-l-orange-400', bg: 'bg-orange-400/5', badge: 'bg-orange-500/20 text-orange-400' },
];

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
  countdownSeconds?: number | null;
  /** Index into the sync group color palette (-1 or undefined = no group) */
  syncGroupIndex?: number;
  /** Number of slaves for this master (only relevant when role === 'master') */
  slaveCount?: number;
  /** Callback to trigger sync for this master */
  onSync?: () => void;
  /** Stream hours string from metrics for filter gauge */
  streamHours?: string;
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
  countdownSeconds,
  syncGroupIndex,
  slaveCount = 0,
  onSync,
  streamHours,
}: PrinterListItemProps) {
  
  // Filter status for this printer
  const pumpHours = streamHours ? parseStreamHoursToNumber(streamHours) : null;
  const filterSt = pumpHours != null ? getFilterStatus(printer.id, pumpHours) : null;
  const getFilterColor = () => {
    if (!filterSt) return 'text-muted-foreground';
    if (filterSt.hoursRemaining <= 200) return filterSt.status === 'critical' ? 'text-destructive' : 'text-warning';
    return 'text-success';
  };
  const filterLabel = filterSt ? `${filterSt.hoursRemaining.toFixed(0)}h` : '?';
  
  const groupColor = syncGroupIndex !== undefined && syncGroupIndex >= 0
    ? SYNC_GROUP_COLORS[syncGroupIndex % SYNC_GROUP_COLORS.length]
    : null;
  const groupBorderClass = groupColor ? `border-l-4 ${groupColor.border}` : '';
  
  // Determine effective status (countdown overrides ready state regardless of connection)
  const getEffectiveStatus = () => {
    if (countdownType === 'starting') return 'starting';
    if (countdownType === 'stopping') return 'stopping';
    return printer.status;
  };
  
  const effectiveStatus = getEffectiveStatus();
  
  const formatCountdown = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    const cdLabel = countdownSeconds && countdownSeconds > 0 ? ` ${formatCountdown(countdownSeconds)}` : '';
    switch (effectiveStatus) {
      case 'ready':
        return { label: 'READY', className: 'bg-success text-white' };
      case 'starting':
        return { label: `STARTING${cdLabel}`, className: 'bg-destructive text-white animate-pulse' };
      case 'stopping':
        return { label: `STOPPING${cdLabel}`, className: 'bg-warning text-white animate-pulse' };
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
        className={`w-full text-left p-4 rounded-xl transition-all border ${groupBorderClass} ${
          isConnected
            ? 'bg-success/20 border-success ring-2 ring-success/30'
            : isSelected 
              ? 'bg-primary/20 border-primary' 
              : groupColor
                ? `${groupColor.bg} border-slate-700/50 hover:bg-slate-700/60 hover:border-slate-600`
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
              {printer.role === 'master' && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 ${groupColor?.badge ?? 'bg-amber-500/20 text-amber-400'}`}>
                  <Crown className="w-2.5 h-2.5" /> MASTER
                </span>
              )}
              {printer.role === 'slave' && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 ${groupColor?.badge ?? 'bg-blue-500/20 text-blue-400'}`}>
                  <Link className="w-2.5 h-2.5" /> SLAVE
                </span>
              )}
            </div>
            <div className={`text-sm font-mono truncate ${subTextColor}`}>
              {printer.ipAddress}:{printer.port}
            </div>
            
            {/* Message name with print count */}
            {printer.currentMessage && (
              <div className={`mt-1.5 text-sm ${subTextColor}`}>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium">{printer.currentMessage}</span>
                </div>
                {printer.printCount !== undefined && (
                  <div className="ml-6 mt-0.5">
                    PRINTS: <span className="font-semibold">{printer.printCount.toString().padStart(7, '0')}</span>
                  </div>
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
                {filterSt && (
                  <div className="flex items-center gap-1.5" title={`Filter: ${filterLabel}`}>
                    <Filter className={`w-4 h-4 ${getFilterColor()}`} />
                    <span className={`text-xs font-semibold ${getFilterColor()}`}>
                      {filterLabel}
                    </span>
                  </div>
                )}
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
                WARNING
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
            {/* Sync button for masters */}
            {printer.role === 'master' && slaveCount > 0 && onSync && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onSync();
                }}
                size="sm"
                variant="ghost"
                className={`h-6 text-[10px] px-2 hover:bg-slate-600 ${groupColor?.badge?.split(' ')[1] ?? 'text-amber-400'}`}
                title={`Sync messages to ${slaveCount} slave(s)`}
              >
                <RefreshCcw className="w-3 h-3 mr-1" />
                Sync {slaveCount}
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
      className={`w-full text-left p-3 rounded-lg transition-all border overflow-hidden ${groupBorderClass} ${
        isSelected 
          ? 'bg-primary/20 border-primary shadow-lg' 
          : groupColor
            ? `${groupColor.bg} border-slate-700/50 hover:bg-slate-700/60 hover:border-slate-600`
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
          <div className="flex items-center gap-1.5">
            <span className={`font-bold truncate text-sm ${textColor}`}>{printer.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded bg-slate-700 whitespace-nowrap flex-shrink-0 ${mutedTextColor}`}>
              ID: {printer.id}
            </span>
            {printer.role === 'master' && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 whitespace-nowrap flex-shrink-0 ${groupColor?.badge ?? 'bg-amber-500/20 text-amber-400'}`}>
                <Crown className="w-2.5 h-2.5" /> MASTER
              </span>
            )}
            {printer.role === 'slave' && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 whitespace-nowrap flex-shrink-0 ${groupColor?.badge ?? 'bg-blue-500/20 text-blue-400'}`}>
                <Link className="w-2.5 h-2.5" /> SLAVE
              </span>
            )}
          </div>
          <div className={`text-xs font-mono ${subTextColor}`}>
            {printer.ipAddress}:{printer.port}
          </div>
          
          {/* Current message with print count - inline */}
          {printer.currentMessage && (
            <div className={`mt-1 text-[10px] ${subTextColor}`}>
              <div className="flex items-center gap-2">
                <FileText className="w-3 h-3 flex-shrink-0" />
                <span className="font-medium">{printer.currentMessage}</span>
              </div>
              {printer.printCount !== undefined && (
                <div className="ml-5 mt-0.5 font-semibold">
                  #{printer.printCount.toLocaleString()}
                </div>
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
              {filterSt && (
                <div className="flex items-center gap-1" title={`Filter: ${filterLabel}`}>
                  <Filter className={`w-3 h-3 ${getFilterColor()}`} />
                  <span className={`text-[10px] font-semibold ${getFilterColor()}`}>
                    {filterLabel}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right side: status + service + connect */}
        <div className="flex flex-col items-end gap-1 min-w-0">
          {(() => {
            const badge = getStatusBadge();
            return (
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded font-medium max-w-[110px] truncate",
                badge.className
              )}>
                {badge.label}
              </span>
            );
          })()}
          {printer.hasActiveErrors && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-destructive text-white font-medium max-w-[110px] truncate">
              WARNING
            </span>
          )}
          <div className="flex items-center gap-1 mt-1 min-w-0">
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
            {/* Sync button for masters */}
            {printer.role === 'master' && slaveCount > 0 && onSync && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onSync();
                }}
                size="sm"
                variant="ghost"
                className={`h-6 text-[10px] px-1.5 hover:bg-slate-600 ${groupColor?.badge?.split(' ')[1] ?? 'text-amber-400'}`}
                title={`Sync messages to ${slaveCount} slave(s)`}
              >
                <RefreshCcw className="w-3 h-3" />
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
                <Plug className="w-2.5 h-2.5" />
                <span className="hidden min-[420px]:inline ml-1">Connect</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
