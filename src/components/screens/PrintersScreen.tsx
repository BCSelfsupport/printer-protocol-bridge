import { Printer as PrinterIcon, Plus, Trash2, RefreshCw, Key, Server, GripVertical } from 'lucide-react';
import { Printer, PrinterStatus, PrinterMetrics } from '@/types/printer';
import { useState, useEffect, useMemo } from 'react';
import { PrinterListItem } from '@/components/printers/PrinterListItem';
import { AddPrinterDialog } from '@/components/printers/AddPrinterDialog';
import { EditPrinterDialog } from '@/components/printers/EditPrinterDialog';
import { PrinterServicePopup } from '@/components/printers/PrinterServicePopup';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dashboard } from '@/components/screens/Dashboard';
import { MessageDetails } from '@/components/screens/EditMessageScreen';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  // Optional content to render in the right panel instead of Dashboard
  rightPanelContent?: React.ReactNode;
  // Per-printer countdown lookup
  getCountdown?: (printerId: number) => { seconds: number | null; type: 'starting' | 'stopping' | null };
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
  isMobile,
  syncGroupIndex,
  slaveCount,
  onSync,
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
  isMobile: boolean;
  syncGroupIndex?: number;
  slaveCount?: number;
  onSync?: () => void;
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
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        onPointerDown={(e) => {
          e.preventDefault();
        }}
        className={
          "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 z-10 transition-opacity cursor-grab active:cursor-grabbing p-1 rounded touch-none select-none " +
          (isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100")
        }
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
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
        syncGroupIndex={syncGroupIndex}
        slaveCount={slaveCount}
        onSync={onSync}
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
  rightPanelContent,
  getCountdown,
}: PrintersScreenProps) {
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [printerToEdit, setPrinterToEdit] = useState<Printer | null>(null);
  const [servicePopupOpen, setServicePopupOpen] = useState(false);
  const [servicePrinter, setServicePrinter] = useState<Printer | null>(null);
  const isMobile = useIsMobile();

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

  const handlePrinterClick = (printer: Printer) => {
    setSelectedPrinter(printer);
    // On desktop, clicking connects immediately if printer is available
    if (!isMobile && printer.isAvailable) {
      onConnect(printer);
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

  const handleSaveEdit = (printerId: number, updates: { name: string; ipAddress: string; port: number; role?: import('@/types/printer').PrinterRole; masterId?: number }) => {
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
  const showDashboardInPanel = !isMobile && isConnected && connectedPrinter;
  const showRightPanel = showDashboardInPanel || (!isMobile && rightPanelContent);

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 md:p-4 gap-3 md:gap-4 overflow-y-auto md:overflow-hidden">
      {/* Left Panel - Printer List (narrower on desktop when showing Dashboard) */}
      <div className={`${showRightPanel ? 'w-full md:w-96 lg:w-[420px]' : 'w-full md:w-96'} flex-shrink-0 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 overflow-visible md:overflow-hidden`}>
        {/* Header */}
        <div className="p-3 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <PrinterIcon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-white text-sm">Network Printers</h2>
                <p className="text-[10px] text-slate-400">{printers.length} device{printers.length !== 1 ? 's' : ''} • drag to reorder</p>
              </div>
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              onClick={() => setAddDialogOpen(true)}
              size="sm"
              className="flex-1 bg-primary hover:bg-primary/90 h-8 text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
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
          <div className="p-3 space-y-2">
            {printers.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-slate-500 py-8">
                <PrinterIcon className="w-10 h-10 mb-3 opacity-50" />
                <p className="font-medium text-sm">No printers configured</p>
                <p className="text-xs text-center mt-1">
                  Click "Add" to add your first device
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={printers.map(p => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {printers.map((printer) => (
                    <SortablePrinterItem
                      key={printer.id}
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
                      isMobile={isMobile}
                      syncGroupIndex={syncGroupMap.get(printer.id)}
                      slaveCount={printer.role === 'master' ? slaveCountMap.get(printer.id) ?? 0 : undefined}
                      onSync={printer.role === 'master' && onSyncMaster ? () => onSyncMaster(printer.id) : undefined}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
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
              <span className="text-[10px] text-slate-500">
                {printers.filter(p => p.isAvailable).length}/{printers.length}
              </span>
              <Button
                size="sm"
                variant={isDevSignedIn ? "default" : "outline"}
                className={`h-6 text-[10px] px-2 ${isDevSignedIn 
                  ? "bg-green-600 hover:bg-green-700 text-white" 
                  : "border-slate-600 text-slate-400 hover:bg-slate-800"
                }`}
                onClick={isDevSignedIn ? onDevSignOut : onDevSignIn}
              >
                <Key className="w-2.5 h-2.5 mr-1" />
                {isDevSignedIn ? "Out" : "Dev"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Dashboard, custom content, or Empty State */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {rightPanelContent ? (
          <div className="flex-1 flex flex-col bg-background rounded-xl border border-slate-700 overflow-hidden">
            {rightPanelContent}
          </div>
        ) : showDashboardInPanel ? (
          <div className="flex-1 flex flex-col bg-background rounded-xl border border-slate-700 overflow-hidden">
            <Dashboard
              status={status ?? null}
              isConnected={isConnected}
              onStart={onStart ?? (() => {})}
              onStop={onStop ?? (() => {})}
              onJetStop={onJetStop ?? (() => {})}
              onNewMessage={onNewMessage ?? (() => {})}
              onEditMessage={onEditMessage ?? (() => {})}
              onSignIn={onSignIn ?? (() => {})}
              onHelp={onHelp ?? (() => {})}
              onResetCounter={onResetCounter ?? (() => {})}
              onResetAllCounters={onResetAllCounters ?? (() => {})}
              onQueryCounters={onQueryCounters ?? (() => {})}
              isSignedIn={isSignedIn}
              countdownSeconds={countdownSeconds}
              countdownType={countdownType}
              messageContent={messageContent}
              onMount={onControlMount}
              onUnmount={onControlUnmount}
              onNavigate={onNavigate}
              onTurnOff={onTurnOff}
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
    </div>
  );
}
