import { Printer as PrinterIcon, Plus, Trash2, RefreshCw, Shield, Server, GripVertical, Package, BarChart3, Lock, Radio, Link2, ChevronDown, Maximize2, DownloadCloud } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Printer, PrinterStatus, PrinterMetrics } from '@/types/printer';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PrinterListItem } from '@/components/printers/PrinterListItem';
import { AddPrinterDialog } from '@/components/printers/AddPrinterDialog';
import { EditPrinterDialog } from '@/components/printers/EditPrinterDialog';
import { PrinterServicePopup } from '@/components/printers/PrinterServicePopup';
import { BroadcastMessageDialog } from '@/components/printers/BroadcastMessageDialog';
import { ApplyExpiryToPrintersDialog } from '@/components/printers/ApplyExpiryToPrintersDialog';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dashboard } from '@/components/screens/Dashboard';
import { MessageDetails } from '@/components/screens/EditMessageScreen';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLicense } from '@/contexts/LicenseContext';
import { useTwinPair } from '@/twin-code/twinPairStore';
import { TwinCodeView } from '@/twin-code/components/TwinCodeView';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


import { NavItem } from '@/components/layout/BottomNav';

interface PrintersScreenProps {
  printers: Printer[];
  onConnect: (printer: Printer) => void;
  onHome: () => void;
  onAddPrinter: (printer: { name: string; ipAddress: string; port: number }) => void;
  onRemovePrinter: (printerId: number) => void;
  onReorderPrinters?: (printers: Printer[]) => void;
  onUpdatePrinter?: (printerId: number, updates: Partial<Printer>) => void;
  onQueryPrinterMetrics?: (printer: Printer) => Promise<PrinterMetrics | null>;
  isDevSignedIn?: boolean;
  onDevSignIn?: () => void;
  onDevSignOut?: () => void;
  // Dashboard props for split-view on desktop
  isConnected?: boolean;
  connectedPrinter?: Printer | null;
  status?: PrinterStatus | null;
  onStart?: () => void;
  onStop?: () => void;
  onJetStop?: () => void;
  onHvOn?: () => void;
  onHvOff?: () => void;
  onNewMessage?: () => void;
  onEditMessage?: () => void;
  onSignIn?: () => void;
  onHelp?: () => void;
  onResetCounter?: (counterId: number, value: number) => void;
  onResetAllCounters?: () => void;
  onQueryCounters?: () => void;
  isSignedIn?: boolean;
  countdownSeconds?: number | null;
  countdownType?: 'starting' | 'stopping' | null;
  messageContent?: MessageDetails;
  onControlMount?: () => void;
  onControlUnmount?: () => void;
  // Bottom nav props
  onNavigate?: (item: NavItem) => void;
  onTurnOff?: () => void;
  // Master/Slave sync - per master
  onSyncMaster?: (masterId: number) => void;
  // Broadcast message to all slaves
  onBroadcastMessage?: (masterId: number, messageName: string, slaveValues: { printerId: number; userDefineValue: string }[], userDefineFieldNum?: number) => Promise<void>;
  getSlavesForMaster?: (masterId: number) => Printer[];
  connectedMessages?: { id: number; name: string }[];
  // Optional content to render in the right panel instead of Dashboard
  rightPanelContent?: React.ReactNode;
  // Per-printer countdown lookup
  getCountdown?: (printerId: number) => { seconds: number | null; type: 'starting' | 'stopping' | null };
  // Navigation to Consumables / Reports
  onConsumables?: () => void;
  onReports?: () => void;
  lowStockCount?: number;
  /** Metrics for the connected printer (for filter gauge) */
  connectedMetrics?: PrinterMetrics | null;
  /** Open license activation dialog */
  onLicense?: () => void;
  /** Trigger a manual network refresh */
  onRefreshNetwork?: () => void;
  /** Whether a network check is in progress */
  isCheckingNetwork?: boolean;
  /** Pull current adjust settings from every online printer back into stored messages */
  onSyncAdjustFromPrinters?: () => void;
  onSyncAdjustFromPrinter?: (printer: Printer) => void;
  isSyncingAdjustFromPrinters?: boolean;
  /** Called when a printer's expiry offset is changed — resends the message with new expiry */
  onSlaveExpiryChange?: (printerId: number, days: number) => Promise<void>;
  onSelectedPrinterChange?: (printer: Printer | null) => void;
  /** Look up stored/hardcoded message content by name for a specific printer */
  getMessageContent?: (name: string, printerId?: number) => MessageDetails | null;
  /** Reset all group expiry offsets back to message default and re-sync */
  onResetGroupExpiry?: (masterId: number) => void;
}

// Sortable wrapper for PrinterListItem
function SortablePrinterItem({
  printer,
  isSelected,
  onSelect,
  onConnect,
  onEdit,
  onService,
  showConnectButton,
  isConnected,
  compact,
  countdownType,
  countdownSeconds,
  isMobile,
  syncGroupIndex,
  slaveCount,
  onSync,
  onBroadcast,
  streamHours,
  masterMessage,
  onExpiryChange,
  isUpdatingExpiry,
  messageExpiryDays,
  onOpenExpiryDialog,
  twinPairRole,
  hideDragHandle,
  onRotationChange,

}: {
  printer: Printer;
  isSelected: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onEdit: () => void;
  onService: () => void;
  showConnectButton: boolean;
  isConnected: boolean;
  compact: boolean;
  countdownType?: 'starting' | 'stopping' | null;
  countdownSeconds?: number | null;
  isMobile: boolean;
  syncGroupIndex?: number;
  slaveCount?: number;
  onSync?: () => void;
  onBroadcast?: () => void;
  streamHours?: string;
  masterMessage?: string;
  onExpiryChange?: (printerId: number, days: number) => void;
  isUpdatingExpiry?: boolean;
  messageExpiryDays?: number;
  onOpenExpiryDialog?: (sourcePrinter: Printer, currentDays: number) => void;
  twinPairRole?: 'A' | 'B' | null;
  hideDragHandle?: boolean;
  onRotationChange?: (printerId: number, rotation: NonNullable<Printer['rotation']>) => void;
}) {

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: printer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group select-none">
      {/* Drag handle — hidden for bound-pair members (Lid/Side roles are
          managed via the Bind dialog, not by reordering). */}
      {!hideDragHandle && (
        <div
          {...attributes}
          {...listeners}
          className={
            "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 z-10 transition-opacity cursor-grab active:cursor-grabbing p-1 rounded touch-none select-none " +
            (isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100")
          }
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <PrinterListItem
        printer={printer}
        isSelected={isSelected}
        onSelect={onSelect}
        onConnect={onConnect}
        onEdit={onEdit}
        onService={onService}
        showConnectButton={showConnectButton}
        isConnected={isConnected}
        compact={compact}
        countdownType={countdownType}
        countdownSeconds={countdownSeconds}
        syncGroupIndex={syncGroupIndex}
        slaveCount={slaveCount}
        onSync={onSync}
        onBroadcast={onBroadcast}
        streamHours={streamHours}
        masterMessage={masterMessage}
        onExpiryChange={onExpiryChange}
        isUpdatingExpiry={isUpdatingExpiry}
        messageExpiryDays={messageExpiryDays}
        onOpenExpiryDialog={onOpenExpiryDialog}
        twinPairRole={twinPairRole}
        onRotationChange={onRotationChange}
      />
    </div>
  );
}


export function PrintersScreen({
  printers,
  onConnect,
  onHome,
  onAddPrinter,
  onRemovePrinter,
  onReorderPrinters,
  onUpdatePrinter,
  onQueryPrinterMetrics,
  isDevSignedIn = false,
  onDevSignIn,
  onDevSignOut,
  // Dashboard props
  isConnected = false,
  connectedPrinter,
  status,
  onStart,
  onStop,
  onJetStop,
  onHvOn,
  onHvOff,
  onNewMessage,
  onEditMessage,
  onSignIn,
  onHelp,
  onResetCounter,
  onResetAllCounters,
  onQueryCounters,
  isSignedIn = false,
  countdownSeconds,
  countdownType,
  messageContent,
  onControlMount,
  onControlUnmount,
  onNavigate,
  onTurnOff,
  onSyncMaster,
  onBroadcastMessage,
  getSlavesForMaster,
  connectedMessages = [],
  rightPanelContent,
  getCountdown,
  onConsumables,
  onReports,
  lowStockCount = 0,
  connectedMetrics,
  onLicense,
  onRefreshNetwork,
  isCheckingNetwork = false,
  onSyncAdjustFromPrinters,
  onSyncAdjustFromPrinter,
  isSyncingAdjustFromPrinters = false,
  onSlaveExpiryChange,
  onSelectedPrinterChange,
  getMessageContent,
  onResetGroupExpiry,
}: PrintersScreenProps) {
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [printerToEdit, setPrinterToEdit] = useState<Printer | null>(null);
  const [servicePopupOpen, setServicePopupOpen] = useState(false);
  const [servicePrinter, setServicePrinter] = useState<Printer | null>(null);
  const [broadcastDialogOpen, setBroadcastDialogOpen] = useState(false);
  const [broadcastMaster, setBroadcastMaster] = useState<Printer | null>(null);
  const [expandedGridOpen, setExpandedGridOpen] = useState(false);
  const [updatingExpiryPrinterId, setUpdatingExpiryPrinterId] = useState<number | null>(null);
  const [expiryDialogSource, setExpiryDialogSource] = useState<Printer | null>(null);
  const [expiryDialogCurrentDays, setExpiryDialogCurrentDays] = useState<number>(0);
  const [devTaps, setDevTaps] = useState<number[]>([]);
  const devTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useIsMobile();
  const { canNetwork, canDatabase, canTwinCode, tier, isActivated, isDeveloper } = useLicense();
  const navigate = useNavigate();
  const twinPair = useTwinPair();

  // TwinCode pair resolution: match the bound IPs back to actual Printer records.
  const pairPrinters = useMemo(() => {
    if (!canTwinCode || !twinPair.a || !twinPair.b) return null;
    const a = printers.find(p => p.ipAddress === twinPair.a!.ip);
    const b = printers.find(p => p.ipAddress === twinPair.b!.ip);
    if (!a || !b) return null;
    return { a, b };
  }, [canTwinCode, twinPair.a, twinPair.b, printers]);

  // When a TwinCode pair is selected, the right pane swaps to the embedded TwinCode view.
  const [pairSelected, setPairSelected] = useState(false);
  const [pairExpanded, setPairExpanded] = useState(true);

  // Lite tier: only show the first printer
  const visiblePrinters = tier === 'lite' ? printers.slice(0, 1) : printers;

  // Compute sync group color index for each printer
  // Each master gets a unique index; its slaves share the same index
  const syncGroupMap = useMemo(() => {
    const map = new Map<number, number>();
    let groupIdx = 0;
    // First pass: assign indices to masters
    printers.forEach(p => {
      if (p.role === 'master') {
        map.set(p.id, groupIdx);
        groupIdx++;
      }
    });
    // Second pass: slaves inherit their master's index
    printers.forEach(p => {
      if (p.role === 'slave' && p.masterId !== undefined) {
        const masterIdx = map.get(p.masterId);
        if (masterIdx !== undefined) {
          map.set(p.id, masterIdx);
        }
      }
    });
    return map;
  }, [printers]);

  // Compute slave count per master
  // Count only AVAILABLE slaves per master (matches actual sync behavior)
  const slaveCountMap = useMemo(() => {
    const map = new Map<number, number>();
    printers.forEach(p => {
      if (p.role === 'slave' && p.masterId !== undefined && p.isAvailable) {
        map.set(p.masterId, (map.get(p.masterId) ?? 0) + 1);
      }
    });
    return map;
  }, [printers]);

  const effectiveMessageContent = useMemo(() => {
    // If the selected printer is the connected printer, use the live message content
    if (selectedPrinter?.id === connectedPrinter?.id) {
      return messageContent;
    }

    // For slaves of the connected master: only reuse the master's live messageContent
    // when the slave is actually selected on the SAME message as the master. Otherwise
    // we'd render the master's preview under a slave sitting on a different message.
    if (
      selectedPrinter?.role === 'slave' &&
      connectedPrinter?.role === 'master' &&
      selectedPrinter.masterId === connectedPrinter.id &&
      selectedPrinter.currentMessage &&
      messageContent?.name &&
      selectedPrinter.currentMessage.trim().toUpperCase() === messageContent.name.trim().toUpperCase()
    ) {
      return messageContent;
    }

    // For other printers, look up from storage
    if (selectedPrinter?.currentMessage && getMessageContent) {
      const masterCopy = connectedPrinter
        ? getMessageContent(selectedPrinter.currentMessage, connectedPrinter.id) ?? undefined
        : undefined;
      if (masterCopy) return masterCopy;
      return getMessageContent(selectedPrinter.currentMessage) ?? undefined;
    }

    return messageContent;
  }, [selectedPrinter?.id, selectedPrinter?.currentMessage, selectedPrinter?.role, selectedPrinter?.masterId, connectedPrinter?.id, connectedPrinter?.role, messageContent, getMessageContent]);

  // True only when the operator is actively viewing the printer that owns
  // the live polling session. All "live" props (status object, countdown,
  // streamHours, model, etc.) belong to the connected printer — when the
  // user clicks a different card those values must NOT bleed into its panel
  // (see mem://core: only one telnet session per printer at a time).
  const isViewingConnected =
    !!connectedPrinter && !!selectedPrinter && selectedPrinter.id === connectedPrinter.id;

  const effectiveDashboardStatus = useMemo(() => {
    if (!selectedPrinter) return status ?? null;

    if (!isViewingConnected) {
      // Synthesize a minimal status from the selected printer's per-card
      // fields populated by the background poller. Critically: clear
      // `isRunning` so the green "Ready" banner / red "Starting..." banner
      // (driven by Dashboard's `isHvOn = status.isRunning`) doesn't render
      // the connected printer's HV state under the wrong card.
      return {
        ...(status ?? {}),
        isRunning: false,
        // jetRunning belongs to the live (connected) printer — clearing it
        // here prevents the Start button from being disabled under a printer
        // we're only viewing, and prevents the Stop button from being
        // enabled under a printer that isn't actually running.
        jetRunning: false,
        isReady: selectedPrinter.status === 'ready',
        hasActiveErrors: selectedPrinter.status === 'error',
        currentMessage: selectedPrinter.currentMessage ?? null,
      } as typeof status;
    }

    return {
      ...status!,
      currentMessage: selectedPrinter.currentMessage ?? status!.currentMessage,
    };
  }, [selectedPrinter, status, isViewingConnected]);

  // Build a map: slavePrinterId -> master's currentMessage
  const masterMessageMap = useMemo(() => {
    const map = new Map<number, string>();
    const masters = printers.filter(p => p.role === 'master');
    masters.forEach(master => {
      if (master.currentMessage) {
        // All slaves of this master get the master's message
        printers.forEach(p => {
          if (p.role === 'slave' && p.masterId === master.id) {
            map.set(p.id, master.currentMessage!);
          }
        });
      }
    });
    return map;
  }, [printers]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Update selected printer when printers list changes
  useEffect(() => {
    if (printers.length > 0 && !selectedPrinter) {
      setSelectedPrinter(printers[0]);
    } else if (selectedPrinter) {
      // Update selected printer data if it exists in the list
      const updated = printers.find(p => p.id === selectedPrinter.id);
      if (updated) {
        setSelectedPrinter(updated);
      } else {
        setSelectedPrinter(printers[0] || null);
      }
    }
  }, [printers]);

  // When connected printer changes, select it in the list
  useEffect(() => {
    if (connectedPrinter) {
      setSelectedPrinter(connectedPrinter);
    }
  }, [connectedPrinter?.id]);

  useEffect(() => {
    onSelectedPrinterChange?.(selectedPrinter);
  }, [selectedPrinter, onSelectedPrinterChange]);

  const handlePrinterClick = (printer: Printer) => {
    setSelectedPrinter(printer);
    // Selecting an individual printer deselects any active TwinCode pair so the dashboard takes over.
    setPairSelected(false);
    // Auto-switch foreground TCP focus to the clicked printer so Start/Stop
    // and other commands target what the operator is looking at. The Electron
    // main process keeps a persistent socket open per printer, so this is
    // effectively a cheap focus swap — not a fresh telnet handshake.
    // Skip if it's already the foreground printer or if it's offline.
    if (printer.isAvailable && printer.id !== connectedPrinter?.id) {
      onConnect?.(printer);
    }
  };

  const handleRemoveSelected = () => {
    if (selectedPrinter) {
      onRemovePrinter(selectedPrinter.id);
    }
  };

  const handleEditPrinter = (printer: Printer) => {
    setPrinterToEdit(printer);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = (printerId: number, updates: { name: string; ipAddress: string; port: number; role?: import('@/types/printer').PrinterRole; masterId?: number; serialNumber?: string; lineId?: string; rotation?: import('@/types/printer').Printer['rotation'] }) => {
    onUpdatePrinter?.(printerId, updates);
  };


  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = printers.findIndex((p) => p.id === active.id);
      const newIndex = printers.findIndex((p) => p.id === over.id);

      const reordered = arrayMove(printers, oldIndex, newIndex);
      onReorderPrinters?.(reordered);
    }
  };

  const handleOpenService = (printer: Printer) => {
    setServicePrinter(printer);
    setServicePopupOpen(true);
  };

  // Desktop shows split-view with Dashboard when connected (or rightPanelContent override)
  // Pair-selected on a TwinCode license takes priority over dashboard / external rightPanelContent.
  const showTwinCodePanel = !isMobile && pairSelected && !!pairPrinters;
  const showDashboardInPanel = !isMobile && isConnected && connectedPrinter && !showTwinCodePanel;
  const showRightPanel = showTwinCodePanel || showDashboardInPanel || (!isMobile && rightPanelContent);

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 md:p-4 gap-3 md:gap-4 overflow-y-auto md:overflow-hidden">
      {/* Left Panel - Printer List (narrower on desktop when showing Dashboard) */}
      <div className={`w-full md:w-[28%] md:max-w-[400px] md:min-w-[320px] flex-shrink-0 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 overflow-visible md:overflow-hidden`}>
        {/* Header */}
        <div className="p-3 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <PrinterIcon className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-white text-sm truncate">Network Printers</h2>
                <p className="text-[10px] text-slate-400">{visiblePrinters.length} device{visiblePrinters.length !== 1 ? 's' : ''} • drag to reorder</p>
              </div>
            </div>
            <Button
              onClick={() => setExpandedGridOpen(true)}
              size="sm"
              variant="outline"
              className="h-8 px-2 border-slate-500 text-white bg-slate-700/50 hover:bg-slate-600 hover:text-white flex-shrink-0"
              title="Expand printers to full-screen grid"
              aria-label="Expand printers to full-screen grid"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          
          {/* Consumables & Reports navigation */}
          <div className="flex gap-2 mb-2">
            <Button
              onClick={onConsumables}
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs border-slate-500 text-white bg-slate-700/50 hover:bg-slate-600 hover:text-white"
            >
              <Package className="w-3 h-3 mr-1" />
              Consumables
              {lowStockCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
                  {lowStockCount}
                </span>
              )}
            </Button>
            <Button
              onClick={onReports}
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs border-slate-500 text-white bg-slate-700/50 hover:bg-slate-600 hover:text-white"
            >
              <BarChart3 className="w-3 h-3 mr-1" />
              Reports
            </Button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const isLiteMaxed = tier === 'lite' && printers.length >= 1;
                const isBlocked = !canNetwork || isLiteMaxed || tier === 'demo';
                if (!isBlocked) setAddDialogOpen(true);
              }}
              size="sm"
              className="flex-1 bg-primary hover:bg-primary/90 h-8 text-xs"
              disabled={!canNetwork || (tier === 'lite' && visiblePrinters.length >= 1) || tier === 'demo'}
              title={
                tier === 'demo' ? 'Adding printers is not available in DEMO mode'
                : !canNetwork ? 'Network access requires FULL or DATABASE license' 
                : tier === 'lite' && visiblePrinters.length >= 1 ? 'LITE license supports 1 printer only'
                : undefined
              }
            >
              {!canNetwork || (tier === 'lite' && visiblePrinters.length >= 1) || tier === 'demo' ? <Lock className="w-3 h-3 mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
              Add
            </Button>
            {onRefreshNetwork && (
              <Button
                onClick={onRefreshNetwork}
                size="sm"
                variant="outline"
                className="border-slate-500 text-white bg-slate-700/50 hover:bg-slate-600 hover:text-white h-8"
                disabled={isCheckingNetwork}
                title="Refresh network status"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingNetwork ? 'animate-spin' : ''}`} />
              </Button>
            )}
            {onSyncAdjustFromPrinters && (
              <Button
                onClick={onSyncAdjustFromPrinters}
                size="sm"
                variant="outline"
                className="border-amber-400/50 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 hover:text-amber-100 h-8"
                disabled={isSyncingAdjustFromPrinters}
                title="Pull current Width/Speed/Delay/Bold/Gap/Pitch from every printer into stored messages"
              >
                <DownloadCloud className={`w-3 h-3 mr-1 ${isSyncingAdjustFromPrinters ? 'animate-pulse' : ''}`} />
                <span className="text-xs">{isSyncingAdjustFromPrinters ? 'Syncing…' : 'Sync Adjust'}</span>
              </Button>
            )}
            {onSyncAdjustFromPrinter && selectedPrinter && selectedPrinter.isAvailable && (
              <Button
                onClick={() => onSyncAdjustFromPrinter(selectedPrinter)}
                size="sm"
                variant="outline"
                className="border-emerald-400/50 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 hover:text-emerald-100 h-8 px-2"
                disabled={isSyncingAdjustFromPrinters}
                title={`Sync Adjust from ${selectedPrinter.name} — pull current Width/Speed/Delay/Bold/Gap/Pitch into its stored message`}
                aria-label={`Sync Adjust from ${selectedPrinter.name}`}
              >
                <DownloadCloud className={`w-3.5 h-3.5 ${isSyncingAdjustFromPrinters ? 'animate-pulse' : ''}`} />
              </Button>
            )}
            {selectedPrinter && (
              <Button
                onClick={handleRemoveSelected}
                size="sm"
                variant="outline"
                className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 h-8"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Printer List with ScrollArea */}
        <ScrollArea className="flex-1">
          <div className="p-2 pr-3 space-y-2">
            {(() => {
              // Compute msgExpiry (days) for a given printer using the same lookup
              // rules as the list renderer. Returns undefined when the current
              // message has no expiry field.
              const getMsgExpiry = (printer: Printer): number | undefined => {
                const msgName = printer.currentMessage || masterMessageMap.get(printer.id);
                const msgContent = msgName && getMessageContent
                  ? (getMessageContent(msgName, printer.id)
                    || (printer.masterId ? getMessageContent(msgName, printer.masterId) : null)
                    || (connectedPrinter ? getMessageContent(msgName, connectedPrinter.id) : null)
                    || getMessageContent(msgName))
                  : null;
                const expiryField = msgContent?.fields?.find(f => (
                  f.type === 'date' && (
                    f.autoCodeFieldType?.startsWith('date_expiry')
                    || (f.autoCodeExpiryDays ?? 0) > 0
                  )
                ));
                return expiryField ? (expiryField.autoCodeExpiryDays ?? 0) : undefined;
              };

              const openExpiryDialog = (sourcePrinter: Printer, currentDays: number) => {
                setExpiryDialogSource(sourcePrinter);
                setExpiryDialogCurrentDays(currentDays);
              };

              // Render a single printer item — used both inside the bound-pair group
              // and in the main DnD list, so we don't duplicate the long prop list.
              const renderPrinterItem = (printer: Printer, opts?: { hideDragHandle?: boolean }) => {
                const msgExpiry = getMsgExpiry(printer);
                return (
                  <SortablePrinterItem
                    key={printer.id}
                    hideDragHandle={opts?.hideDragHandle}
                    printer={printer}
                    isSelected={selectedPrinter?.id === printer.id}
                    onSelect={() => handlePrinterClick(printer)}
                    onConnect={() => onConnect(printer)}
                    onEdit={() => handleEditPrinter(printer)}
                    onService={() => handleOpenService(printer)}
                    showConnectButton={!showRightPanel}
                    isConnected={connectedPrinter?.id === printer.id}
                    compact={!!showRightPanel}
                    countdownType={getCountdown ? getCountdown(printer.id).type : (connectedPrinter?.id === printer.id ? countdownType : null)}
                    countdownSeconds={getCountdown ? getCountdown(printer.id).seconds : (connectedPrinter?.id === printer.id ? countdownSeconds : null)}
                    isMobile={isMobile}
                    syncGroupIndex={syncGroupMap.get(printer.id)}
                    slaveCount={printer.role === 'master' ? slaveCountMap.get(printer.id) ?? 0 : undefined}
                    onSync={printer.role === 'master' && onSyncMaster ? () => onSyncMaster(printer.id) : undefined}
                    onBroadcast={printer.role === 'master' && onBroadcastMessage ? () => {
                      setBroadcastMaster(printer);
                      setBroadcastDialogOpen(true);
                    } : undefined}
                    streamHours={connectedPrinter?.id === printer.id ? connectedMetrics?.streamHours : undefined}
                    masterMessage={masterMessageMap.get(printer.id)}
                    onExpiryChange={onSlaveExpiryChange ? async (printerId, days) => {
                      setUpdatingExpiryPrinterId(printerId);
                      try {
                        await onSlaveExpiryChange(printerId, days);
                      } finally {
                        setUpdatingExpiryPrinterId(null);
                      }
                    } : undefined}
                    isUpdatingExpiry={updatingExpiryPrinterId === printer.id}
                    messageExpiryDays={msgExpiry}
                    onOpenExpiryDialog={onSlaveExpiryChange ? openExpiryDialog : undefined}
                    twinPairRole={
                      pairPrinters && pairPrinters.a.id === printer.id ? 'A'
                      : pairPrinters && pairPrinters.b.id === printer.id ? 'B'
                      : null
                    }
                    onRotationChange={onUpdatePrinter ? (id, rot) => onUpdatePrinter(id, { rotation: rot }) : undefined}
                  />

                );
              };


              const pairIds = new Set<number>();
              if (pairPrinters) {
                pairIds.add(pairPrinters.a.id);
                pairIds.add(pairPrinters.b.id);
              }
              const nonPairPrinters = visiblePrinters.filter(p => !pairIds.has(p.id));

              return (
                <>
                  {/* TwinCode Bound Pair — strong-bordered collapsible group containing the
                      pair header card AND its two member printer cards. */}
                  {pairPrinters && (
                    <div className="rounded-xl border-2 border-emerald-500/60 bg-gradient-to-b from-emerald-500/5 to-blue-500/5 shadow-lg shadow-emerald-500/10 overflow-hidden">
                      <div className={`transition-colors ${pairSelected ? 'bg-gradient-to-r from-blue-500/15 via-emerald-500/10 to-emerald-500/15' : ''}`}>
                        <div className="flex items-stretch">
                          {/* Pair header — clicking the body selects the pair (opens TwinCode workspace). */}
                          <button
                            type="button"
                            onClick={() => setPairSelected(true)}
                            className="flex-1 text-left p-3 hover:bg-slate-800/30 transition-colors"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500/30 to-emerald-500/30 flex items-center justify-center flex-shrink-0">
                                <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-1 leading-none">
                                  <span className="text-xs font-bold italic text-blue-400">Twin</span>
                                  <span className="text-xs font-bold italic text-emerald-400">Code</span>
                                  <span className="text-[8px] text-slate-500">™</span>
                                  <span className="ml-1 text-[10px] text-slate-400">Bound Pair</span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                                  {pairPrinters.a.name} ↔ {pairPrinters.b.name}
                                </div>
                              </div>
                              {pairSelected && (
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400 flex-shrink-0">Active</span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                              <div className={`rounded px-2 py-1 border flex items-center gap-1.5 ${pairPrinters.a.isAvailable ? 'border-blue-500/40 bg-blue-500/10 text-blue-200' : 'border-slate-700 bg-slate-900/50 text-slate-500'}`}>
                                <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">A</span>
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold leading-tight">Lid · {pairPrinters.a.name}</div>
                                  <div className="font-mono leading-tight opacity-80">{pairPrinters.a.ipAddress}</div>
                                </div>
                              </div>
                              <div className={`rounded px-2 py-1 border flex items-center gap-1.5 ${pairPrinters.b.isAvailable ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-900/50 text-slate-500'}`}>
                                <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">B</span>
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold leading-tight">Side · {pairPrinters.b.name}</div>
                                  <div className="font-mono leading-tight opacity-80">{pairPrinters.b.ipAddress}</div>
                                </div>
                              </div>
                            </div>
                          </button>
                          {/* Collapse/expand toggle for the member printers below — separate button so it doesn't trigger pair-select. */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPairExpanded(v => !v);
                            }}
                            className="flex-shrink-0 px-2 hover:bg-slate-700/40 transition-colors text-slate-400 hover:text-slate-200 border-l border-emerald-500/20"
                            title={pairExpanded ? 'Collapse pair members' : 'Expand pair members'}
                            aria-label={pairExpanded ? 'Collapse pair members' : 'Expand pair members'}
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform ${pairExpanded ? '' : '-rotate-90'}`} />
                          </button>
                        </div>
                      </div>

                      {/* Member printer cards inside the bordered group. */}
                      {pairExpanded && (
                        <div className="px-2 pb-2 pt-1 space-y-2 border-t border-emerald-500/20 bg-slate-950/30">
                          {renderPrinterItem(pairPrinters.a, { hideDragHandle: true })}
                          {renderPrinterItem(pairPrinters.b, { hideDragHandle: true })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TwinCode license but no pair bound yet — hint card with action */}
                  {canTwinCode && !pairPrinters && (
                    <div className="rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/5 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs font-semibold text-emerald-300">TwinCode pair not bound</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed mb-2">
                        Bind two printers as a Lid/Side pair on the TwinCode page. Once bound, the pair appears here and selecting it opens the TwinCode workspace.
                      </p>
                      <Button
                        size="sm"
                        className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                        onClick={() => navigate('/twin-code')}
                      >
                        <Link2 className="w-3 h-3 mr-1.5" />
                        Configure TwinCode pair
                      </Button>
                    </div>
                  )}

                  {/* Remaining (non-pair) printers — keep DnD reorder behavior. */}
                  {nonPairPrinters.length === 0 && !pairPrinters ? (
                    <div className="flex flex-col items-center justify-center text-slate-500 py-8">
                      <PrinterIcon className="w-10 h-10 mb-3 opacity-50" />
                      <p className="font-medium text-sm">No printers configured</p>
                      <p className="text-xs text-center mt-1">
                        Click "Add" to add your first device
                      </p>
                    </div>
                  ) : nonPairPrinters.length > 0 && (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={nonPairPrinters.map(p => p.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {nonPairPrinters.map((p) => renderPrinterItem(p))}
                      </SortableContext>
                    </DndContext>
                  )}
                </>
              );
            })()}
          </div>
        </ScrollArea>

        {/* Footer with status and dev sign-in */}
        <div className="p-2 border-t border-slate-800 bg-slate-900/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <RefreshCw className="w-2.5 h-2.5" />
              <span>Auto 5s</span>
            </div>
            <div className="flex items-center gap-2">
              {/* License tier badge - tap 5 times for hidden dev access */}
              <Button
                size="sm"
                variant={isDevSignedIn ? "default" : "outline"}
                className={`h-6 text-[10px] px-2 ${isDevSignedIn 
                  ? "bg-green-600 hover:bg-green-700 text-white border-green-600" 
                  : "border-slate-600 text-slate-400 hover:bg-slate-800"
                }`}
                onClick={() => {
                  // Only developer-flagged licenses get the hidden 5-tap dev gesture.
                  // For everyone else this button is a plain Activate / tier badge.
                  if (!isDeveloper) {
                    onLicense();
                    return;
                  }
                  const now = Date.now();
                  const newTaps = [...devTaps, now].filter(t => now - t < 2000);
                  setDevTaps(newTaps);
                  if (devTapTimer.current) clearTimeout(devTapTimer.current);
                  if (newTaps.length >= 5) {
                    setDevTaps([]);
                    if (isDevSignedIn) {
                      onDevSignOut();
                    } else {
                      onDevSignIn();
                    }
                  } else {
                    devTapTimer.current = setTimeout(() => {
                      setDevTaps([]);
                      onLicense();
                    }, 500);
                  }
                }}
              >
                <Shield className="w-2.5 h-2.5 mr-1" />
                {isActivated && tier !== 'dev' ? tier.toUpperCase() : 'Activate'}
              </Button>
              <span className="text-[10px] text-slate-500">
                {printers.filter(p => p.isAvailable).length}/{printers.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Dashboard, custom content, or Empty State */}
      <div className={`flex-1 flex flex-col overflow-hidden ${!showRightPanel ? 'hidden md:flex' : ''}`}>
        {showTwinCodePanel ? (
          <div className="flex-1 flex flex-col bg-background rounded-xl border border-slate-700 overflow-hidden">
            <TwinCodeView embedded />
          </div>
        ) : rightPanelContent ? (
          <div className="flex-1 flex flex-col bg-background rounded-xl border border-slate-700 overflow-hidden">
            {rightPanelContent}
          </div>
        ) : showDashboardInPanel ? (
          <div className="flex-1 flex flex-col bg-background rounded-xl border border-slate-700 overflow-hidden">
            <Dashboard
              status={effectiveDashboardStatus}
              isConnected={isConnected}
              onStart={onStart ?? (() => {})}
              onStop={onStop ?? (() => {})}
              onJetStop={onJetStop ?? (() => {})}
              onHvOn={onHvOn}
              onHvOff={onHvOff}
              onNewMessage={onNewMessage ?? (() => {})}
              onEditMessage={onEditMessage ?? (() => {})}
              onSignIn={onSignIn ?? (() => {})}
              onHelp={onHelp ?? (() => {})}
              onResetCounter={onResetCounter ?? (() => {})}
              onResetAllCounters={onResetAllCounters ?? (() => {})}
              onQueryCounters={onQueryCounters ?? (() => {})}
              isSignedIn={isSignedIn}
              countdownSeconds={(() => {
                // Always show the countdown for the printer whose card the
                // operator is currently looking at — never the lingering
                // countdown of a previously-connected printer. Falls back to
                // the legacy single-value props only if getCountdown isn't
                // wired.
                const pid = selectedPrinter?.id ?? connectedPrinter?.id;
                if (pid != null && getCountdown) return getCountdown(pid).seconds;
                return isViewingConnected ? countdownSeconds : null;
              })()}
              countdownType={(() => {
                const pid = selectedPrinter?.id ?? connectedPrinter?.id;
                if (pid != null && getCountdown) return getCountdown(pid).type;
                return isViewingConnected ? countdownType : null;
              })()}
              messageContent={effectiveMessageContent}
              onMount={onControlMount}
              onUnmount={onControlUnmount}
              onNavigate={onNavigate}
              onTurnOff={onTurnOff}
              selectedPrinterId={selectedPrinter?.id ?? connectedPrinter?.id}
              streamHours={connectedMetrics?.streamHours}
              printerModel={status?.printerModel}
              printerVariant={status?.printerVariant}
              selectedPrinterLineId={selectedPrinter?.lineId ?? connectedPrinter?.lineId}
              printerExpiryOffset={selectedPrinter?.expiryOffsetDays}
              isSlave={(selectedPrinter ?? connectedPrinter)?.role === 'slave'}
            />
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="text-center text-slate-500">
              <Server className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a Printer</p>
              <p className="text-sm mt-1">Click a printer from the list to connect</p>
            </div>
          </div>
        )}
      </div>

      {/* Add Printer Dialog */}
      <AddPrinterDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={onAddPrinter}
        existingIps={printers.map(p => p.ipAddress)}
      />

      {/* Edit Printer Dialog */}
      <EditPrinterDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        printer={printerToEdit}
        onSave={handleSaveEdit}
        onDelete={onRemovePrinter}
        allPrinters={printers}
      />

      {/* Service Popup */}
      <PrinterServicePopup
        open={servicePopupOpen}
        onOpenChange={setServicePopupOpen}
        printer={servicePrinter}
        onQueryMetrics={onQueryPrinterMetrics ?? (async () => null)}
      />

      {/* Broadcast Message Dialog */}
      {broadcastMaster && (
        <BroadcastMessageDialog
          open={broadcastDialogOpen}
          onOpenChange={setBroadcastDialogOpen}
          master={broadcastMaster}
          slaves={getSlavesForMaster ? getSlavesForMaster(broadcastMaster.id) : []}
          messages={connectedMessages}
          currentMessage={status?.currentMessage}
          onBroadcast={async (messageName, slaveValues) => {
            if (onBroadcastMessage) {
              await onBroadcastMessage(broadcastMaster.id, messageName, slaveValues);
            }
          }}
        />
      )}

      {/* Expanded Full-Screen Printer Grid */}
      <Dialog open={expandedGridOpen} onOpenChange={setExpandedGridOpen}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] max-h-[95vh] p-0 flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-slate-800">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-800">
            <DialogTitle className="flex items-center gap-3 text-white">
              <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                <PrinterIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-lg font-bold">Network Printers</div>
                <div className="text-xs font-normal text-slate-400">
                  {visiblePrinters.length} device{visiblePrinters.length !== 1 ? 's' : ''} · full-screen view
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visiblePrinters.map((p) => p.id)}
                strategy={rectSortingStrategy}
              >
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {visiblePrinters.map((printer) => {
                    const msgName = printer.role === 'slave'
                      ? (printer.currentMessage || masterMessageMap.get(printer.id))
                      : (printer.currentMessage || masterMessageMap.get(printer.id));
                    const msgContent = msgName && getMessageContent
                      ? (getMessageContent(msgName, printer.id)
                        || (printer.masterId ? getMessageContent(msgName, printer.masterId) : null)
                        || (connectedPrinter ? getMessageContent(msgName, connectedPrinter.id) : null)
                        || getMessageContent(msgName))
                      : null;
                    const expiryField = msgContent?.fields?.find(f => (
                      f.type === 'date'
                      && (
                        f.autoCodeFieldType?.startsWith('date_expiry')
                        || (f.autoCodeExpiryDays ?? 0) > 0
                      )
                    ));
                    const msgExpiry = expiryField ? (expiryField.autoCodeExpiryDays ?? 0) : undefined;
                    return (
                      <SortablePrinterItem
                        key={printer.id}
                        printer={printer}
                        isSelected={selectedPrinter?.id === printer.id}
                        onSelect={() => {
                          handlePrinterClick(printer);
                          setExpandedGridOpen(false);
                        }}
                        onConnect={() => {
                          onConnect(printer);
                          setExpandedGridOpen(false);
                        }}
                        onEdit={() => handleEditPrinter(printer)}
                        onService={() => handleOpenService(printer)}
                        showConnectButton={true}
                        isConnected={connectedPrinter?.id === printer.id}
                        compact={false}
                        countdownType={getCountdown ? getCountdown(printer.id).type : (connectedPrinter?.id === printer.id ? countdownType : null)}
                        countdownSeconds={getCountdown ? getCountdown(printer.id).seconds : (connectedPrinter?.id === printer.id ? countdownSeconds : null)}
                        isMobile={isMobile}
                        syncGroupIndex={syncGroupMap.get(printer.id)}
                        slaveCount={printer.role === 'master' ? slaveCountMap.get(printer.id) ?? 0 : undefined}
                        onSync={printer.role === 'master' && onSyncMaster ? () => onSyncMaster(printer.id) : undefined}
                        onBroadcast={printer.role === 'master' && onBroadcastMessage ? () => {
                          setBroadcastMaster(printer);
                          setBroadcastDialogOpen(true);
                        } : undefined}
                        streamHours={connectedPrinter?.id === printer.id ? connectedMetrics?.streamHours : undefined}
                        masterMessage={masterMessageMap.get(printer.id)}
                        onExpiryChange={onSlaveExpiryChange ? async (printerId, days) => {
                          setUpdatingExpiryPrinterId(printerId);
                          try {
                            await onSlaveExpiryChange(printerId, days);
                          } finally {
                            setUpdatingExpiryPrinterId(null);
                          }
                        } : undefined}
                        isUpdatingExpiry={updatingExpiryPrinterId === printer.id}
                        messageExpiryDays={msgExpiry}
                        onOpenExpiryDialog={onSlaveExpiryChange ? (src, days) => {
                          setExpiryDialogSource(src);
                          setExpiryDialogCurrentDays(days);
                        } : undefined}
                        twinPairRole={
                          pairPrinters && pairPrinters.a.id === printer.id ? 'A'
                          : pairPrinters && pairPrinters.b.id === printer.id ? 'B'
                          : null
                        }
                        onRotationChange={onUpdatePrinter ? (id, rot) => onUpdatePrinter(id, { rotation: rot }) : undefined}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Apply expiry offset to multiple printers */}
      {expiryDialogSource && onSlaveExpiryChange && (() => {
        const getMsgExpiry = (printer: Printer): number | undefined => {
          const msgName = printer.currentMessage || masterMessageMap.get(printer.id);
          const msgContent = msgName && getMessageContent
            ? (getMessageContent(msgName, printer.id)
              || (printer.masterId ? getMessageContent(msgName, printer.masterId) : null)
              || (connectedPrinter ? getMessageContent(msgName, connectedPrinter.id) : null)
              || getMessageContent(msgName))
            : null;
          const expiryField = msgContent?.fields?.find(f => (
            f.type === 'date' && (
              f.autoCodeFieldType?.startsWith('date_expiry')
              || (f.autoCodeExpiryDays ?? 0) > 0
            )
          ));
          return expiryField ? (expiryField.autoCodeExpiryDays ?? 0) : undefined;
        };
        const siblings = visiblePrinters.filter(p =>
          p.id !== expiryDialogSource.id
          && p.isAvailable
        );
        return (
          <ApplyExpiryToPrintersDialog
            open={!!expiryDialogSource}
            onOpenChange={(o) => { if (!o) setExpiryDialogSource(null); }}
            sourcePrinter={expiryDialogSource}
            siblingPrinters={siblings}
            currentDays={expiryDialogCurrentDays}
            onConfirm={async (targets, days) => {
              // Sequential apply to avoid clobbering shared master/slave messages.
              for (const t of targets) {
                setUpdatingExpiryPrinterId(t.id);
                try {
                  await onSlaveExpiryChange(t.id, days);
                } catch (err) {
                  console.error('[ApplyExpiry] Failed on', t.name, err);
                } finally {
                  setUpdatingExpiryPrinterId(null);
                }
              }
            }}
          />
        );
      })()}
    </div>
  );
}
