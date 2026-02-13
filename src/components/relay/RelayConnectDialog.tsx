import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wifi, WifiOff, Loader2, CheckCircle2, Smartphone } from 'lucide-react';
import { getRelayConfig, setRelayConfig, testRelayConnection, type RelayConfig } from '@/lib/printerTransport';

interface RelayConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => void;
}

export function RelayConnectDialog({ open, onOpenChange, onConnected }: RelayConnectDialogProps) {
  const [pcIp, setPcIp] = useState('');
  const [port, setPort] = useState('8766');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; version?: string; error?: string } | null>(null);

  // Load existing config on open
  useEffect(() => {
    if (open) {
      const existing = getRelayConfig();
      if (existing) {
        setPcIp(existing.pcIp);
        setPort(String(existing.port || 8766));
      }
      setResult(null);
    }
  }, [open]);

  const handleTest = async () => {
    if (!pcIp.trim()) return;
    setTesting(true);
    setResult(null);
    const config: RelayConfig = { pcIp: pcIp.trim(), port: parseInt(port) || 8766 };
    const res = await testRelayConnection(config);
    setResult(res);
    setTesting(false);
  };

  const handleConnect = () => {
    const config: RelayConfig = { pcIp: pcIp.trim(), port: parseInt(port) || 8766 };
    setRelayConfig(config);
    onOpenChange(false);
    onConnected?.();
  };

  const handleDisconnect = () => {
    setRelayConfig(null);
    setResult(null);
    setPcIp('');
    onOpenChange(false);
    onConnected?.();
  };

  const isConnected = !!getRelayConfig();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Connect via PC
          </DialogTitle>
          <DialogDescription>
            Enter the IP address of the PC running CodeSync to relay printer commands through it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pc-ip">PC IP Address</Label>
            <Input
              id="pc-ip"
              placeholder="e.g. 192.168.1.50"
              value={pcIp}
              onChange={(e) => { setPcIp(e.target.value); setResult(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleTest()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="relay-port">Port</Label>
            <Input
              id="relay-port"
              placeholder="8766"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-24"
            />
          </div>

          {/* Test result */}
          {result && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              result.ok 
                ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20' 
                : 'bg-destructive/10 text-destructive border border-destructive/20'
            }`}>
              {result.ok ? (
                <>
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Connected! CodeSync v{result.version} found on PC.</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 flex-shrink-0" />
                  <span>Cannot reach PC: {result.error}</span>
                </>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleTest}
              disabled={!pcIp.trim() || testing}
              variant="outline"
              className="flex-1"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wifi className="w-4 h-4 mr-2" />
              )}
              Test Connection
            </Button>

            <Button
              onClick={handleConnect}
              disabled={!result?.ok}
              className="flex-1"
            >
              Use This PC
            </Button>
          </div>

          {isConnected && (
            <Button
              onClick={handleDisconnect}
              variant="destructive"
              className="w-full"
            >
              Disconnect from PC
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            Make sure the CodeSync desktop app is running on the PC and both devices are on the same WiFi network.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
