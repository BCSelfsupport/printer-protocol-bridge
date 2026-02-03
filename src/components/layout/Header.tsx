import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  connectedIp?: string;
}

export function Header({ isConnected, connectedIp }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-muted">
      <div className="flex items-center gap-2">
        <div className="flex items-baseline">
          <span className="text-2xl font-bold italic text-blue-600">
            code
          </span>
          <span className="text-2xl font-bold italic text-emerald-500">
            sync
          </span>
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

        <button className="w-12 h-12 rounded-full bg-muted-foreground flex items-center justify-center">
          <Settings className="w-6 h-6 text-card" />
        </button>

        <div className="text-right text-foreground">
          <div className="text-lg font-medium">
            {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-sm">
            {currentTime.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>
    </header>
  );
}
