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
    <header className="bg-muted overflow-x-auto">
      <div className="flex items-center justify-between px-2 md:px-4 py-2 min-w-max">
        <div className="flex items-center gap-2 flex-shrink-0">
          
          <div className="flex items-baseline">
            <span className="text-xl md:text-3xl font-bold italic text-blue-600">
              Code
            </span>
            <span className="text-xl md:text-3xl font-bold italic text-emerald-500">
              Sync
            </span>
            <span className="text-[8px] md:text-xs font-normal text-muted-foreground align-top ml-0.5">™</span>
          </div>
          <div className="px-1.5 md:px-2 py-0.5 bg-gradient-to-r from-blue-600 to-emerald-500 rounded text-[8px] md:text-[10px] font-bold text-white uppercase tracking-wider">
            Pro
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0 ml-4">
          {isConnected && (
            <div className="px-2 md:px-4 py-1 md:py-2 rounded bg-success text-white text-xs md:text-sm font-medium flex-shrink-0">
              <div className="text-[10px] md:text-xs">Connected</div>
              <div className="text-xs md:text-sm">{connectedIp}</div>
            </div>
          )}

          {mounted && (
            <button 
              onClick={toggleTheme}
              className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-muted-foreground/50 flex items-center justify-center hover:bg-muted-foreground/70 transition-colors flex-shrink-0"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 md:w-5 md:h-5 text-card" />
              ) : (
                <Moon className="w-4 h-4 md:w-5 md:h-5 text-card" />
              )}
            </button>
          )}

          {onHome && (
            <button 
              onClick={onHome}
              className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors flex-shrink-0"
            >
              <Home className="w-5 h-5 md:w-6 md:h-6 text-primary-foreground" />
            </button>
          )}

          <button 
            onClick={onSettings}
            className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-muted-foreground flex items-center justify-center hover:bg-muted-foreground/80 transition-colors flex-shrink-0"
          >
            <Settings className="w-5 h-5 md:w-6 md:h-6 text-card" />
          </button>

          <div className="text-right text-foreground min-w-[80px] md:min-w-[120px] flex-shrink-0">
            <div className="text-sm md:text-lg font-medium tabular-nums">
              {displayTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-xs md:text-sm tabular-nums">
              {displayTime.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
