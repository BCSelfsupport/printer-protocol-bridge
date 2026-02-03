import { Printer as PrinterIcon, Wifi, WifiOff, Activity, Server } from 'lucide-react';
import { Printer } from '@/types/printer';

interface PrinterListItemProps {
  printer: Printer;
  isSelected: boolean;
  onSelect: () => void;
}

export function PrinterListItem({ printer, isSelected, onSelect }: PrinterListItemProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-lg transition-all border-2 ${
        isSelected 
          ? 'bg-primary/20 border-primary shadow-lg' 
          : 'bg-card/50 border-transparent hover:bg-card/80 hover:border-border'
      }`}
    >
      <div className="flex items-center gap-4">
        {/* Status indicator */}
        <div className={`relative w-14 h-14 rounded-lg flex items-center justify-center ${
          printer.isAvailable ? 'bg-success/20' : 'bg-muted'
        }`}>
          <PrinterIcon className={`w-7 h-7 ${
            printer.isAvailable ? 'text-success' : 'text-muted-foreground'
          }`} />
          <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-card ${
            printer.isAvailable ? 'bg-success' : 'bg-destructive'
          }`}>
            {printer.isAvailable ? (
              <Wifi className="w-2.5 h-2.5 text-white absolute top-0.5 left-0.5" />
            ) : (
              <WifiOff className="w-2.5 h-2.5 text-white absolute top-0.5 left-0.5" />
            )}
          </div>
        </div>

        {/* Printer info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground truncate">{printer.name}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
              ID: {printer.id}
            </span>
          </div>
          <div className="text-sm text-primary font-mono mt-1">
            {printer.ipAddress}:{printer.port}
          </div>
        </div>

        {/* Status badge */}
        <div className="flex flex-col items-end gap-1">
          <span className={`text-xs px-2 py-1 rounded font-medium ${
            printer.status === 'ready' 
              ? 'bg-success text-white' 
              : printer.status === 'not_ready'
              ? 'bg-warning text-white'
              : 'bg-muted text-muted-foreground'
          }`}>
            {printer.status === 'ready' ? 'READY' : 
             printer.status === 'not_ready' ? 'NOT READY' : 'OFFLINE'}
          </span>
          {printer.hasActiveErrors && (
            <span className="text-xs px-2 py-1 rounded bg-destructive text-white font-medium">
              ERROR
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
