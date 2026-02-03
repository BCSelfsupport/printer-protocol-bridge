import { Printer as PrinterIcon, Check, ChevronDown } from 'lucide-react';
import { Printer } from '@/types/printer';
import { useState } from 'react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';

interface PrintersScreenProps {
  printers: Printer[];
  onConnect: (printer: Printer) => void;
  onHome: () => void;
}

export function PrintersScreen({ printers, onConnect, onHome }: PrintersScreenProps) {
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(printers[0] || null);
  const [printerName, setPrinterName] = useState(selectedPrinter?.name || '');
  const [address, setAddress] = useState(selectedPrinter?.ipAddress || '');
  const [port, setPort] = useState(selectedPrinter?.port.toString() || '23');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handlePrinterSelect = (printer: Printer) => {
    setSelectedPrinter(printer);
    setPrinterName(printer.name);
    setAddress(printer.ipAddress);
    setPort(printer.port.toString());
    setDropdownOpen(false);
  };

  return (
    <div className="flex-1 flex">
      {/* Left panel */}
      <div className="w-96 bg-sidebar p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sidebar-foreground">
          <PrinterIcon className="w-5 h-5" />
          <span className="font-medium">Printers list</span>
        </div>

        {/* Dropdown selector */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-sidebar-accent text-sidebar-foreground"
          >
            <div className="w-12 h-12 bg-muted-foreground/20 rounded flex items-center justify-center">
              <PrinterIcon className="w-8 h-8" />
            </div>
            <div className="text-left flex-1">
              <div className="text-sm font-medium">ID: {selectedPrinter?.id}</div>
              <div className="text-xs">{selectedPrinter?.ipAddress}</div>
              <div className="text-xs">{selectedPrinter?.name}</div>
            </div>
            <ChevronDown className="w-5 h-5" />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-sidebar-accent rounded-lg shadow-lg z-10">
              {printers.map((printer) => (
                <button
                  key={printer.id}
                  onClick={() => handlePrinterSelect(printer)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-sidebar-accent/80 text-sidebar-foreground first:rounded-t-lg last:rounded-b-lg"
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

        {/* Form fields */}
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
            />
          </div>
        </div>

        <div className="flex-1" />

        <button
          onClick={() => selectedPrinter && onConnect(selectedPrinter)}
          className="industrial-button text-white py-4 rounded-lg text-xl font-bold tracking-wide"
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
          <table className="w-full">
            <thead>
              <tr className="border-b border-muted">
                <th className="px-4 py-3 text-left font-medium text-foreground">ID</th>
                <th className="px-4 py-3 text-left font-medium text-foreground">Details</th>
                <th className="px-4 py-3 text-left font-medium text-foreground">Availability</th>
                <th className="px-4 py-3 text-left font-medium text-foreground">Status</th>
                <th className="px-4 py-3 text-center font-medium text-foreground">Active<br/>errors</th>
              </tr>
            </thead>
            <tbody>
              {printers.map((printer) => (
                <tr 
                  key={printer.id} 
                  className="bg-sky-100 border-b border-sky-200"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-foreground font-medium">{printer.id}</span>
                      <div className="w-8 h-8 bg-muted rounded flex items-center justify-center">
                        <PrinterIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-foreground">
                      <div>IP address: <span className="text-primary font-medium">{printer.ipAddress}</span></div>
                      <div>Printer name: <span className="font-semibold">{printer.name}</span></div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">Connection state:</span>
                      <span className={`px-3 py-1 rounded text-sm font-medium text-white ${
                        printer.isAvailable ? 'bg-success' : 'bg-destructive'
                      }`}>
                        {printer.isAvailable ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">Status:</span>
                      <span className={`px-3 py-1 rounded text-sm font-medium ${
                        printer.status === 'ready' ? 'bg-success text-white' :
                        printer.status === 'not_ready' ? 'bg-muted text-foreground' :
                        printer.status === 'offline' ? 'text-destructive' :
                        'bg-destructive text-white'
                      }`}>
                        {printer.status === 'ready' ? 'Ready' : 
                         printer.status === 'not_ready' ? 'Not ready' : 'Unavailable'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <div className={`w-5 h-5 border-2 rounded flex items-center justify-center ${
                        printer.hasActiveErrors 
                          ? 'bg-primary border-primary text-white' 
                          : 'border-muted-foreground bg-white'
                      }`}>
                        {printer.hasActiveErrors && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
