import { useState, useEffect } from 'react';
import { Printer, PrinterRole } from '@/types/printer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Printer as PrinterIcon, Save, Trash2, Crown, Link } from 'lucide-react';

interface EditPrinterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  printer: Printer | null;
  onSave: (printerId: number, updates: { name: string; ipAddress: string; port: number; role?: PrinterRole; masterId?: number }) => void;
  onDelete?: (printerId: number) => void;
  allPrinters?: Printer[];
}

export function EditPrinterDialog({ open, onOpenChange, printer, onSave, onDelete, allPrinters = [] }: EditPrinterDialogProps) {
  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState('23');
  const [role, setRole] = useState<PrinterRole>('none');
  const [masterId, setMasterId] = useState<string>('');

  // Sync form when printer changes
  useEffect(() => {
    if (printer) {
      setName(printer.name);
      setIpAddress(printer.ipAddress);
      setPort(printer.port.toString());
      setRole(printer.role ?? 'none');
      setMasterId(printer.masterId?.toString() ?? '');
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
      role,
      masterId: role === 'slave' && masterId ? parseInt(masterId, 10) : undefined,
    });
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!printer || !onDelete) return;
    onDelete(printer.id);
    onOpenChange(false);
  };

  // Available masters: other printers that are set as master (or could be)
  const availableMasters = allPrinters.filter(
    p => p.id !== printer?.id && p.role === 'master'
  );

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

          {/* Master/Slave Role */}
          <div className="space-y-2">
            <Label className="text-slate-300 flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5" />
              Sync Role
            </Label>
            <Select value={role} onValueChange={(v) => setRole(v as PrinterRole)}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="master">Master</SelectItem>
                <SelectItem value="slave">Slave</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-slate-500">
              {role === 'master' && 'Messages and selections will sync to slave printers.'}
              {role === 'slave' && 'This printer will receive messages and selections from its master.'}
              {role === 'none' && 'No message synchronization.'}
            </p>
          </div>

          {/* Master selection (only shown for slaves) */}
          {role === 'slave' && (
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-1.5">
                <Link className="w-3.5 h-3.5" />
                Assigned Master
              </Label>
              {availableMasters.length === 0 ? (
                <p className="text-xs text-warning">No printers are configured as Master. Set a printer's role to "Master" first.</p>
              ) : (
                <Select value={masterId} onValueChange={setMasterId}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                    <SelectValue placeholder="Select master printer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMasters.map(m => (
                      <SelectItem key={m.id} value={m.id.toString()}>
                        {m.name} ({m.ipAddress})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="flex justify-between pt-2">
            {onDelete && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
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
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
