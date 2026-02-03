import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { CommandTerminal } from '@/components/terminal/CommandTerminal';
import { Printer } from '@/types/printer';

const STORAGE_KEY = 'printer-network-settings';

interface NetworkSettings {
  ipAddress: string;
  subnetMask: string;
  gateway: string;
  dns1: string;
  dns2: string;
  port: string;
}

const defaultSettings: NetworkSettings = {
  ipAddress: '192.168.1.55',
  subnetMask: '255.255.255.0',
  gateway: '192.168.1.1',
  dns1: '8.8.8.8',
  dns2: '8.8.4.4',
  port: '23',
};

interface NetworkConfigScreenProps {
  onHome: () => void;
  isConnected?: boolean;
  connectedPrinter?: Printer | null;
  onConnect?: (printer: Printer) => Promise<void>;
  onDisconnect?: () => Promise<void>;
}

export function NetworkConfigScreen({ 
  onHome, 
  isConnected = false, 
  connectedPrinter,
  onConnect,
  onDisconnect,
}: NetworkConfigScreenProps) {
  // Use connected printer's ID if available, otherwise use a stable ID for terminal
  const terminalPrinterId = connectedPrinter?.id ?? 1;
  const [settings, setSettings] = useState<NetworkSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error('Failed to load network settings:', e);
    }
    return defaultSettings;
  });

  const handleChange = (field: keyof NetworkSettings, value: string) => {
    setSettings(prev => {
      const updated = { ...prev, [field]: value };
      // Auto-save on change
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save network settings:', e);
      }
      return updated;
    });
  };

  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      console.log('Network settings saved:', settings);
    } catch (e) {
      console.error('Failed to save network settings:', e);
    }
    onHome();
  };

  return (
    <div className="flex-1 flex flex-col">
      <SubPageHeader title="Network Configuration" onHome={onHome} />
      
      <div className="flex-1 p-6 bg-card overflow-auto">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column - Network Settings */}
          <div className="space-y-6">
            <div className="bg-muted rounded-lg p-6 space-y-4">
              <h3 className="text-lg font-semibold text-foreground mb-4">TCP/IP Settings</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ipAddress">IP Address</Label>
                  <Input
                    id="ipAddress"
                    value={settings.ipAddress}
                    onChange={(e) => handleChange('ipAddress', e.target.value)}
                    placeholder="192.168.1.100"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="subnetMask">Subnet Mask</Label>
                  <Input
                    id="subnetMask"
                    value={settings.subnetMask}
                    onChange={(e) => handleChange('subnetMask', e.target.value)}
                    placeholder="255.255.255.0"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="gateway">Default Gateway</Label>
                  <Input
                    id="gateway"
                    value={settings.gateway}
                    onChange={(e) => handleChange('gateway', e.target.value)}
                    placeholder="192.168.1.1"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    value={settings.port}
                    onChange={(e) => handleChange('port', e.target.value)}
                    placeholder="23"
                  />
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-6 space-y-4">
              <h3 className="text-lg font-semibold text-foreground mb-4">DNS Settings</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dns1">Primary DNS</Label>
                  <Input
                    id="dns1"
                    value={settings.dns1}
                    onChange={(e) => handleChange('dns1', e.target.value)}
                    placeholder="8.8.8.8"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="dns2">Secondary DNS</Label>
                  <Input
                    id="dns2"
                    value={settings.dns2}
                    onChange={(e) => handleChange('dns2', e.target.value)}
                    placeholder="8.8.4.4"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-4 justify-end">
              <Button variant="outline" onClick={onHome}>
                Cancel
              </Button>
              <Button onClick={handleSave} className="bg-success hover:bg-success/90">
                Save Settings
              </Button>
            </div>
          </div>

          {/* Right column - Command Terminal */}
          <div className="lg:min-h-[500px]">
            <CommandTerminal
              printerId={terminalPrinterId}
              ipAddress={settings.ipAddress}
              port={parseInt(settings.port, 10) || 23}
              isConnected={isConnected}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
            />
          </div>
        </div>
      </div>
    </div>
  );
}