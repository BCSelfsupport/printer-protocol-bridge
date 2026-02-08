import { Printer as PrinterIcon, Plus, Trash2, RefreshCw, Key, Server } from 'lucide-react';
import { Printer, PrinterStatus } from '@/types/printer';
import { useState, useEffect } from 'react';
import { PrinterListItem } from '@/components/printers/PrinterListItem';
import { AddPrinterDialog } from '@/components/printers/AddPrinterDialog';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dashboard } from '@/components/screens/Dashboard';
import { MessageDetails } from '@/components/screens/EditMessageScreen';

interface PrintersScreenProps {
  printers: Printer[];
  onConnect: (printer: Printer) => void;
  onHome: () => void;
  onAddPrinter: (printer: { name: string; ipAddress: string; port: number }) => void;
  onRemovePrinter: (printerId: number) => void;
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
}

export function PrintersScreen({
  printers,
  onConnect,
  onHome,
  onAddPrinter,
  onRemovePrinter,
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
}: PrintersScreenProps) {
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const isMobile = useIsMobile();

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

  const handleConnect = () => {
    if (selectedPrinter) {
      onConnect(selectedPrinter);
    }
  };

  const handleRemoveSelected = () => {
    if (selectedPrinter) {
      onRemovePrinter(selectedPrinter.id);
    }
  };

  // Desktop shows split-view with Dashboard when connected
  const showDashboardInPanel = !isMobile && isConnected && connectedPrinter;

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 md:p-4 gap-3 md:gap-4 overflow-hidden">
      {/* Left Panel - Printer List (narrower on desktop when showing Dashboard) */}
      <div className={`${showDashboardInPanel ? 'w-full md:w-72 lg:w-80' : 'w-full md:w-96'} flex-shrink-0 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden`}>
        {/* Header */}
        <div className="p-3 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <PrinterIcon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-white text-sm">Network Printers</h2>
                <p className="text-[10px] text-slate-400">{printers.length} device{printers.length !== 1 ? 's' : ''}</p>
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

        {/* Printer List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {printers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 py-8">
              <PrinterIcon className="w-10 h-10 mb-3 opacity-50" />
              <p className="font-medium text-sm">No printers configured</p>
              <p className="text-xs text-center mt-1">
                Click "Add" to add your first device
              </p>
            </div>
          ) : (
            printers.map((printer) => (
              <PrinterListItem
                key={printer.id}
                printer={printer}
                isSelected={selectedPrinter?.id === printer.id}
                onSelect={() => setSelectedPrinter(printer)}
                onConnect={() => onConnect(printer)}
                showConnectButton={!showDashboardInPanel}
                isConnected={connectedPrinter?.id === printer.id}
                compact={!!showDashboardInPanel}
              />
            ))
          )}
        </div>

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

      {/* Right Panel - Dashboard (when connected) or Empty State */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showDashboardInPanel ? (
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
            />
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl border border-slate-700">
            <div className="text-center text-slate-500">
              <Server className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a Printer</p>
              <p className="text-sm mt-1">Click a printer from the list to connect</p>
              {selectedPrinter && selectedPrinter.isAvailable && (
                <Button
                  onClick={handleConnect}
                  className="mt-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500"
                >
                  Connect to {selectedPrinter.name}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Printer Dialog */}
      <AddPrinterDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={onAddPrinter}
      />
    </div>
  );
}
