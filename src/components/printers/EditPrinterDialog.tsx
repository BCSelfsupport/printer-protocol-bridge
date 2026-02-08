import { useState, useEffect } from 'react';
import { Printer } from '@/types/printer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Printer as PrinterIcon, Save } from 'lucide-react';

interface EditPrinterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  printer: Printer | null;
  onSave: (printerId: number, updates: { name: string; ipAddress: string; port: number }) => void;
}

export function EditPrinterDialog({ open, onOpenChange, printer, onSave }: EditPrinterDialogProps) {
  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState('23');

  // Sync form when printer changes
  useEffect(() => {
    if (printer) {
      setName(printer.name);
      setIpAddress(printer.ipAddress);
      setPort(printer.port.toString());
    }
  }, [printer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!printer) return;
    
    const portNum = parseInt(port, 10);
    if (!name.trim() || !ipAddress.trim() || isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return;
    }
    
    onSave(printer.id, {
      name: name.trim(),
      ipAddress: ipAddress.trim(),
      port: portNum,
    });
    onOpenChange(false);
  };

  if (!printer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <PrinterIcon className="w-4 h-4 text-primary" />
            </div>
            Edit Printer
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-slate-300">Printer Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Line A - Primary"
              className="bg-slate-800 border-slate-600 text-white"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-ip" className="text-slate-300">IP Address</Label>
            <Input
              id="edit-ip"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="e.g., 192.168.1.100"
              className="bg-slate-800 border-slate-600 text-white font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-port" className="text-slate-300">Port</Label>
            <Input
              id="edit-port"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="23"
              min={1}
              max={65535}
              className="bg-slate-800 border-slate-600 text-white font-mono w-24"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90"
            >
              <Save className="w-4 h-4 mr-1" />
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
