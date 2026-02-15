import { useState, useEffect, useRef } from 'react';
import { Settings, Sun, Moon, Home, Smartphone, Maximize, Minimize } from 'lucide-react';
import { useTheme } from 'next-themes';
import { getRelayConfig } from '@/lib/printerTransport';

declare const __APP_VERSION__: string;

interface HeaderProps {
  isConnected: boolean;
  connectedIp?: string;
  onSettings?: () => void;
  onHome?: () => void;
  printerTime?: Date | null;
  onRelayConnect?: () => void;
}

export function Header({ isConnected, connectedIp, onSettings, onHome, printerTime, onRelayConnect }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [appVersion, setAppVersion] = useState<string>(
    (() => {
      try {
        const v = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
        return v && v !== 'undefined' ? v : '0.0.0';
      } catch {
        return '0.0.0';
      }
    })()
  );

  useEffect(() => {
    setMounted(true);
    // Prefer Electron version if available
    if (window.electronAPI?.app?.getVersion) {
      window.electronAPI.app.getVersion().then(v => setAppVersion(v)).catch(() => {});
    }
  }, []);

  // Calculate offset between printer time and local time for smooth ticking
  const printerOffsetMs = useRef(0);
  
  useEffect(() => {
    if (isConnected && printerTime) {
      // Calculate how far the printer clock is from local clock
      printerOffsetMs.current = printerTime.getTime() - Date.now();
    } else {
      printerOffsetMs.current = 0;
    }
  }, [isConnected, printerTime]);

  useEffect(() => {
    const timer = setInterval(() => {
      // Apply the printer offset to local time for smooth ticking
      if (isConnected && printerTime) {
        setCurrentTime(new Date(Date.now() + printerOffsetMs.current));
      } else {
        setCurrentTime(new Date());
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isConnected, printerTime]);

  const displayTime = currentTime;

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    // Try Electron API first
    if (window.electronAPI?.app?.toggleFullscreen) {
      window.electronAPI.app.toggleFullscreen();
      return;
    }
    // Browser fullscreen API fallback
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  return (
    <header className="bg-muted overflow-hidden">
      <div className="flex items-center justify-between px-2 md:px-4 py-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          
          <div className="flex items-start">
            <span className="text-xl md:text-3xl font-bold italic text-blue-600">
              Code
            </span>
            <span className="text-xl md:text-3xl font-bold italic text-emerald-500">
              Sync
            </span>
            <span className="text-xs md:text-base font-normal text-muted-foreground mt-0.5 ml-0.5 leading-none">™</span>
          </div>
          {appVersion && (
            <span className="text-[10px] text-muted-foreground font-mono ml-1 self-end mb-0.5">
              v{appVersion}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 md:gap-4 flex-shrink-0 ml-2 md:ml-4">
          {/* Relay mode indicator for mobile PWA */}
          {!window.electronAPI && onRelayConnect && (
            <button
              onClick={onRelayConnect}
              className={`w-8 h-8 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
                getRelayConfig() 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-muted-foreground/50 hover:bg-muted-foreground/70'
              }`}
              title={getRelayConfig() ? `Relay: ${getRelayConfig()?.pcIp}` : 'Connect via PC'}
            >
              <Smartphone className={`w-3.5 h-3.5 md:w-5 md:h-5 ${getRelayConfig() ? 'text-white' : 'text-card'}`} />
            </button>
          )}

          {isConnected && (
            <div className="px-1.5 md:px-4 py-1 md:py-2 rounded bg-success text-white text-[9px] md:text-sm font-medium flex-shrink-0">
              <div className="text-[8px] md:text-xs">Connected</div>
              <div className="text-[9px] md:text-sm">{connectedIp}</div>
            </div>
          )}

          {mounted && (
            <button 
              onClick={toggleTheme}
              className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-muted-foreground/50 flex items-center justify-center hover:bg-muted-foreground/70 transition-colors flex-shrink-0"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 md:w-5 md:h-5 text-card" />
              ) : (
                <Moon className="w-3.5 h-3.5 md:w-5 md:h-5 text-card" />
              )}
            </button>
          )}

          <button 
            onClick={toggleFullscreen}
            className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-muted-foreground/50 flex items-center justify-center hover:bg-muted-foreground/70 transition-colors flex-shrink-0"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <Minimize className="w-3.5 h-3.5 md:w-5 md:h-5 text-card" />
            ) : (
              <Maximize className="w-3.5 h-3.5 md:w-5 md:h-5 text-card" />
            )}
          </button>

          {onHome && (
            <button 
              onClick={onHome}
              className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors flex-shrink-0"
            >
              <Home className="w-4 h-4 md:w-6 md:h-6 text-primary-foreground" />
            </button>
          )}


          <div className="text-right text-foreground min-w-[70px] md:min-w-[120px] flex-shrink-0">
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
