import { useEffect } from 'react';
import { Key, HelpCircle, Printer as PrinterIcon, Droplets, Palette, Play, Square, Plus, Pencil } from 'lucide-react';
import { Wifi } from 'lucide-react';
import { PrinterStatus } from '@/types/printer';

interface DashboardProps {
  status: PrinterStatus | null;
  isConnected: boolean;
  onStart: () => void;
  onStop: () => void;
  onJetStop: () => void;
  onNewMessage: () => void;
  onEditMessage: () => void;
  onSignIn: () => void;
  onHelp: () => void;
  onMount?: () => void;
  onUnmount?: () => void;
}

export function Dashboard({
  status,
  isConnected,
  onStart,
  onStop,
  onJetStop,
  onNewMessage,
  onEditMessage,
  onSignIn,
  onHelp,
  onMount,
  onUnmount,
}: DashboardProps) {
  // Notify parent when this screen mounts/unmounts for polling control
  useEffect(() => {
    onMount?.();
    return () => onUnmount?.();
  }, [onMount, onUnmount]);

  // Derive HV state from status
  const isHvOn = status?.isRunning ?? false;
  return (
    <div className="flex-1 flex flex-col">
      {/* Ready banner - only shown when HV is on */}
      {isHvOn && (
        <div className="w-full py-3 px-6 flex items-center justify-center bg-gradient-to-r from-green-600 via-green-500 to-green-400">
          <span className="text-xl font-bold text-white tracking-wide drop-shadow-md">
            Ready
          </span>
        </div>
      )}
      
      <div className="flex-1 p-4 flex flex-col gap-4">
      {/* Top row buttons */}
      <div className="flex gap-2">
        <button 
          onClick={onSignIn}
          className="industrial-button-gray text-white px-4 py-3 rounded-lg flex flex-col items-center justify-center min-w-[100px]"
        >
          <Key className="w-10 h-10 mb-1" />
          <span className="text-sm">Sign In</span>
        </button>

        <button 
          onClick={onHelp}
          className="industrial-button text-white px-4 py-3 rounded-lg flex flex-col items-center justify-center min-w-[100px]"
        >
          <HelpCircle className="w-10 h-10 mb-1" />
          <span className="text-sm">Help</span>
        </button>

        <button 
          onClick={isHvOn ? onStop : onStart}
          disabled={!isConnected}
          className={`${isHvOn ? 'industrial-button-success' : 'industrial-button-danger'} text-white px-4 py-3 rounded-lg flex flex-col items-center justify-center min-w-[100px] disabled:opacity-50`}
        >
          <PrinterIcon className="w-10 h-10 mb-1" />
          <span className="text-sm">{isHvOn ? 'HV On' : 'HV Off'}</span>
        </button>

        <button className="industrial-button text-white px-4 py-3 rounded-lg flex flex-col items-center justify-center min-w-[100px]">
          <div className="relative">
            <Droplets className="w-10 h-10" />
            {status?.makeupGood && (
              <Wifi className="w-4 h-4 absolute -top-1 -right-1 text-white" />
            )}
          </div>
          <span className="text-sm">Makeup Good</span>
        </button>

        <button className="industrial-button text-white px-4 py-3 rounded-lg flex flex-col items-center justify-center min-w-[100px]">
          <div className="relative">
            <Palette className="w-10 h-10" />
            {status?.inkFull && (
              <span className="absolute -top-1 -right-1 text-white text-lg">✓</span>
            )}
          </div>
          <span className="text-sm">Ink Full</span>
        </button>

        {/* Start/Stop buttons */}
        <div className="flex flex-col gap-2 ml-auto">
          <button
            onClick={onStart}
            disabled={!isConnected || status?.isRunning}
            className="industrial-button-success text-white px-8 py-4 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Play className="w-10 h-10" />
            <span className="text-xl font-medium">Start</span>
          </button>

          <button
            onClick={onJetStop}
            disabled={!isConnected || !status?.isRunning}
            className="industrial-button-danger text-white px-8 py-4 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Square className="w-6 h-6" />
            <span className="text-xl font-medium">Stop</span>
          </button>
        </div>
      </div>

      {/* Middle section */}
      <div className="flex gap-4">
        {/* Error message area */}
        <div className="flex-1 bg-card rounded-lg p-4 min-h-[80px] flex items-center">
          {status?.errorMessage ? (
            <div className="text-lg">
              <div className="font-medium">Message name</div>
              <div className="text-foreground">{status.errorMessage.split(' ').slice(1).join(' ')}</div>
            </div>
          ) : (
            <div className="text-muted-foreground">No errors</div>
          )}
        </div>

        {/* New/Edit buttons */}
        <div className="flex flex-col gap-2">
          <button 
            onClick={onNewMessage}
            className="industrial-button text-white px-6 py-3 rounded-lg flex items-center gap-2"
          >
            <Plus className="w-6 h-6" />
            <span className="text-lg font-medium">New</span>
          </button>
          <button 
            onClick={onEditMessage}
            className="industrial-button text-white px-6 py-3 rounded-lg flex items-center gap-2"
          >
            <Pencil className="w-6 h-6" />
            <span className="text-lg font-medium">Edit</span>
          </button>
        </div>

        {/* Count panel */}
        <div className="bg-primary text-primary-foreground rounded-lg p-6 min-w-[200px]">
          <div className="flex justify-between items-center mb-4">
            <span className="text-lg">Product count:</span>
            <span className="font-bold text-3xl">{status?.productCount ?? 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-lg">Print count:</span>
            <span className="font-bold text-3xl">{status?.printCount ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Message preview area */}
      <div className="flex-1 bg-card rounded-lg p-4">
        {status?.currentMessage && (
          <div className="text-lg font-mono">
            <span className="font-bold">{status.currentMessage}</span>
            <span className="ml-4 text-muted-foreground">
              {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </span>
            <div className="text-muted-foreground">
              {new Date().toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' })}
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
  );
}
