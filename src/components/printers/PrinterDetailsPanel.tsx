import { Printer as PrinterIcon, Wifi, WifiOff, Server, Activity, Zap, Clock, AlertTriangle } from 'lucide-react';
import { Printer } from '@/types/printer';

interface PrinterDetailsPanelProps {
  printer: Printer | null;
  onConnect: () => void;
}

// Helper to generate error message from printer state
function getErrorMessage(printer: Printer): string {
  const errors: string[] = [];
  if (printer.inkLevel === 'LOW') errors.push('Ink Low');
  if (printer.inkLevel === 'EMPTY') errors.push('Ink Empty');
  if (printer.makeupLevel === 'LOW') errors.push('Makeup Low');
  if (printer.makeupLevel === 'EMPTY') errors.push('Makeup Empty');
  return errors.length > 0 ? errors.join(', ') : 'Active Errors';
}

export function PrinterDetailsPanel({ printer, onConnect }: PrinterDetailsPanelProps) {
  if (!printer) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl border border-slate-700">
        <div className="text-center text-slate-500">
          <Server className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No Printer Selected</p>
          <p className="text-sm">Select a printer from the list to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
              printer.isAvailable ? 'bg-emerald-500/20 ring-2 ring-emerald-500/50' : 'bg-slate-700'
            }`}>
              <PrinterIcon className={`w-8 h-8 ${
                printer.isAvailable ? 'text-emerald-400' : 'text-slate-500'
              }`} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{printer.name}</h2>
              <p className="text-slate-400 font-mono">{printer.ipAddress}:{printer.port}</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
            printer.isAvailable 
              ? 'bg-emerald-500/20 text-emerald-400' 
              : 'bg-red-500/20 text-red-400'
          }`}>
            {printer.isAvailable ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            <span className="font-medium text-sm">
              {printer.isAvailable ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Status Grid */}
      <div className="p-6 flex-1">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
          System Status
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Connection Status */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                printer.isAvailable ? 'bg-emerald-500/20' : 'bg-slate-700'
              }`}>
                <Activity className={`w-5 h-5 ${
                  printer.isAvailable ? 'text-emerald-400' : 'text-slate-500'
                }`} />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Connection</p>
                <p className={`font-semibold ${
                  printer.isAvailable ? 'text-emerald-400' : 'text-slate-400'
                }`}>
                  {printer.isAvailable ? 'Available' : 'Unavailable'}
                </p>
              </div>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  printer.isAvailable ? 'bg-emerald-500 w-full' : 'bg-red-500 w-1/4'
                }`}
              />
            </div>
          </div>

          {/* Printer Status */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                printer.status === 'ready' ? 'bg-emerald-500/20' : 
                printer.status === 'not_ready' ? 'bg-amber-500/20' : 'bg-slate-700'
              }`}>
                <Zap className={`w-5 h-5 ${
                  printer.status === 'ready' ? 'text-emerald-400' : 
                  printer.status === 'not_ready' ? 'text-amber-400' : 'text-slate-500'
                }`} />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
                <p className={`font-semibold ${
                  printer.status === 'ready' ? 'text-emerald-400' : 
                  printer.status === 'not_ready' ? 'text-amber-400' : 'text-slate-400'
                }`}>
                  {printer.status === 'ready' ? 'Ready' : 
                   printer.status === 'not_ready' ? 'Not Ready' : 'Offline'}
                </p>
              </div>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  printer.status === 'ready' ? 'bg-emerald-500 w-full' : 
                  printer.status === 'not_ready' ? 'bg-amber-500 w-2/3' : 'bg-slate-600 w-0'
                }`}
              />
            </div>
          </div>

          {/* Response Time (placeholder) */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-500/20">
                <Clock className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Port</p>
                <p className="font-semibold text-blue-400">{printer.port}</p>
              </div>
            </div>
          </div>

          {/* Errors */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                printer.hasActiveErrors ? 'bg-red-500/20' : 'bg-slate-700'
              }`}>
                <AlertTriangle className={`w-5 h-5 ${
                  printer.hasActiveErrors ? 'text-red-400' : 'text-slate-500'
                }`} />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Errors</p>
                <p className={`font-semibold ${
                  printer.hasActiveErrors ? 'text-red-400' : 'text-slate-400'
                }`}>
                  {printer.hasActiveErrors 
                    ? getErrorMessage(printer)
                    : 'No Errors'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connect Button */}
      <div className="p-6 border-t border-slate-700">
        <button
          onClick={onConnect}
          disabled={!printer.isAvailable}
          className={`w-full py-4 rounded-xl text-lg font-bold uppercase tracking-wider transition-all ${
            printer.isAvailable
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {printer.isAvailable ? 'Connect to Printer' : 'Printer Unavailable'}
        </button>
      </div>
    </div>
  );
}
