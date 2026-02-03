import { Printer as PrinterIcon, Plus } from 'lucide-react';
import { Printer } from '@/types/printer';
import { useState, useEffect } from 'react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { PrinterSelector } from '@/components/printers/PrinterSelector';
import { PrinterTable } from '@/components/printers/PrinterTable';
import { AddPrinterDialog } from '@/components/printers/AddPrinterDialog';
import { Button } from '@/components/ui/button';

interface PrintersScreenProps {
  printers: Printer[];
  onConnect: (printer: Printer) => void;
  onHome: () => void;
  onAddPrinter: (printer: { name: string; ipAddress: string; port: number }) => void;
  onRemovePrinter: (printerId: number) => void;
}

export function PrintersScreen({ printers, onConnect, onHome, onAddPrinter, onRemovePrinter }: PrintersScreenProps) {
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
  const [printerName, setPrinterName] = useState('');
  const [address, setAddress] = useState('');
  const [port, setPort] = useState('23');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Update selected printer when printers list changes
  useEffect(() => {
    if (printers.length > 0 && !selectedPrinter) {
      setSelectedPrinter(printers[0]);
    } else if (selectedPrinter && !printers.find(p => p.id === selectedPrinter.id)) {
      setSelectedPrinter(printers[0] || null);
    }
  }, [printers, selectedPrinter]);

  // Update form when selected printer changes
  useEffect(() => {
    if (selectedPrinter) {
      setPrinterName(selectedPrinter.name);
      setAddress(selectedPrinter.ipAddress);
      setPort(selectedPrinter.port.toString());
    } else {
      setPrinterName('');
      setAddress('');
      setPort('23');
    }
  }, [selectedPrinter]);

  const handlePrinterSelect = (printer: Printer) => {
    setSelectedPrinter(printer);
  };

  const handleConnect = () => {
    if (selectedPrinter) {
      onConnect(selectedPrinter);
    }
  };

  return (
    <div className="flex-1 flex">
      {/* Left panel */}
      <div className="w-96 bg-sidebar p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between text-sidebar-foreground">
          <div className="flex items-center gap-2">
            <PrinterIcon className="w-5 h-5" />
            <span className="font-medium">Printers list</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAddDialogOpen(true)}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>

        {/* Dropdown selector */}
        <PrinterSelector
          printers={printers}
          selectedPrinter={selectedPrinter}
          onSelect={handlePrinterSelect}
        />

        {/* Form fields - only show when a printer is selected */}
        {selectedPrinter && (
          <div className="space-y-4 mt-4">
            <div>
              <div className="flex items-center gap-2 text-sidebar-foreground mb-2">
                <PrinterIcon className="w-4 h-4" />
                <span className="text-sm">Printer name:</span>
              </div>
              <input
                type="text"
                value={printerName}
                onChange={(e) => setPrinterName(e.target.value)}
                className="w-full px-3 py-2 rounded bg-card text-foreground text-center"
                readOnly
              />
            </div>

            <div>
              <div className="flex items-center gap-2 text-sidebar-foreground mb-2">
                <span className="w-4 h-4 rounded-full border border-sidebar-foreground flex items-center justify-center text-[10px]">@</span>
                <span className="text-sm">Address</span>
              </div>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 rounded bg-card text-foreground text-center"
                readOnly
              />
            </div>

            <div>
              <div className="flex items-center gap-2 text-sidebar-foreground mb-2">
                <span className="w-4 h-4 flex items-center justify-center text-xs">⌨</span>
                <span className="text-sm">Port</span>
              </div>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full px-3 py-2 rounded bg-card text-foreground text-center"
                readOnly
              />
            </div>
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={handleConnect}
          disabled={!selectedPrinter}
          className="industrial-button text-white py-4 rounded-lg text-xl font-bold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
        >
          CONNECT
        </button>
      </div>

      {/* Right panel - Printer table */}
      <div className="flex-1 flex flex-col bg-card">
        <div className="p-4">
          <SubPageHeader title="" onHome={onHome} />
        </div>

        <div className="flex-1 overflow-auto px-4 pb-4">
          <PrinterTable printers={printers} onRemove={onRemovePrinter} />
        </div>
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
