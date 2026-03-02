import { useState, useEffect } from 'react';
import {
  Webhook, FolderOpen, Database, Copy, CheckCircle2,
  Globe, Server, HardDrive, RefreshCw, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface IntegrationConfigProps {
  projectId: string;
}

export function IntegrationConfig({ projectId }: IntegrationConfigProps) {
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [hotfolderPath, setHotfolderPath] = useState('');
  const [hotfolderEnabled, setHotfolderEnabled] = useState(false);
  const [hotfolderPolling, setHotfolderPolling] = useState(5);
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState('3306');
  const [dbName, setDbName] = useState('');
  const [dbTable, setDbTable] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPollingInterval, setDbPollingInterval] = useState(10);
  const [dbEnabled, setDbEnabled] = useState(false);

  const isElectron = !!(window as any).electronAPI?.isElectron;

  const apiEndpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/receive-print-data`;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Load saved hotfolder/db config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('codesync-integrations');
      if (saved) {
        const config = JSON.parse(saved);
        if (config.hotfolder) {
          setHotfolderPath(config.hotfolder.path || '');
          setHotfolderEnabled(config.hotfolder.enabled || false);
          setHotfolderPolling(config.hotfolder.pollingSeconds || 5);
        }
        if (config.database) {
          setDbHost(config.database.host || '');
          setDbPort(config.database.port || '3306');
          setDbName(config.database.name || '');
          setDbTable(config.database.table || '');
          setDbUser(config.database.user || '');
          setDbPollingInterval(config.database.pollingSeconds || 10);
          setDbEnabled(config.database.enabled || false);
        }
      }
    } catch {}
  }, []);

  const saveConfig = (updates: Record<string, any>) => {
    try {
      const saved = localStorage.getItem('codesync-integrations');
      const config = saved ? JSON.parse(saved) : {};
      const merged = { ...config, ...updates };
      localStorage.setItem('codesync-integrations', JSON.stringify(merged));
    } catch {}
  };

  const handleCopyEndpoint = () => {
    navigator.clipboard.writeText(apiEndpoint);
    setCopiedEndpoint(true);
    toast.success('API endpoint copied');
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    toast.success('API key copied');
  };

  const handleSaveHotfolder = () => {
    saveConfig({
      hotfolder: {
        path: hotfolderPath,
        enabled: hotfolderEnabled,
        pollingSeconds: hotfolderPolling,
      },
    });

    // Notify Electron if available
    if (isElectron && (window as any).electronAPI?.hotfolder?.configure) {
      (window as any).electronAPI.hotfolder.configure({
        path: hotfolderPath,
        enabled: hotfolderEnabled,
        pollingSeconds: hotfolderPolling,
      });
    }

    toast.success('Hotfolder settings saved');
  };

  const handleSaveDatabase = () => {
    saveConfig({
      database: {
        host: dbHost,
        port: dbPort,
        name: dbName,
        table: dbTable,
        user: dbUser,
        pollingSeconds: dbPollingInterval,
        enabled: dbEnabled,
      },
    });
    toast.success('Database connection settings saved');
  };

  const curlExample = `curl -X POST "${apiEndpoint}" \\
  -H "apikey: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "CANIX Export",
    "columns": ["Tag", "Strain", "Weight"],
    "rows": [
      {"Tag": "1A406...", "Strain": "OG Kush", "Weight": "3.5g"}
    ]
  }'`;

  const csvExample = `curl -X POST "${apiEndpoint}?name=CANIX+Tags" \\
  -H "apikey: YOUR_API_KEY" \\
  -H "Content-Type: text/csv" \\
  --data-binary @export.csv`;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* API / Webhook */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">API / Webhook Endpoint</CardTitle>
              <Badge variant="outline" className="ml-auto text-xs">Ready</Badge>
            </div>
            <CardDescription className="text-xs">
              Push data from CANIX, METRC, or any ERP system via HTTP POST. 
              Supports JSON and CSV payloads. Use <code>?mode=append</code> to add to an existing source.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Endpoint URL</Label>
              <div className="flex gap-2 mt-1">
                <Input value={apiEndpoint} readOnly className="font-mono text-xs" />
                <Button size="sm" variant="outline" onClick={handleCopyEndpoint}>
                  {copiedEndpoint ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">API Key (include as <code>apikey</code> header)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={apiKey ? `${apiKey.slice(0, 20)}...` : 'Not configured'}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button size="sm" variant="outline" onClick={handleCopyApiKey}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Examples */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                📋 Example: JSON POST
              </summary>
              <pre className="mt-2 p-3 bg-muted rounded-lg overflow-x-auto text-[10px] leading-relaxed">
                {curlExample}
              </pre>
            </details>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                📋 Example: CSV POST
              </summary>
              <pre className="mt-2 p-3 bg-muted rounded-lg overflow-x-auto text-[10px] leading-relaxed">
                {csvExample}
              </pre>
            </details>
          </CardContent>
        </Card>

        {/* Watched Folder (Hotfolder) */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-amber-500" />
              <CardTitle className="text-base">Watched Folder (Hotfolder)</CardTitle>
              {!isElectron && (
                <Badge variant="secondary" className="ml-auto text-xs">Desktop Only</Badge>
              )}
              {isElectron && hotfolderEnabled && (
                <Badge className="ml-auto text-xs bg-green-600">Active</Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Monitor a local or network folder for new CSV files. When a file appears, 
              it's auto-imported as a data source — just like BarTender's hotfolder integration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isElectron ? (
              <div className="flex items-start gap-2 p-3 bg-muted rounded-lg text-xs text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  Hotfolder monitoring requires the <strong>CodeSync Desktop</strong> app. 
                  Install the desktop version to enable folder watching for automated CSV imports.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Enable Hotfolder</Label>
                  <Switch
                    checked={hotfolderEnabled}
                    onCheckedChange={setHotfolderEnabled}
                  />
                </div>
                <div>
                  <Label className="text-xs">Folder Path</Label>
                  <Input
                    value={hotfolderPath}
                    onChange={(e) => setHotfolderPath(e.target.value)}
                    placeholder="C:\CANIX\Exports  or  \\server\share\exports"
                    className="mt-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Poll Interval (seconds)</Label>
                  <Input
                    type="number"
                    value={hotfolderPolling}
                    onChange={(e) => setHotfolderPolling(Number(e.target.value))}
                    min={1}
                    max={300}
                    className="mt-1 w-24"
                  />
                </div>
                <Button size="sm" onClick={handleSaveHotfolder}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Save & Apply
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Database Connection */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-500" />
              <CardTitle className="text-base">Database Connection</CardTitle>
              {!isElectron && (
                <Badge variant="secondary" className="ml-auto text-xs">Desktop Only</Badge>
              )}
              {isElectron && dbEnabled && (
                <Badge className="ml-auto text-xs bg-green-600">Active</Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Connect directly to CANIX or another ERP database via ODBC/MySQL. 
              CodeSync polls the table for new rows and auto-imports them — 
              same approach BarTender uses for database-driven printing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isElectron ? (
              <div className="flex items-start gap-2 p-3 bg-muted rounded-lg text-xs text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  Direct database connections require the <strong>CodeSync Desktop</strong> app. 
                  For web-based integration, use the API/Webhook endpoint above — 
                  CANIX can push data to it via HTTP.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Enable DB Polling</Label>
                  <Switch
                    checked={dbEnabled}
                    onCheckedChange={setDbEnabled}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Host</Label>
                    <Input
                      value={dbHost}
                      onChange={(e) => setDbHost(e.target.value)}
                      placeholder="192.168.1.100"
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Port</Label>
                    <Input
                      value={dbPort}
                      onChange={(e) => setDbPort(e.target.value)}
                      placeholder="3306"
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Database</Label>
                    <Input
                      value={dbName}
                      onChange={(e) => setDbName(e.target.value)}
                      placeholder="canix_production"
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Table / View</Label>
                    <Input
                      value={dbTable}
                      onChange={(e) => setDbTable(e.target.value)}
                      placeholder="print_queue"
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Username</Label>
                    <Input
                      value={dbUser}
                      onChange={(e) => setDbUser(e.target.value)}
                      placeholder="readonly_user"
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Poll Interval (sec)</Label>
                    <Input
                      type="number"
                      value={dbPollingInterval}
                      onChange={(e) => setDbPollingInterval(Number(e.target.value))}
                      min={1}
                      max={300}
                      className="mt-1 text-xs"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Password is stored securely in the desktop keychain — not shown here.
                </p>
                <Button size="sm" onClick={handleSaveDatabase}>
                  <HardDrive className="w-4 h-4 mr-1" /> Save Connection
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
