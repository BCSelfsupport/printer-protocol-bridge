/**
 * TntUplinkPanel — operator view of the Track-n-Trace TCP endpoint (Phase 1).
 *
 * Shows: server listen state, connected TnT peer, frame counters, last 25
 * frames in/out. Lets the operator enable the listener and pick the port.
 */
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Radio, Wifi, WifiOff, ArrowDown, ArrowUp } from 'lucide-react';
import { useTntUplink } from '@/twin-code/useTntUplink';

export function TntUplinkPanel() {
  const { supported, loading, state, config, setConfig } = useTntUplink();
  const [port, setPort] = useState(config.port);

  useEffect(() => { setPort(config.port); }, [config.port]);

  if (!supported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="w-4 h-4" /> Track-n-Trace Uplink
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Only available in the desktop app. Runs a TCP listener on the plant
          PC so Track-n-Trace can drive CodeSync as a DJDACP2D-03 endpoint.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="w-4 h-4" /> Track-n-Trace Uplink
          <span className="ml-auto flex items-center gap-2">
            {state.listening ? (
              state.connected
                ? <Badge className="bg-success text-success-foreground gap-1"><Wifi className="w-3 h-3" /> Connected</Badge>
                : <Badge variant="secondary" className="gap-1">Listening</Badge>
            ) : (
              <Badge variant="outline" className="gap-1"><WifiOff className="w-3 h-3" /> Off</Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              id="tnt-enabled"
              checked={config.enabled}
              disabled={loading}
              onCheckedChange={(enabled) => setConfig({ enabled, port })}
            />
            <Label htmlFor="tnt-enabled" className="text-sm">Enable listener</Label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">TCP port</Label>
            <Input
              type="number"
              className="w-28"
              value={port}
              min={1}
              max={65535}
              onChange={(e) => setPort(Number(e.target.value) || 8101)}
              onBlur={() => { if (port !== config.port) setConfig({ enabled: config.enabled, port }); }}
            />
          </div>
          <div className="text-xs text-muted-foreground ml-auto">
            {state.peer ? `Peer: ${state.peer}` : 'No client connected'}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 text-center">
          <Metric label="Frames In" value={state.framesIn} />
          <Metric label="Frames Out" value={state.framesOut} />
          <Metric label="Port" value={state.port} />
          <Metric label="Last frame" value={state.lastFrameAt ? new Date(state.lastFrameAt).toLocaleTimeString() : '—'} />
        </div>

        {state.lastError && (
          <div className="text-xs text-destructive">Error: {state.lastError}</div>
        )}

        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Recent frames</div>
          <div className="border border-border rounded max-h-64 overflow-y-auto">
            {state.recent.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">No frames yet.</div>
            )}
            {state.recent.slice().reverse().map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-border last:border-b-0 font-mono">
                {f.dir === 'in'
                  ? <ArrowDown className="w-3 h-3 text-primary" />
                  : <ArrowUp className="w-3 h-3 text-success" />}
                <span className="w-20 shrink-0 text-muted-foreground">{new Date(f.at).toLocaleTimeString()}</span>
                <span className="w-16 shrink-0 font-semibold">{f.name}</span>
                <span className="w-14 shrink-0 text-muted-foreground">{f.size}B</span>
                <span className="truncate flex-1 text-muted-foreground">
                  {f.json ? JSON.stringify(f.json) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Phase 1: transport only. Inbound Config/Print/Request frames are
          logged and surfaced here; wiring into the TwinCode dispatcher lands
          in Phase 2 once the DJDACP2D-03 byte layout is confirmed against a
          live pcap.
        </p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card flex-col items-start gap-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-lg font-bold tabular-nums">{value}</span>
    </div>
  );
}
