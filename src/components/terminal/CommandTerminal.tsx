import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Trash2, Download } from 'lucide-react';

interface LogEntry {
  id: number;
  timestamp: Date;
  type: 'sent' | 'received' | 'error' | 'info';
  message: string;
}

interface CommandTerminalProps {
  printerId: number | null;
  ipAddress: string;
  port: number;
  isConnected?: boolean;
  onConnect?: (printer: { id: number; name: string; ipAddress: string; port: number; isConnected: boolean; isAvailable: boolean; status: string; hasActiveErrors: boolean }) => Promise<void>;
  onDisconnect?: () => Promise<void>;
  onLog?: (entry: LogEntry) => void;
}

export function CommandTerminal({ 
  printerId, 
  ipAddress, 
  port, 
  isConnected: externalIsConnected,
  onConnect: externalConnect,
  onDisconnect: externalDisconnect,
  onLog,
}: CommandTerminalProps) {
  const [command, setCommand] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  // Use external connection state if provided, otherwise manage locally
  const [localIsConnected, setLocalIsConnected] = useState(false);
  const isConnected = externalIsConnected ?? localIsConnected;
  const [isConnecting, setIsConnecting] = useState(false);
  const logIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addLog = (type: LogEntry['type'], message: string) => {
    const entry: LogEntry = {
      id: logIdRef.current++,
      timestamp: new Date(),
      type,
      message,
    };
    setLogs(prev => [...prev, entry]);
    onLog?.(entry);
  };

  const handleConnect = async () => {
    if (!window.electronAPI) {
      addLog('error', 'Not running in Electron - TCP connections not available');
      return;
    }

    setIsConnecting(true);
    addLog('info', `Connecting to ${ipAddress}:${port}...`);

    try {
      const result = await window.electronAPI.printer.connect({
        id: printerId,
        ipAddress,
        port,
      });

      if (result.success) {
        // Use external connect if available, otherwise set local state
        if (externalConnect) {
          await externalConnect({
            id: printerId ?? 1,
            name: `Printer ${printerId ?? 1}`,
            ipAddress,
            port,
            isConnected: true,
            isAvailable: true,
            status: 'ready',
            hasActiveErrors: false,
          });
        } else {
          setLocalIsConnected(true);
        }
        addLog('info', `Connected successfully to ${ipAddress}:${port}`);
      } else {
        addLog('error', `Connection failed: ${result.error}`);
      }
    } catch (err) {
      addLog('error', `Connection error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.electronAPI) return;

    try {
      await window.electronAPI.printer.disconnect(printerId);
      // Use external disconnect if available, otherwise set local state
      if (externalDisconnect) {
        await externalDisconnect();
      } else {
        setLocalIsConnected(false);
      }
      addLog('info', 'Disconnected');
    } catch (err) {
      addLog('error', `Disconnect error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Listen for connection lost events from the main process
  useEffect(() => {
    if (!window.electronAPI?.onPrinterConnectionLost) return;

    window.electronAPI.onPrinterConnectionLost(({ printerId: lostId }) => {
      if (lostId === printerId) {
        if (externalDisconnect) {
          externalDisconnect();
        } else {
          setLocalIsConnected(false);
        }
        addLog('error', 'Connection lost (printer closed the socket)');
      }
    });
    // Electron IPC listeners are process-wide; we don't remove listeners here.
    // (Preload uses ipcRenderer.on without exposing an off method.)
  }, [printerId, externalDisconnect]);

  const sendWithReconnect = async (cmd: string) => {
      if (!window.electronAPI) return;

      try {
        const result = await window.electronAPI.printer.sendCommand(printerId, cmd);

        if (result.success) {
          if (result.response) {
            const lines = result.response.split(/[\r\n]+/).filter(Boolean);
            lines.forEach(line => addLog('received', line));
          } else {
            addLog('received', '(no response)');
          }
          return;
        }

        addLog('error', `Send failed: ${result.error}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // If the printer/server closed the socket (common on Telnet servers), reconnect and retry once.
        if (message.includes('Printer not connected')) {
          if (externalDisconnect) {
            await externalDisconnect();
          } else {
            setLocalIsConnected(false);
          }
          addLog('info', 'Reconnecting...');
          await handleConnect();

          // small pause to allow banner/handshake
          await new Promise(r => setTimeout(r, 200));

          const retry = await window.electronAPI.printer.sendCommand(printerId, cmd);
          if (retry.success) {
            if (retry.response) {
              const lines = retry.response.split(/[\r\n]+/).filter(Boolean);
              lines.forEach(line => addLog('received', line));
            } else {
              addLog('received', '(no response)');
            }
            return;
          }
          addLog('error', `Send failed after reconnect: ${retry.error}`);
          return;
        }

        addLog('error', `Send error: ${message}`);
      }
  };

  const handleSend = async () => {
    if (!command.trim() || !window.electronAPI) return;

    const cmd = command.trim();
    addLog('sent', cmd);
    setCommand('');

    await sendWithReconnect(cmd);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const clearLogs = () => {
    setLogs([]);
    logIdRef.current = 0;
  };

  const exportLogs = () => {
    const content = logs.map(log => {
      const time = log.timestamp.toISOString();
      return `[${time}] [${log.type.toUpperCase()}] ${log.message}`;
    }).join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `printer-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'sent': return 'text-blue-400';
      case 'received': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'info': return 'text-yellow-400';
      default: return 'text-foreground';
    }
  };

  const getLogPrefix = (type: LogEntry['type']) => {
    switch (type) {
      case 'sent': return '→ TX:';
      case 'received': return '← RX:';
      case 'error': return '✗ ERR:';
      case 'info': return 'ℹ INFO:';
      default: return '';
    }
  };

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm font-mono text-slate-300">
            {ipAddress}:{port}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isConnected ? (
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={isConnecting}
              className="bg-green-600 hover:bg-green-700"
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDisconnect}
            >
              Disconnect
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={exportLogs} title="Export logs">
            <Download className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={clearLogs} title="Clear logs">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Log area */}
      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        <div className="font-mono text-sm space-y-1">
          {logs.length === 0 ? (
            <div className="text-slate-500 italic">
              Connect and send commands to see traffic here...
            </div>
          ) : (
            logs.map(log => (
              <div key={log.id} className="flex gap-2">
                <span className="text-slate-500 shrink-0">
                  {log.timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}.{log.timestamp.getMilliseconds().toString().padStart(3, '0')}
                </span>
                <span className={`${getLogColor(log.type)} shrink-0`}>
                  {getLogPrefix(log.type)}
                </span>
                <span className="text-slate-200 break-all">
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Command input */}
      <div className="p-3 border-t border-slate-700">
        <div className="flex gap-2">
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter command (e.g., ^SU, ^LE, ^VV)..."
            disabled={!isConnected}
            className="font-mono bg-slate-800 border-slate-600 text-slate-200 placeholder:text-slate-500"
          />
          <Button
            onClick={handleSend}
            disabled={!isConnected || !command.trim()}
            className="bg-primary hover:bg-primary/90"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Common commands: ^SU (status), ^LE (errors), ^VV (version), ^LM (list messages)
        </div>
      </div>
    </div>
  );
}
