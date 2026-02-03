import { Printer as PrinterIcon, Check, Trash2 } from 'lucide-react';
import { Printer } from '@/types/printer';
import { Button } from '@/components/ui/button';

interface PrinterTableProps {
  printers: Printer[];
  onRemove: (printerId: number) => void;
}

export function PrinterTable({ printers, onRemove }: PrinterTableProps) {
  if (printers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <PrinterIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No printers configured</p>
          <p className="text-sm">Add a printer using the form on the left</p>
        </div>
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-muted">
          <th className="px-4 py-3 text-left font-medium text-foreground">ID</th>
          <th className="px-4 py-3 text-left font-medium text-foreground">Details</th>
          <th className="px-4 py-3 text-left font-medium text-foreground">Availability</th>
          <th className="px-4 py-3 text-left font-medium text-foreground">Status</th>
          <th className="px-4 py-3 text-center font-medium text-foreground">Active<br />errors</th>
          <th className="px-4 py-3 text-center font-medium text-foreground">Actions</th>
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
                <span className={`px-3 py-1 rounded text-sm font-medium text-white ${printer.isAvailable ? 'bg-success' : 'bg-destructive'
                  }`}>
                  {printer.isAvailable ? 'Available' : 'Unavailable'}
                </span>
              </div>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">Status:</span>
                <span className={`px-3 py-1 rounded text-sm font-medium ${printer.status === 'ready' ? 'bg-success text-white' :
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
                <div className={`w-5 h-5 border-2 rounded flex items-center justify-center ${printer.hasActiveErrors
                    ? 'bg-primary border-primary text-white'
                    : 'border-muted-foreground bg-white'
                  }`}>
                  {printer.hasActiveErrors && <Check className="w-3 h-3" />}
                </div>
              </div>
            </td>
            <td className="px-4 py-3">
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(printer.id)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
