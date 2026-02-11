import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';

interface AddPrinterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (printer: { name: string; ipAddress: string; port: number }) => void;
  existingIps?: string[];
}

export function AddPrinterDialog({ open, onOpenChange, onAdd, existingIps = [] }: AddPrinterDialogProps) {
  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState('23');
  const [ipError, setIpError] = useState('');

  const handleIpChange = (value: string) => {
    setIpAddress(value);
    if (existingIps.includes(value.trim())) {
      setIpError('This IP address is already in use');
    } else {
      setIpError('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (existingIps.includes(ipAddress.trim())) {
      setIpError('This IP address is already in use');
      return;
    }
    if (name && ipAddress && port) {
      onAdd({
        name,
        ipAddress,
        port: parseInt(port, 10),
      });
      // Reset form
      setName('');
      setIpAddress('');
      setPort('23');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add New Printer
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="printer-name">Printer Name</Label>
            <Input
              id="printer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Printer 1"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ip-address">IP Address</Label>
            <Input
              id="ip-address"
              value={ipAddress}
              onChange={(e) => handleIpChange(e.target.value)}
              placeholder="e.g., 192.168.1.55"
              pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$"
              required
              className={ipError ? 'border-red-500' : ''}
            />
            {ipError && <p className="text-xs text-red-500">{ipError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="23"
              min="1"
              max="65535"
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="industrial-button">
              Add Printer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
