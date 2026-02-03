import { useState, useEffect } from 'react';
import { Settings, Sun, Moon, Home } from 'lucide-react';
import { useTheme } from 'next-themes';

interface HeaderProps {
  isConnected: boolean;
  connectedIp?: string;
  onSettings?: () => void;
  onHome?: () => void;
  printerTime?: Date | null;
}

export function Header({ isConnected, connectedIp, onSettings, onHome, printerTime }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Use printer time when connected, otherwise use local time
  const displayTime = isConnected && printerTime ? printerTime : currentTime;

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

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
        {isConnected && (
          <div className="px-4 py-2 rounded bg-success text-white text-sm font-medium">
            <div className="text-xs">Connected</div>
            <div>{connectedIp}</div>
          </div>
        )}

        {mounted && (
          <button 
            onClick={toggleTheme}
            className="w-12 h-12 rounded-full bg-muted-foreground/50 flex items-center justify-center hover:bg-muted-foreground/70 transition-colors"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 text-card" />
            ) : (
              <Moon className="w-5 h-5 text-card" />
            )}
          </button>
        )}

        {onHome && (
          <button 
            onClick={onHome}
            className="w-12 h-12 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors"
          >
            <Home className="w-6 h-6 text-primary-foreground" />
          </button>
        )}

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
