import { Printer as PrinterIcon, ChevronDown } from 'lucide-react';
import { Printer } from '@/types/printer';
import { useState } from 'react';

interface PrinterSelectorProps {
  printers: Printer[];
  selectedPrinter: Printer | null;
  onSelect: (printer: Printer) => void;
}

export function PrinterSelector({ printers, selectedPrinter, onSelect }: PrinterSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (printers.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-sidebar-accent text-sidebar-foreground text-center">
        <p className="text-sm">No printers available</p>
        <p className="text-xs opacity-70">Add a printer to get started</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="w-full flex items-center gap-3 p-3 rounded-lg bg-sidebar-accent text-sidebar-foreground"
      >
        <div className="w-12 h-12 bg-muted-foreground/20 rounded flex items-center justify-center">
          <PrinterIcon className="w-8 h-8" />
        </div>
        <div className="text-left flex-1">
          {selectedPrinter ? (
            <>
              <div className="text-sm font-medium">ID: {selectedPrinter.id}</div>
              <div className="text-xs">{selectedPrinter.ipAddress}</div>
              <div className="text-xs">{selectedPrinter.name}</div>
            </>
          ) : (
            <div className="text-sm">Select a printer...</div>
          )}
        </div>
        <ChevronDown className={`w-5 h-5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
      </button>

      {dropdownOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-sidebar-accent rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
          {printers.map((printer) => (
            <button
              key={printer.id}
              onClick={() => {
                onSelect(printer);
                setDropdownOpen(false);
              }}
              className={`w-full flex items-center gap-3 p-3 hover:bg-sidebar-accent/80 text-sidebar-foreground first:rounded-t-lg last:rounded-b-lg ${
                selectedPrinter?.id === printer.id ? 'bg-primary/20' : ''
              }`}
            >
              <div className="w-10 h-10 bg-muted-foreground/20 rounded flex items-center justify-center">
                <PrinterIcon className="w-6 h-6" />
              </div>
              <div className="text-left">
                <div className="text-sm">ID: {printer.id}</div>
                <div className="text-xs">{printer.ipAddress}</div>
                <div className="text-xs">{printer.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
