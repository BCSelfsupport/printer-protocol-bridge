import { useState, useEffect } from 'react';
import { Printer, PrinterRole, PrintSettings } from '@/types/printer';
import { getPrinterMessageDefaults } from '@/lib/fleetDefaults';
import { useTwinPair } from '@/twin-code/twinPairStore';
import { multiPrinterEmulator } from '@/lib/multiPrinterEmulator';
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
import { Printer as PrinterIcon, Save, Trash2, Crown, Link, Hash, Tag, RotateCcw, SlidersHorizontal } from 'lucide-react';

type PrinterRotation = NonNullable<Printer['rotation']>;
type MessageDefaults = NonNullable<Printer['messageDefaults']>;

interface EditPrinterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  printer: Printer | null;
  onSave: (printerId: number, updates: { name: string; ipAddress: string; port: number; role?: PrinterRole; masterId?: number; serialNumber?: string; lineId?: string; rotation?: PrinterRotation; autoSyncSelection?: boolean; messageDefaults?: MessageDefaults }) => void;
  onDelete?: (printerId: number) => void;
  allPrinters?: Printer[];
}


export function EditPrinterDialog({ open, onOpenChange, printer, onSave, onDelete, allPrinters = [] }: EditPrinterDialogProps) {
  const pair = useTwinPair();
  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState('23');
  const [role, setRole] = useState<PrinterRole>('none');
  const [masterId, setMasterId] = useState<string>('');
  const [serialNumber, setSerialNumber] = useState('');
  
  const [lineId, setLineId] = useState('');
  const [rotation, setRotation] = useState<PrinterRotation>('Normal');
  const [autoSyncSelection, setAutoSyncSelection] = useState(false);
  // Per-printer NEW-message defaults (Width / Delay / Speed / Bold / Gap / Pitch).
  // Initialised from fleet defaults; any customised field is persisted onto the
  // Printer record so future new messages on this printer inherit it.
  const [defWidth, setDefWidth] = useState<string>('2');
  const [defDelay, setDefDelay] = useState<string>('500');
  const [defBold, setDefBold] = useState<string>('0');
  const [defGap, setDefGap] = useState<string>('0');
  const [defPitch, setDefPitch] = useState<string>('0');
  const [defSpeed, setDefSpeed] = useState<PrintSettings['speed']>('Ultra Fast');
  const [ipError, setIpError] = useState('');
  // Sync form when printer changes
  useEffect(() => {
    if (printer) {
      setName(printer.name);
      setIpAddress(printer.ipAddress);
      setPort(printer.port.toString());
      setRole(printer.role ?? 'none');
      setMasterId(printer.masterId?.toString() ?? '');
      setSerialNumber(printer.serialNumber ?? '');
      
      setLineId(printer.lineId ?? '');
      setRotation(printer.rotation ?? 'Normal');
      setAutoSyncSelection(printer.autoSyncSelection ?? false);
      // Seed the defaults inputs from stored per-printer overrides, falling
      // back to the resolved fleet defaults so admins see today's live value.
      const resolved = getPrinterMessageDefaults(printer);
      setDefWidth(String(resolved.width));
      setDefDelay(String(resolved.delay));
      setDefBold(String(resolved.bold));
      setDefGap(String(resolved.gap));
      setDefPitch(String(resolved.pitch));
      setDefSpeed(resolved.speed);
    }
  }, [printer]);


  const existingIps = allPrinters.filter(p => p.id !== printer?.id).map(p => p.ipAddress);

  // Available masters: other printers that are set as master (or could be)
  const availableMasters = allPrinters.filter(
    p => p.id !== printer?.id && p.role === 'master'
  );

  useEffect(() => {
    if (role === 'slave' && !masterId && availableMasters.length > 0) {
      setMasterId(availableMasters[0].id.toString());
    }
  }, [role, masterId, availableMasters]);

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
    if (!printer) return;

    if (existingIps.includes(ipAddress.trim())) {
      setIpError('This IP address is already in use');
      return;
    }
    
    const portNum = parseInt(port, 10);
    if (!name.trim() || !ipAddress.trim() || isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return;
    }
    
    const ip = ipAddress.trim();
    const inTwinPair = !multiPrinterEmulator.isEmulatedIp(ip, portNum) && !!(
      (pair.a && pair.a.ip === ip && pair.a.port === portNum) ||
      (pair.b && pair.b.ip === ip && pair.b.port === portNum)
    );
    const effectiveRole: PrinterRole = inTwinPair ? 'none' : role;
    if (effectiveRole === 'slave' && !masterId) {
      return;
    }

    onSave(printer.id, {
      name: name.trim(),
      ipAddress: ip,
      port: portNum,
      role: effectiveRole,
      masterId: effectiveRole === 'slave' && masterId ? parseInt(masterId, 10) : undefined,
      serialNumber: serialNumber.trim() || undefined,
      
      lineId: lineId.trim() || undefined,
      rotation,
      autoSyncSelection: effectiveRole === 'master' ? autoSyncSelection : undefined,
      messageDefaults: {
        width: Math.max(0, Math.min(1000, parseInt(defWidth, 10) || 0)),
        delay: Math.max(0, parseInt(defDelay, 10) || 0),
        bold: Math.max(0, Math.min(9, parseInt(defBold, 10) || 0)),
        gap: Math.max(0, Math.min(9, parseInt(defGap, 10) || 0)),
        pitch: Math.max(0, parseInt(defPitch, 10) || 0),
        speed: defSpeed,
      },
    });

    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!printer || !onDelete) return;
    onDelete(printer.id);
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
              onChange={(e) => handleIpChange(e.target.value)}
              placeholder="e.g., 192.168.1.100"
              className="bg-slate-800 border-slate-600 text-white font-mono"
            />
            {ipError && <p className="text-xs text-red-500 mt-1">{ipError}</p>}
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

          {/* Serial Number */}
          <div className="space-y-2">
            <Label htmlFor="edit-serial" className="text-slate-300 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5" />
              Serial Number
            </Label>
            <Input
              id="edit-serial"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="e.g., BC-2024-001234"
              className="bg-slate-800 border-slate-600 text-white font-mono"
            />
            <p className="text-[10px] text-slate-500">
              Optional. Used for Fleet Telemetry™ tracking.
            </p>
          </div>

          {/* Line ID */}
          <div className="space-y-2">
            <Label htmlFor="edit-line-id" className="text-slate-300 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" />
              Line ID
            </Label>
            <Input
              id="edit-line-id"
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
              placeholder="e.g., Line A, Packaging 1"
              className="bg-slate-800 border-slate-600 text-white"
            />
            <p className="text-[10px] text-slate-500">
              Optional. Used as the value for Line ID fields in messages.
            </p>
          </div>

          {/* Print Rotation (per printer, applied on Master sync) */}
          <div className="space-y-2">
            <Label className="text-slate-300 flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" />
              Print Rotation
            </Label>
            <Select value={rotation} onValueChange={(v) => setRotation(v as PrinterRotation)}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Normal">Normal</SelectItem>
                <SelectItem value="Flip">Flip</SelectItem>
                <SelectItem value="Mirror Flip">Mirror Flip</SelectItem>
                <SelectItem value="Mirror">Mirror</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Per-printer NEW-message defaults. Applied only to messages CREATED
              on this printer — existing messages keep whatever they were saved
              with, and operators can still tweak everything at the HMI. */}
          <div className="space-y-2 rounded-md border border-slate-700 bg-slate-800/50 p-3">
            <Label className="text-slate-300 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              New Message Defaults
            </Label>
            <p className="text-[10px] text-slate-500 -mt-1">
              Seed values for any new message created on this printer. Change
              anything you need to at the HMI later; these only apply at creation.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Width</Label>
                <Input type="number" min={0} max={1000} value={defWidth}
                  onChange={(e) => setDefWidth(e.target.value)}
                  className="bg-slate-900 border-slate-600 text-white font-mono h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Delay</Label>
                <Input type="number" min={0} value={defDelay}
                  onChange={(e) => setDefDelay(e.target.value)}
                  className="bg-slate-900 border-slate-600 text-white font-mono h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Bold</Label>
                <Input type="number" min={0} max={9} value={defBold}
                  onChange={(e) => setDefBold(e.target.value)}
                  className="bg-slate-900 border-slate-600 text-white font-mono h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Gap</Label>
                <Input type="number" min={0} max={9} value={defGap}
                  onChange={(e) => setDefGap(e.target.value)}
                  className="bg-slate-900 border-slate-600 text-white font-mono h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Pitch</Label>
                <Input type="number" min={0} value={defPitch}
                  onChange={(e) => setDefPitch(e.target.value)}
                  className="bg-slate-900 border-slate-600 text-white font-mono h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Speed</Label>
                <Select value={defSpeed} onValueChange={(v) => setDefSpeed(v as PrintSettings['speed'])}>
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fast">Fast</SelectItem>
                    <SelectItem value="Faster">Faster</SelectItem>
                    <SelectItem value="Fastest">Fastest</SelectItem>
                    <SelectItem value="Ultra Fast">Ultra Fast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>






          {(() => {
            const ip = ipAddress.trim();
            const portNum = parseInt(port, 10);
            const inTwinPair = !multiPrinterEmulator.isEmulatedIp(ip, portNum) && !!(
              (pair.a && pair.a.ip === ip && pair.a.port === portNum) ||
              (pair.b && pair.b.ip === ip && pair.b.port === portNum)
            );
            return (
              <div className="space-y-2">
                <Label className="text-slate-300 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5" />
                  Sync Role
                </Label>
                <Select
                  value={inTwinPair ? 'none' : role}
                  onValueChange={(v) => setRole(v as PrinterRole)}
                  disabled={inTwinPair}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white disabled:opacity-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="master">Master</SelectItem>
                    <SelectItem value="slave">Slave</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-500">
                  {inTwinPair && 'This printer is part of an active Twin Pair — Master/Slave sync is disabled while bound.'}
                  {!inTwinPair && role === 'master' && 'Messages and selections will sync to slave printers.'}
                  {!inTwinPair && role === 'slave' && 'This printer will receive messages and selections from its master.'}
                  {!inTwinPair && role === 'none' && 'No message synchronization.'}
                </p>
              </div>
            );
          })()}

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

          {/* Auto-sync toggle — Master only. Legacy behaviour where selecting a
              message on the master immediately fans out to every slave. Default
              OFF; operators now pick targets per-selection via the "Apply to
              Printers" dialog. */}
          {role === 'master' && (
            <div className="space-y-2 rounded-md border border-slate-700 bg-slate-800/50 p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSyncSelection}
                  onChange={(e) => setAutoSyncSelection(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-primary"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-200">
                    Auto-sync message selection from Master
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    When ON, selecting a message on this Master immediately applies
                    it to every Slave in this group (legacy behaviour). When OFF
                    (default), use the "Apply to Printers" dialog to pick targets
                    each time.
                  </p>
                </div>
              </label>
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
                disabled={role === 'slave' && availableMasters.length === 0}
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
