import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  ArrowLeft, Play, Square, Send, Trash2, Download, 
  AlertTriangle, Terminal, ClipboardCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DiagnosticTestProcedure } from '@/components/diagnostics/DiagnosticTestProcedure';

interface DiagEntry {
  id: number;
  ts: number;
  date: Date;
  type: 'tx' | 'rx' | 'err' | 'info' | 'timing';
  message: string;
  rawHex?: string;
  elapsed?: number;
}

export default function DiagnosticsPage() {
  const navigate = useNavigate();
  const [ip, setIp] = useState('192.168.0.100');
  const [port, setPort] = useState(23);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [logs, setLogs] = useState<DiagEntry[]>([]);
  const [cmd, setCmd] = useState('');
  const [autoHex, setAutoHex] = useState(true);
  const [activeTab, setActiveTab] = useState('tests');

  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTxTime = useRef<number>(0);
  const DIAG_PRINTER_ID = 9999;

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  const addLog = useCallback((type: DiagEntry['type'], message: string, rawHex?: string) => {
    const now = performance.now();
    const elapsed = type === 'rx' && lastTxTime.current > 0 
      ? Math.round((now - lastTxTime.current) * 100) / 100 
      : undefined;
    if (type === 'tx') lastTxTime.current = now;

    const entry: DiagEntry = {
      id: idRef.current++,
      ts: now,
      date: new Date(),
      type,
      message,
      rawHex,
      elapsed,
    };
    setLogs(prev => [...prev, entry]);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // --- Connection (for terminal tab) ---
  const handleConnect = useCallback(async () => {
    if (!isElectron) { addLog('err', 'Not running in Electron'); return; }
    setConnecting(true);
    addLog('info', `Connecting to ${ip}:${port}...`);
    const t0 = performance.now();
    try {
      const result = await window.electronAPI!.printer.connect({ id: DIAG_PRINTER_ID, ipAddress: ip, port });
      const dt = Math.round(performance.now() - t0);
      if (result.success) { setConnected(true); addLog('info', `✓ Connected in ${dt}ms`); }
      else addLog('err', `✗ Failed (${dt}ms): ${result.error}`);
    } catch (err: any) {
      addLog('err', `✗ Exception: ${err.message}`);
    } finally { setConnecting(false); }
  }, [ip, port, isElectron, addLog]);

  const handleDisconnect = useCallback(async () => {
    if (!isElectron) return;
    try {
      await window.electronAPI!.printer.disconnect(DIAG_PRINTER_ID);
      setConnected(false);
      addLog('info', 'Disconnected');
    } catch (err: any) { addLog('err', `Disconnect error: ${err.message}`); }
  }, [isElectron, addLog]);

  useEffect(() => {
    if (!window.electronAPI?.onPrinterConnectionLost) return;
    window.electronAPI.onPrinterConnectionLost(({ printerId }) => {
      if (printerId === DIAG_PRINTER_ID) { setConnected(false); addLog('err', '⚡ Connection lost'); }
    });
  }, [addLog]);

  // --- Send Command ---
  const sendCommand = useCallback(async (command: string) => {
    if (!isElectron || !command.trim()) return;
    const trimmed = command.trim();
    addLog('tx', trimmed);
    const t0 = performance.now();
    try {
      const result = await window.electronAPI!.printer.sendCommand(DIAG_PRINTER_ID, trimmed);
      const dt = Math.round((performance.now() - t0) * 100) / 100;
      if (result.success) {
        let hex: string | undefined;
        if (autoHex && result.response) {
          hex = Array.from(new TextEncoder().encode(result.response)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        }
        addLog('rx', result.response || '(empty)', hex);
        addLog('timing', `Round-trip: ${dt}ms`);
      } else {
        addLog('err', `Failed (${dt}ms): ${result.error}`);
        if (result.error?.includes('No active connection')) setConnected(false);
      }
    } catch (err: any) { addLog('err', `Exception: ${err.message}`); }
  }, [isElectron, autoHex, addLog]);

  const handleSend = () => { if (!cmd.trim()) return; sendCommand(cmd); setCmd(''); };
  const clearLogs = () => { setLogs([]); idRef.current = 0; };
  const exportLogs = () => {
    const content = logs.map(l => {
      const hex = l.rawHex ? `\n  HEX: ${l.rawHex}` : '';
      return `[${l.date.toISOString()}] [${l.type.toUpperCase()}] ${l.message}${hex}`;
    }).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diag-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getColor = (type: DiagEntry['type']) => {
    switch (type) {
      case 'tx': return 'text-blue-400';
      case 'rx': return 'text-green-400';
      case 'err': return 'text-red-400';
      case 'info': return 'text-yellow-400';
      case 'timing': return 'text-purple-400';
    }
  };

  const getPrefix = (type: DiagEntry['type']) => {
    switch (type) {
      case 'tx': return '→ TX:';
      case 'rx': return '← RX:';
      case 'err': return '✗ ERR:';
      case 'info': return 'ℹ';
      case 'timing': return '⏱';
    }
  };

  const quickCommands = [
    { label: '^SU', desc: 'Status' },
    { label: '^VV', desc: 'Version' },
    { label: '^LE', desc: 'Errors' },
    { label: '^LM', desc: 'Messages' },
    { label: '^SD', desc: 'Date' },
    { label: '^TP', desc: 'Temps' },
  ];

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold">Telnet Diagnostics</h1>

        {/* Connection config — shared across tabs */}
        <div className="flex items-center gap-2 ml-4">
          <Label className="text-xs text-muted-foreground">IP:</Label>
          <Input value={ip} onChange={e => setIp(e.target.value)} className="font-mono text-sm w-36 h-8" />
          <Label className="text-xs text-muted-foreground">Port:</Label>
          <Input type="number" value={port} onChange={e => setPort(Number(e.target.value))} className="font-mono text-sm w-16 h-8" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!isElectron && (
            <Badge variant="outline" className="border-yellow-500 text-yellow-500">
              <AlertTriangle className="w-3 h-3 mr-1" /> No Electron
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-3 mt-2 w-fit">
          <TabsTrigger value="tests" className="gap-1">
            <ClipboardCheck className="w-4 h-4" /> Test Procedure
          </TabsTrigger>
          <TabsTrigger value="terminal" className="gap-1">
            <Terminal className="w-4 h-4" /> Raw Terminal
          </TabsTrigger>
        </TabsList>

        {/* ═══ TEST PROCEDURE TAB ═══ */}
        <TabsContent value="tests" className="flex-1 overflow-hidden mt-0">
          <DiagnosticTestProcedure ip={ip} port={port} printerId={DIAG_PRINTER_ID} isElectron={isElectron} />
        </TabsContent>

        {/* ═══ RAW TERMINAL TAB ═══ */}
        <TabsContent value="terminal" className="flex-1 overflow-hidden mt-0">
          <div className="flex h-full overflow-hidden">
            {/* Left — Controls */}
            <div className="w-72 border-r border-border p-3 flex flex-col gap-3 overflow-y-auto shrink-0">
              <Card>
                <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Connection</CardTitle></CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="flex gap-2">
                    {!connected ? (
                      <Button size="sm" onClick={handleConnect} disabled={connecting} className="flex-1 bg-green-600 hover:bg-green-700">
                        <Play className="w-4 h-4 mr-1" /> {connecting ? '...' : 'Connect'}
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive" onClick={handleDisconnect} className="flex-1">
                        <Square className="w-4 h-4 mr-1" /> Disconnect
                      </Button>
                    )}
                  </div>
                  <Badge variant={connected ? 'default' : 'destructive'} className="mt-2 w-full justify-center">
                    {connected ? 'CONNECTED' : 'DISCONNECTED'}
                  </Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Quick Commands</CardTitle></CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="grid grid-cols-3 gap-1.5">
                    {quickCommands.map(qc => (
                      <Button key={qc.label} size="sm" variant="outline" disabled={!connected} onClick={() => sendCommand(qc.label)} className="text-xs font-mono" title={qc.desc}>
                        {qc.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <label className="flex items-center gap-2 text-sm px-1">
                <input type="checkbox" checked={autoHex} onChange={e => setAutoHex(e.target.checked)} />
                Show hex dump
              </label>
            </div>

            {/* Right — Log */}
            <div className="flex-1 flex flex-col bg-card">
              <div className="flex items-center gap-2 p-2 border-b border-border shrink-0">
                <span className="text-xs text-muted-foreground font-mono">{logs.length} entries</span>
                <div className="flex-1" />
                <Button size="sm" variant="ghost" onClick={exportLogs}><Download className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={clearLogs}><Trash2 className="w-4 h-4" /></Button>
              </div>

              <ScrollArea className="flex-1 p-3" ref={scrollRef}>
                <div className="font-mono text-xs space-y-0.5">
                  {logs.length === 0 ? (
                    <div className="text-muted-foreground italic py-8 text-center">Connect and send commands...</div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id}>
                        <div className="flex gap-2 hover:bg-muted/30 px-1 rounded">
                          <span className="text-muted-foreground/50 shrink-0">
                            {log.date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}.{log.date.getMilliseconds().toString().padStart(3, '0')}
                          </span>
                          <span className={`${getColor(log.type)} shrink-0 w-12`}>{getPrefix(log.type)}</span>
                          {log.elapsed != null && <span className="text-purple-500 shrink-0">[{log.elapsed}ms]</span>}
                          <span className="text-foreground/90 break-all whitespace-pre-wrap">{log.message}</span>
                        </div>
                        {log.rawHex && (
                          <div className="pl-[7.5rem] text-muted-foreground/50 text-[10px] break-all">HEX: {log.rawHex}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              <div className="p-3 border-t border-border shrink-0">
                <div className="flex gap-2">
                  <Input
                    value={cmd}
                    onChange={e => setCmd(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="Enter command..."
                    disabled={!connected}
                    className="font-mono text-sm bg-background border-border"
                  />
                  <Button onClick={handleSend} disabled={!connected || !cmd.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
