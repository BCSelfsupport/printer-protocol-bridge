import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  connectedIp?: string;
  onSettings?: () => void;
  printerTime?: Date | null;
}

export function Header({ isConnected, connectedIp, onSettings, printerTime }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Use printer time when connected, otherwise use local time
  const displayTime = isConnected && printerTime ? printerTime : currentTime;

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-muted">
      <div className="flex items-center gap-2">
        <div className="flex items-baseline">
          <span className="text-3xl font-bold italic text-blue-600">
            Code
          </span>
          <span className="text-3xl font-bold italic text-emerald-500">
            Sync
          </span>
          <span className="text-xs font-normal text-muted-foreground align-top ml-0.5">™</span>
        </div>
        <div className="px-2 py-0.5 bg-gradient-to-r from-blue-600 to-emerald-500 rounded text-[10px] font-bold text-white uppercase tracking-wider">
          Pro
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className={`px-4 py-2 rounded ${isConnected ? 'bg-success' : 'bg-muted-foreground'} text-white text-sm font-medium`}>
          {isConnected ? (
            <>
              <div className="text-xs">Connected</div>
              <div>{connectedIp}</div>
            </>
          ) : (
            'Not connected'
          )}
        </div>

        <button 
          onClick={onSettings}
          className="w-12 h-12 rounded-full bg-muted-foreground flex items-center justify-center hover:bg-muted-foreground/80 transition-colors"
        >
          <Settings className="w-6 h-6 text-card" />
        </button>

        <div className="text-right text-foreground min-w-[120px]">
          <div className="text-lg font-medium tabular-nums">
            {displayTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-sm tabular-nums">
            {displayTime.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>
    </header>
  );
}
