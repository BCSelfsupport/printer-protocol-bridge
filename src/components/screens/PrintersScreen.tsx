import { Printer as PrinterIcon, Plus, Trash2, RefreshCw } from 'lucide-react';
import { Printer } from '@/types/printer';
import { useState, useEffect } from 'react';
import { PrinterListItem } from '@/components/printers/PrinterListItem';
import { PrinterDetailsPanel } from '@/components/printers/PrinterDetailsPanel';
import { AddPrinterDialog } from '@/components/printers/AddPrinterDialog';
import { Button } from '@/components/ui/button';

interface PrintersScreenProps {
  printers: Printer[];
  onConnect: (printer: Printer) => void;
  onHome: () => void;
  onAddPrinter: (printer: { name: string; ipAddress: string; port: number }) => void;
  onRemovePrinter: (printerId: number) => void;
  availabilityPollingEnabled: boolean;
  onToggleAvailabilityPolling: () => void;
  onMarkAllNotReady: () => void;
}

export function PrintersScreen({
  printers,
  onConnect,
  onHome,
  onAddPrinter,
  onRemovePrinter,
  availabilityPollingEnabled,
  onToggleAvailabilityPolling,
  onMarkAllNotReady,
}: PrintersScreenProps) {
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

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

  return (
    <div className="flex-1 flex bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 gap-6">
      {/* Left Panel - Printer List */}
      <div className="w-96 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <PrinterIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-white">Network Printers</h2>
                <p className="text-xs text-slate-400">{printers.length} device{printers.length !== 1 ? 's' : ''} configured</p>
              </div>
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              onClick={() => setAddDialogOpen(true)}
              size="sm"
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Printer
            </Button>
            {selectedPrinter && (
              <Button
                onClick={handleRemoveSelected}
                size="sm"
                variant="outline"
                className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Printer List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {printers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12">
              <PrinterIcon className="w-12 h-12 mb-4 opacity-50" />
              <p className="font-medium">No printers configured</p>
              <p className="text-sm text-center mt-1">
                Click "Add Printer" to add your first device
              </p>
            </div>
          ) : (
            printers.map((printer) => (
              <PrinterListItem
                key={printer.id}
                printer={printer}
                isSelected={selectedPrinter?.id === printer.id}
                onSelect={() => setSelectedPrinter(printer)}
              />
            ))
          )}
        </div>

        {/* Status bar */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/80">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-2">
              <RefreshCw className="w-3 h-3" />
              {availabilityPollingEnabled ? 'Auto-refreshing every 5s' : 'Auto-refresh paused'}
            </span>
            <div className="flex items-center gap-2">
              <span>
                {printers.filter(p => p.isAvailable).length}/{printers.length} online
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={onToggleAvailabilityPolling}
                className="h-7 px-2 border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                {availabilityPollingEnabled ? 'Pause' : 'Resume'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onMarkAllNotReady}
                className="h-7 px-2 border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                Mark not ready
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Details */}
      <PrinterDetailsPanel 
        printer={selectedPrinter} 
        onConnect={handleConnect}
      />

      {/* Add Printer Dialog */}
      <AddPrinterDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={onAddPrinter}
      />
    </div>
  );
}
