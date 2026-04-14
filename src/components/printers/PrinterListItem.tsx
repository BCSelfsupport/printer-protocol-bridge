import { useState, useRef } from 'react';
import { Printer as PrinterIcon, Wifi, WifiOff, Droplets, Palette, FileText, Plug, Settings2, Crown, Link, Filter, Calendar, Check, X } from 'lucide-react';
import { getFilterStatus } from '@/lib/filterTracker';
import { parseStreamHoursToNumber } from '@/components/consumables/ConsumablePredictions';
import { Printer } from '@/types/printer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  /** Callback to open broadcast dialog for this master */
  onBroadcast?: () => void;
  /** Stream hours string from metrics for filter gauge */
  streamHours?: string;
  /** Master's current message name — slaves display this instead of their own */
  masterMessage?: string;
  /** Callback when expiry offset is changed on this printer */
  onExpiryChange?: (printerId: number, days: number) => void;
  /** Whether an expiry update is in progress for this printer */
  isUpdatingExpiry?: boolean;
  /** Original expiry days from the message definition (fallback when no per-printer override) */
  messageExpiryDays?: number;
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
  onBroadcast,
  streamHours,
  masterMessage,
  onExpiryChange,
  isUpdatingExpiry = false,
  messageExpiryDays,
}: PrinterListItemProps) {
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [expiryInput, setExpiryInput] = useState('');
  const expiryInputRef = useRef<HTMLInputElement>(null);
  // Prefer the printer's own current message; only fall back to master's message for slaves with no local value
  const displayMessage = printer.currentMessage ?? ((printer.role === 'slave' && masterMessage) ? masterMessage : undefined);
  
  // Filter status for this printer
  const pumpHours = streamHours ? parseStreamHoursToNumber(streamHours) : null;
  const filterSt = pumpHours != null ? getFilterStatus(printer.id, pumpHours) : null;
  const getFilterColor = () => {
    if (!filterSt) return 'text-muted-foreground';
    if (filterSt.hoursRemaining <= 200) return filterSt.status === 'critical' ? 'text-destructive' : 'text-warning';
    return 'text-success';
  };
  const filterLabel = filterSt ? `${filterSt.hoursRemaining.toFixed(0)}h` : '?';

  // Expiry offset badge - only show for printers in a sync group
  const showExpiryBadge = syncGroupIndex !== undefined && syncGroupIndex >= 0 && onExpiryChange && printer.isAvailable;
  const currentOffset = printer.expiryOffsetDays ?? messageExpiryDays ?? 0;
  const isCustomExpiry = printer.expiryOffsetDays !== undefined && messageExpiryDays !== undefined && printer.expiryOffsetDays !== messageExpiryDays;

  const handleExpiryBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUpdatingExpiry) return;
    setExpiryInput(currentOffset.toString());
    setEditingExpiry(true);
    setTimeout(() => expiryInputRef.current?.focus(), 50);
  };

  const handleExpirySubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const days = parseInt(expiryInput, 10);
    if (!isNaN(days) && days >= 0 && days !== currentOffset) {
      onExpiryChange!(printer.id, days);
    }
    setEditingExpiry(false);
  };

  const handleExpiryCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingExpiry(false);
  };

  const handleExpiryKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setEditingExpiry(false);
    }
  };
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
        className={`w-full text-left p-2.5 rounded-xl transition-all border ${groupBorderClass} ${
          isConnected
            ? 'bg-success/20 border-success ring-2 ring-success/30'
            : isSelected 
              ? 'bg-primary/20 border-primary' 
              : groupColor
                ? `${groupColor.bg} border-slate-700/50 hover:bg-slate-700/60 hover:border-slate-600`
                : 'bg-slate-800/60 border-slate-700/50 hover:bg-slate-700/60 hover:border-slate-600'
        }`}
      >
        <div className="flex items-start gap-2.5">
          {/* Status indicator - clickable for edit */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
            className={`relative w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:ring-2 hover:ring-primary/50 ${
              printer.isAvailable ? 'bg-success/20 hover:bg-success/30' : 'bg-muted hover:bg-muted/80'
            }`}
            title="Click to edit printer"
          >
            <PrinterIcon className={`w-5 h-5 ${
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
              <span className={`font-bold truncate text-sm ${textColor}`}>{printer.name}</span>
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
            <div className={`text-xs font-mono truncate ${subTextColor}`}>
              {printer.ipAddress}:{printer.port}
            </div>
            
            {/* Message name with print count */}
            {displayMessage && (
              <div className={`mt-1 text-xs ${subTextColor}`}>
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="font-medium truncate">{displayMessage}</span>
                </div>
                {printer.printCount !== undefined && (
                  <div className="ml-6 mt-0.5">
                    PRINTS: <span className="font-semibold">{printer.printCount.toString().padStart(7, '0')}</span>
                  </div>
                )}
                {/* Expiry offset badge */}
                {showExpiryBadge && (
                  <div className="mt-1">
                    {editingExpiry ? (
                      <form onSubmit={handleExpirySubmit} className="flex items-center gap-1.5 bg-slate-900 border border-amber-400/50 rounded px-2 py-1">
                        <Calendar className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <Input
                          ref={expiryInputRef}
                          type="number"
                          min={0}
                          value={expiryInput}
                          onChange={e => setExpiryInput(e.target.value)}
                          onKeyDown={handleExpiryKeyDown}
                          onFocus={e => e.target.select()}
                          className="w-14 h-6 text-sm text-center px-1 py-0 bg-slate-800 border-amber-400/60 text-white font-bold"
                          disabled={isUpdatingExpiry}
                        />
                        <span className="text-xs text-slate-300">days</span>
                        <button type="submit" className="p-0.5 text-success hover:text-success/80"><Check className="w-4 h-4" /></button>
                        <button type="button" onClick={handleExpiryCancel} className="p-0.5 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
                      </form>
                    ) : (
                      <button
                        onClick={handleExpiryBadgeClick}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${
                          isUpdatingExpiry
                            ? 'bg-amber-500/20 text-amber-300 animate-pulse'
                            : 'bg-slate-900/80 text-amber-300 hover:bg-slate-800 border border-amber-400/30 hover:border-amber-400/60'
                        }`}
                        disabled={isUpdatingExpiry}
                      >
                        <Calendar className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-sm font-bold">{currentOffset}</span>
                        <span className="text-[11px] text-amber-300/70">day expiry</span>
                        {isCustomExpiry && <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold ml-1">CUSTOM</span>}
                        {isUpdatingExpiry && <span className="ml-1 text-[10px]">...</span>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Fluid levels */}
            {(printer.inkLevel || printer.makeupLevel) && (
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1" title={`Ink: ${printer.inkLevel || 'Unknown'}`}>
                  <Palette className={`w-3.5 h-3.5 ${getFluidColor(printer.inkLevel)}`} />
                  <span className={`text-[10px] font-semibold ${getFluidColor(printer.inkLevel)}`}>
                    {printer.inkLevel || '?'}
                  </span>
                </div>
                <div className="flex items-center gap-1" title={`Makeup: ${printer.makeupLevel || 'Unknown'}`}>
                  <Droplets className={`w-3.5 h-3.5 ${getFluidColor(printer.makeupLevel)}`} />
                  <span className={`text-[10px] font-semibold ${getFluidColor(printer.makeupLevel)}`}>
                    {printer.makeupLevel || '?'}
                  </span>
                </div>
                {filterSt && (
                  <div className="flex items-center gap-1" title={`Filter: ${filterLabel}`}>
                    <Filter className={`w-3.5 h-3.5 ${getFilterColor()}`} />
                    <span className={`text-[10px] font-semibold ${getFilterColor()}`}>
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
          </div>
        </div>
      </button>
    );
  }

  // Full mode – rebuilt to prevent right-side clipping
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
      {/* Top row: icon + name/ip + status badge */}
      <div className="flex items-center gap-2">
        {/* Status indicator - clickable for edit */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          className={`relative w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:ring-2 hover:ring-primary/50 ${
            printer.isAvailable ? 'bg-success/20 hover:bg-success/30' : 'bg-muted hover:bg-muted/80'
          }`}
          title="Click to edit printer"
        >
          <PrinterIcon className={`w-5 h-5 ${
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

        {/* Name + IP */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`font-bold truncate text-sm ${textColor}`}>{printer.name}</span>
            {printer.role === 'master' && (
              <span className={`text-[9px] px-1 py-0.5 rounded font-semibold flex items-center gap-0.5 whitespace-nowrap flex-shrink-0 ${groupColor?.badge ?? 'bg-amber-500/20 text-amber-400'}`}>
                <Crown className="w-2.5 h-2.5" />
              </span>
            )}
            {printer.role === 'slave' && (
              <span className={`text-[9px] px-1 py-0.5 rounded font-semibold flex items-center gap-0.5 whitespace-nowrap flex-shrink-0 ${groupColor?.badge ?? 'bg-blue-500/20 text-blue-400'}`}>
                <Link className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
          <div className={`text-xs font-mono ${subTextColor}`}>
            {printer.ipAddress}:{printer.port}
          </div>
        </div>

        {/* Status badge */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {(() => {
            const badge = getStatusBadge();
            return (
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap",
                badge.className
              )}>
                {badge.label}
              </span>
            );
          })()}
          {printer.hasActiveErrors && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-destructive text-white font-medium whitespace-nowrap">
              WARNING
            </span>
          )}
        </div>
      </div>

      {/* Message + print count row */}
      {displayMessage && (
        <div className={`mt-1.5 ml-12 text-xs ${subTextColor}`}>
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium truncate">{displayMessage}</span>
          </div>
          {printer.printCount !== undefined && (
            <div className="ml-5 mt-0.5">
              PRINTS: <span className="font-semibold">{printer.printCount.toString().padStart(7, '0')}</span>
            </div>
          )}
          {showExpiryBadge && (
            <div className="mt-1">
              {editingExpiry ? (
                <form onSubmit={handleExpirySubmit} className="flex items-center gap-1.5 bg-slate-900 border border-amber-400/50 rounded px-2 py-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <Input
                    ref={expiryInputRef}
                    type="number"
                    min={0}
                    value={expiryInput}
                    onChange={e => setExpiryInput(e.target.value)}
                    onKeyDown={handleExpiryKeyDown}
                    onFocus={e => e.target.select()}
                    className="w-14 h-6 text-sm text-center px-1 py-0 bg-slate-800 border-amber-400/60 text-white font-bold"
                    disabled={isUpdatingExpiry}
                  />
                  <span className="text-xs text-slate-300">days</span>
                  <button type="submit" className="p-0.5 text-success hover:text-success/80"><Check className="w-4 h-4" /></button>
                  <button type="button" onClick={handleExpiryCancel} className="p-0.5 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
                </form>
              ) : (
                <button
                  onClick={handleExpiryBadgeClick}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${
                    isUpdatingExpiry
                      ? 'bg-amber-500/20 text-amber-300 animate-pulse'
                      : 'bg-slate-900/80 text-amber-300 hover:bg-slate-800 border border-amber-400/30 hover:border-amber-400/60'
                  }`}
                  disabled={isUpdatingExpiry}
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-sm font-bold">{currentOffset}</span>
                  <span className="text-[11px] text-amber-300/70">day expiry</span>
                  {isCustomExpiry && <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold ml-1">CUSTOM</span>}
                  {isUpdatingExpiry && <span className="ml-1 text-[10px]">...</span>}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fluid levels + actions row */}
      {(printer.inkLevel || printer.makeupLevel || (printer.isAvailable && onService) || showConnectButton) && (
        <div className="flex items-center justify-between mt-1.5 ml-12">
          <div className="flex items-center gap-3">
            {(printer.inkLevel || printer.makeupLevel) && (
              <>
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
              </>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
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
                className="h-6 text-[10px] px-2 bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70"
              >
                <Plug className="w-2.5 h-2.5" />
                <span className="hidden min-[420px]:inline ml-1">Connect</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
