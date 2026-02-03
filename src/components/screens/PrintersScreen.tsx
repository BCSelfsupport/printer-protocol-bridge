import { Printer as PrinterIcon, Check } from 'lucide-react';
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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set([1, 2, 3]));

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handlePrinterSelect = (printer: Printer) => {
    setSelectedPrinter(printer);
    setPrinterName(printer.name);
    setAddress(printer.ipAddress);
    setPort(printer.port.toString());
  };

  return (
    <div className="flex-1 p-4 flex gap-4">
      {/* Left panel */}
      <div className="w-80 flex flex-col gap-4">
        <div className="bg-sidebar rounded-lg p-4">
          <div className="flex items-center gap-2 text-sidebar-foreground mb-4">
            <PrinterIcon className="w-5 h-5" />
            <span className="font-medium">Printers list</span>
          </div>

          <div className="space-y-2">
            {printers.map((printer) => (
              <button
                key={printer.id}
                onClick={() => handlePrinterSelect(printer)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  selectedPrinter?.id === printer.id
                    ? 'bg-sidebar-accent'
                    : 'hover:bg-sidebar-accent/50'
                } text-sidebar-foreground`}
              >
                <PrinterIcon className="w-10 h-10" />
                <div className="text-left">
                  <div className="text-sm">ID: {printer.id}</div>
                  <div className="text-xs">{printer.ipAddress}</div>
                  <div className="text-xs">{printer.name}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-sidebar rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2 text-sidebar-foreground">
            <PrinterIcon className="w-5 h-5" />
            <span>Printer name:</span>
          </div>
          <input
            type="text"
            value={printerName}
            onChange={(e) => setPrinterName(e.target.value)}
            className="w-full px-3 py-2 rounded bg-card text-foreground"
          />

          <div className="flex items-center gap-2 text-sidebar-foreground">
            <span className="w-5 h-5 rounded-full border-2 border-sidebar-foreground flex items-center justify-center text-xs">@</span>
            <span>Address</span>
          </div>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 rounded bg-card text-foreground"
          />

          <div className="flex items-center gap-2 text-sidebar-foreground">
            <span className="text-xs">⌨</span>
            <span>Port</span>
          </div>
          <input
            type="text"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className="w-full px-3 py-2 rounded bg-card text-foreground"
          />
        </div>

        <button
          onClick={() => selectedPrinter && onConnect(selectedPrinter)}
          className="industrial-button text-white py-4 rounded-lg text-xl font-medium"
        >
          CONNECT
        </button>
      </div>

      {/* Right panel - Printer table */}
      <div className="flex-1 bg-card rounded-lg overflow-hidden">
        <SubPageHeader title="" onHome={onHome} />
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left font-medium">ID</th>
              <th className="px-4 py-3 text-left font-medium">Details</th>
              <th className="px-4 py-3 text-left font-medium">Availability</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-center font-medium">Active errors</th>
            </tr>
          </thead>
          <tbody>
            {printers.map((printer, index) => (
              <tr 
                key={printer.id} 
                className={`border-b ${index % 2 === 0 ? 'bg-primary/10' : 'bg-card'}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-medium">{printer.id}</span>
                    <PrinterIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm">
                    <div>IP address: <span className="text-primary">{printer.ipAddress}</span></div>
                    <div>Printer name: <span className="font-medium">{printer.name}</span></div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`status-badge ${printer.isAvailable ? 'status-badge-success' : 'status-badge-error'}`}>
                    {printer.isAvailable ? 'Available' : 'Unavailable'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-3 py-1 rounded text-sm ${
                    printer.status === 'ready' ? 'bg-success text-white' :
                    printer.status === 'not_ready' ? 'bg-muted text-foreground' :
                    'bg-destructive text-white'
                  }`}>
                    {printer.status === 'ready' ? 'Ready' : 
                     printer.status === 'not_ready' ? 'Not ready' : 'Unavailable'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleSelection(printer.id)}
                    className={`w-6 h-6 border-2 rounded flex items-center justify-center ${
                      selectedIds.has(printer.id) 
                        ? 'bg-primary border-primary text-white' 
                        : 'border-muted-foreground'
                    }`}
                  >
                    {selectedIds.has(printer.id) && <Check className="w-4 h-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
