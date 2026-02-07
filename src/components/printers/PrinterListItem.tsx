import { Printer as PrinterIcon, Wifi, WifiOff, Droplets, FlaskConical, FileText } from 'lucide-react';
import { Printer } from '@/types/printer';

interface PrinterListItemProps {
  printer: Printer;
  isSelected: boolean;
  onSelect: () => void;
}

// Helper to get color for fluid levels
function getFluidColor(level?: 'FULL' | 'GOOD' | 'LOW' | 'EMPTY' | 'UNKNOWN'): string {
  switch (level) {
    case 'FULL':
    case 'GOOD':
      return 'text-success';
    case 'LOW':
      return 'text-warning';
    case 'EMPTY':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}

export function PrinterListItem({ printer, isSelected, onSelect }: PrinterListItemProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-5 rounded-xl transition-all border-2 ${
        isSelected 
          ? 'bg-primary/20 border-primary shadow-lg' 
          : 'bg-card/50 border-transparent hover:bg-card/80 hover:border-border'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Status indicator */}
        <div className={`relative w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${
          printer.isAvailable ? 'bg-success/20' : 'bg-muted'
        }`}>
          <PrinterIcon className={`w-8 h-8 ${
            printer.isAvailable ? 'text-success' : 'text-muted-foreground'
          }`} />
          <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full border-2 border-card flex items-center justify-center ${
            printer.isAvailable ? 'bg-success' : 'bg-destructive'
          }`}>
            {printer.isAvailable ? (
              <Wifi className="w-3 h-3 text-white" />
            ) : (
              <WifiOff className="w-3 h-3 text-white" />
            )}
          </div>
        </div>

        {/* Printer info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-foreground truncate text-base">{printer.name}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
              ID: {printer.id}
            </span>
          </div>
          <div className="text-sm text-primary font-mono">
            {printer.ipAddress}:{printer.port}
          </div>
          
          {/* Current message */}
          {printer.currentMessage && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              <span className="truncate font-medium">{printer.currentMessage}</span>
            </div>
          )}
          
          {/* Fluid levels */}
          {printer.isAvailable && (
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5" title={`Ink: ${printer.inkLevel || 'Unknown'}`}>
                <Droplets className={`w-4 h-4 ${getFluidColor(printer.inkLevel)}`} />
                <span className="text-xs text-muted-foreground">INK:</span>
                <span className={`text-xs font-semibold ${getFluidColor(printer.inkLevel)}`}>
                  {printer.inkLevel || '?'}
                </span>
              </div>
              <div className="flex items-center gap-1.5" title={`Makeup: ${printer.makeupLevel || 'Unknown'}`}>
                <FlaskConical className={`w-4 h-4 ${getFluidColor(printer.makeupLevel)}`} />
                <span className="text-xs text-muted-foreground">MU:</span>
                <span className={`text-xs font-semibold ${getFluidColor(printer.makeupLevel)}`}>
                  {printer.makeupLevel || '?'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded font-medium ${
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
            <span className="text-xs px-2.5 py-1 rounded bg-destructive text-white font-medium">
              ERROR
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
