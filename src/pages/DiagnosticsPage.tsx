import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, Play, Square, Send, Trash2, Download, 
  RotateCcw, Timer, Zap, AlertTriangle 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DiagEntry {
  id: number;
  ts: number; // performance.now() for precision
  date: Date;
  type: 'tx' | 'rx' | 'err' | 'info' | 'timing';
  message: string;
  rawHex?: string;
  elapsed?: number; // ms since last TX
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
  const [cycleDelay, setCycleDelay] = useState(15);
  const [cycleRunning, setCycleRunning] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);

  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTxTime = useRef<number>(0);
  const cycleAbort = useRef(false);
  const DIAG_PRINTER_ID = 9999; // isolated ID so we don't conflict with real printers

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

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // --- Connection ---
  const handleConnect = useCallback(async () => {
    if (!isElectron) {
      addLog('err', 'Not running in Electron — TCP not available');
      return;
    }
    setConnecting(true);
    addLog('info', `Connecting to ${ip}:${port}...`);
    const t0 = performance.now();

    try {
      const result = await window.electronAPI!.printer.connect({ id: DIAG_PRINTER_ID, ipAddress: ip, port });
      const dt = Math.round(performance.now() - t0);
      if (result.success) {
        setConnected(true);
        addLog('info', `✓ Connected in ${dt}ms ${result.reused ? '(reused socket)' : '(new socket)'}`);
      } else {
        addLog('err', `✗ Connect failed after ${dt}ms: ${result.error}`);
      }
    } catch (err: any) {
      const dt = Math.round(performance.now() - t0);
      addLog('err', `✗ Connect exception after ${dt}ms: ${err.message}`);
    } finally {
      setConnecting(false);
    }
  }, [ip, port, isElectron, addLog]);

  const handleDisconnect = useCallback(async () => {
    if (!isElectron) return;
    const t0 = performance.now();
    try {
      await window.electronAPI!.printer.disconnect(DIAG_PRINTER_ID);
      setConnected(false);
      addLog('info', `Disconnected in ${Math.round(performance.now() - t0)}ms`);
    } catch (err: any) {
      addLog('err', `Disconnect error: ${err.message}`);
    }
  }, [isElectron, addLog]);

  // Listen for connection-lost
  useEffect(() => {
    if (!window.electronAPI?.onPrinterConnectionLost) return;
    window.electronAPI.onPrinterConnectionLost(({ printerId }) => {
      if (printerId === DIAG_PRINTER_ID) {
        setConnected(false);
        addLog('err', '⚡ Connection lost (printer closed socket)');
      }
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
        const resp = result.response || '(empty response)';
        // Show hex if enabled
        let hex: string | undefined;
        if (autoHex && result.response) {
          hex = Array.from(new TextEncoder().encode(result.response))
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');
        }
        addLog('rx', resp, hex);
        addLog('timing', `Round-trip: ${dt}ms`);
      } else {
        addLog('err', `Send failed (${dt}ms): ${result.error}`);
        if (result.error?.includes('No active connection')) {
          setConnected(false);
        }
      }
    } catch (err: any) {
      const dt = Math.round(performance.now() - t0);
      addLog('err', `Send exception (${dt}ms): ${err.message}`);
    }
  }, [isElectron, autoHex, addLog]);

  const handleSend = () => {
    if (!cmd.trim()) return;
    sendCommand(cmd);
    setCmd('');
  };

  // --- Lifecycle Test ---
  const runLifecycleTest = useCallback(async () => {
    if (!isElectron) return;
    setCycleRunning(true);
    setCycleCount(0);
    cycleAbort.current = false;

    const testCommands = ['^SU', '^VV', '^LE'];

    for (let i = 0; i < 10; i++) {
      if (cycleAbort.current) break;
      setCycleCount(i + 1);
      addLog('info', `━━━ Cycle ${i + 1}/10 ━━━`);

      // Connect
      addLog('info', `Connecting...`);
      const t0 = performance.now();
      try {
        const r = await window.electronAPI!.printer.connect({ id: DIAG_PRINTER_ID, ipAddress: ip, port });
        const dt = Math.round(performance.now() - t0);
        if (r.success) {
          setConnected(true);
          addLog('info', `✓ Connected in ${dt}ms`);
        } else {
          addLog('err', `✗ Connect failed (${dt}ms): ${r.error}`);
          addLog('info', `Waiting ${cycleDelay}s before retry...`);
          await sleep(cycleDelay * 1000);
          continue;
        }
      } catch (err: any) {
        addLog('err', `✗ Connect exception: ${err.message}`);
        await sleep(cycleDelay * 1000);
        continue;
      }

      // Send test commands
      for (const tc of testCommands) {
        if (cycleAbort.current) break;
        await sendCommand(tc);
        await sleep(500);
      }

      // Disconnect
      addLog('info', `Disconnecting...`);
      try {
        await window.electronAPI!.printer.disconnect(DIAG_PRINTER_ID);
        setConnected(false);
        addLog('info', `✓ Disconnected`);
      } catch (err: any) {
        addLog('err', `Disconnect error: ${err.message}`);
      }

      if (i < 9 && !cycleAbort.current) {
        addLog('info', `Waiting ${cycleDelay}s before next cycle...`);
        await sleep(cycleDelay * 1000);
      }
    }

    setCycleRunning(false);
    addLog('info', `━━━ Lifecycle test complete ━━━`);
  }, [isElectron, ip, port, cycleDelay, sendCommand, addLog]);

  // --- Multi-Session Test ---
  const runMultiSessionTest = useCallback(async () => {
    if (!isElectron) return;
    addLog('info', '━━━ Multi-Session Test ━━━');
    addLog('info', 'Attempting first connection...');

    const t0 = performance.now();
    const r1 = await window.electronAPI!.printer.connect({ id: DIAG_PRINTER_ID, ipAddress: ip, port });
    addLog('info', `Session 1: ${r1.success ? '✓ OK' : '✗ FAIL: ' + r1.error} (${Math.round(performance.now() - t0)}ms)`);

    if (r1.success) {
      setConnected(true);
      addLog('info', 'Attempting SECOND connection on different ID (testing firmware limit)...');
      const SECOND_ID = 9998;
      const t1 = performance.now();
      const r2 = await window.electronAPI!.printer.connect({ id: SECOND_ID, ipAddress: ip, port });
      addLog('info', `Session 2: ${r2.success ? '✓ OK (firmware allows multi-session!)' : '✗ BLOCKED: ' + r2.error} (${Math.round(performance.now() - t1)}ms)`);

      // Test if session 1 is still alive
      addLog('info', 'Testing if Session 1 still works...');
      const tr = await window.electronAPI!.printer.sendCommand(DIAG_PRINTER_ID, '^VV');
      addLog('info', `Session 1 after dual-connect: ${tr.success ? '✓ Still alive' : '✗ DEAD: ' + tr.error}`);

      // Cleanup second session
      await window.electronAPI!.printer.disconnect(SECOND_ID);
    }
    addLog('info', '━━━ Multi-Session Test Complete ━━━');
  }, [isElectron, ip, port, addLog]);

  // --- Rapid Fire Test ---
  const runRapidFireTest = useCallback(async () => {
    if (!isElectron || !connected) return;
    addLog('info', '━━━ Rapid Fire Test (10x ^SU, no delay) ━━━');
    const t0 = performance.now();
    let successes = 0;
    let failures = 0;

    for (let i = 0; i < 10; i++) {
      try {
        const r = await window.electronAPI!.printer.sendCommand(DIAG_PRINTER_ID, '^SU');
        if (r.success) successes++;
        else { failures++; addLog('err', `#${i + 1} failed: ${r.error}`); }
      } catch (err: any) {
        failures++;
        addLog('err', `#${i + 1} exception: ${err.message}`);
      }
    }

    const total = Math.round(performance.now() - t0);
    addLog('info', `Rapid fire done: ${successes}/10 OK, ${failures}/10 FAIL, total ${total}ms (avg ${Math.round(total / 10)}ms/cmd)`);
  }, [isElectron, connected, addLog]);

  // --- Utilities ---
  const clearLogs = () => { setLogs([]); idRef.current = 0; };

  const exportLogs = () => {
    const content = logs.map(l => {
      const time = l.date.toISOString();
      const elapsed = l.elapsed != null ? ` [${l.elapsed}ms]` : '';
      const hex = l.rawHex ? `\n  HEX: ${l.rawHex}` : '';
      return `[${time}] [${l.type.toUpperCase()}]${elapsed} ${l.message}${hex}`;
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

  // Quick command buttons
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
      <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold">Telnet Diagnostics</h1>
        <Badge variant={connected ? 'default' : 'destructive'} className="ml-auto">
          {connected ? 'CONNECTED' : 'DISCONNECTED'}
        </Badge>
        {!isElectron && (
          <Badge variant="outline" className="border-yellow-500 text-yellow-500">
            <AlertTriangle className="w-3 h-3 mr-1" /> No Electron
          </Badge>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel — Controls */}
        <div className="w-80 border-r border-border p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
          {/* Connection */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Connection</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div>
                <Label className="text-xs">IP Address</Label>
                <Input value={ip} onChange={e => setIp(e.target.value)} className="font-mono text-sm" disabled={connected} />
              </div>
              <div>
                <Label className="text-xs">Port</Label>
                <Input type="number" value={port} onChange={e => setPort(Number(e.target.value))} className="font-mono text-sm" disabled={connected} />
              </div>
              <div className="flex gap-2">
                {!connected ? (
                  <Button size="sm" onClick={handleConnect} disabled={connecting} className="flex-1 bg-green-600 hover:bg-green-700">
                    <Play className="w-4 h-4 mr-1" /> {connecting ? 'Connecting...' : 'Connect'}
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={handleDisconnect} className="flex-1">
                    <Square className="w-4 h-4 mr-1" /> Disconnect
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Commands */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Quick Commands</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-3 gap-2">
                {quickCommands.map(qc => (
                  <Button
                    key={qc.label}
                    size="sm"
                    variant="outline"
                    disabled={!connected}
                    onClick={() => sendCommand(qc.label)}
                    className="text-xs font-mono"
                    title={qc.desc}
                  >
                    {qc.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Automated Tests */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Automated Tests</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div>
                <Label className="text-xs">Cycle Delay (seconds)</Label>
                <Input type="number" value={cycleDelay} onChange={e => setCycleDelay(Number(e.target.value))} className="font-mono text-sm" />
              </div>

              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={cycleRunning}
                onClick={runLifecycleTest}
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Lifecycle Test (10 cycles)
                {cycleRunning && ` — ${cycleCount}/10`}
              </Button>

              {cycleRunning && (
                <Button size="sm" variant="destructive" className="w-full" onClick={() => { cycleAbort.current = true; }}>
                  Abort
                </Button>
              )}

              <Separator />

              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={runMultiSessionTest}
              >
                <Zap className="w-4 h-4 mr-1" />
                Multi-Session Test
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={!connected}
                onClick={runRapidFireTest}
              >
                <Timer className="w-4 h-4 mr-1" />
                Rapid Fire (10x ^SU)
              </Button>
            </CardContent>
          </Card>

          {/* Options */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Options</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={autoHex} onChange={e => setAutoHex(e.target.checked)} />
                Show hex dump
              </label>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel — Log Output */}
        <div className="flex-1 flex flex-col bg-card">
          {/* Log toolbar */}
          <div className="flex items-center gap-2 p-2 border-b border-border shrink-0">
            <span className="text-xs text-muted-foreground font-mono">{logs.length} entries</span>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={exportLogs} title="Export">
              <Download className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={clearLogs} title="Clear">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Log area */}
          <ScrollArea className="flex-1 p-3" ref={scrollRef}>
            <div className="font-mono text-xs space-y-0.5">
              {logs.length === 0 ? (
                <div className="text-muted-foreground italic py-8 text-center">
                  Connect to a printer and send commands to begin diagnostics...
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id}>
                    <div className="flex gap-2 hover:bg-muted/30 px-1 rounded">
                      <span className="text-muted-foreground/50 shrink-0">
                        {log.date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}.{log.date.getMilliseconds().toString().padStart(3, '0')}
                      </span>
                      <span className={`${getColor(log.type)} shrink-0 w-12`}>
                        {getPrefix(log.type)}
                      </span>
                      {log.elapsed != null && (
                        <span className="text-purple-500 shrink-0">[{log.elapsed}ms]</span>
                      )}
                      <span className="text-foreground/90 break-all whitespace-pre-wrap">
                        {log.message}
                      </span>
                    </div>
                    {log.rawHex && (
                      <div className="pl-[7.5rem] text-muted-foreground/50 text-[10px] break-all">
                        HEX: {log.rawHex}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Command input */}
          <div className="p-3 border-t border-border shrink-0">
            <div className="flex gap-2">
              <Input
                value={cmd}
                onChange={e => setCmd(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Enter command (e.g., ^SU, ^LE, ^VV)..."
                disabled={!connected}
                className="font-mono text-sm bg-background border-border text-foreground placeholder:text-muted-foreground"
              />
              <Button onClick={handleSend} disabled={!connected || !cmd.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
