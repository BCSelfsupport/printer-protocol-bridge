import { useState } from 'react';
import { Plus, Pencil, Trash2, Package, Droplets, AlertTriangle, Minus, ArrowLeft, Settings, ShoppingCart, Printer as PrinterIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Consumable, PrinterConsumableAssignment, ReorderConfig, ReorderAction } from '@/types/consumable';
import { Printer } from '@/types/printer';

interface ConsumablesScreenProps {
  consumables: Consumable[];
  assignments: PrinterConsumableAssignment[];
  printers: Printer[];
  reorderConfig: ReorderConfig;
  onUpdateReorderConfig: (updates: Partial<ReorderConfig>) => void;
  onAddConsumable: (consumable: Omit<Consumable, 'id'>) => Consumable;
  onUpdateConsumable: (id: string, updates: Partial<Omit<Consumable, 'id'>>) => void;
  onRemoveConsumable: (id: string) => void;
  onSetStock: (id: string, amount: number) => void;
  onAdjustStock: (id: string, delta: number) => void;
  onAssignConsumable: (printerId: number, type: 'ink' | 'makeup', consumableId: string | undefined) => void;
  onHome?: () => void;
}

interface ConsumableFormData {
  type: 'ink' | 'makeup';
  partNumber: string;
  description: string;
  currentStock: number;
  minimumStock: number;
  unit: string;
}

const defaultFormData: ConsumableFormData = {
  type: 'ink',
  partNumber: '',
  description: '',
  currentStock: 0,
  minimumStock: 1,
  unit: 'cases',
};

export function ConsumablesScreen({
  consumables,
  assignments,
  printers,
  reorderConfig,
  onUpdateReorderConfig,
  onAddConsumable,
  onUpdateConsumable,
  onRemoveConsumable,
  onSetStock,
  onAdjustStock,
  onAssignConsumable,
  onHome,
}: ConsumablesScreenProps) {
  const [addEditOpen, setAddEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ConsumableFormData>(defaultFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [stockAdjustId, setStockAdjustId] = useState<string | null>(null);
  const [stockAdjustValue, setStockAdjustValue] = useState<string>('');
  const [reorderSettingsOpen, setReorderSettingsOpen] = useState(false);

  const inkConsumables = consumables.filter(c => c.type === 'ink');
  const makeupConsumables = consumables.filter(c => c.type === 'makeup');

  const openAdd = (type?: 'ink' | 'makeup') => {
    setEditingId(null);
    setFormData({ ...defaultFormData, type: type || 'ink' });
    setAddEditOpen(true);
  };

  const openEdit = (consumable: Consumable) => {
    setEditingId(consumable.id);
    setFormData({
      type: consumable.type,
      partNumber: consumable.partNumber,
      description: consumable.description,
      currentStock: consumable.currentStock,
      minimumStock: consumable.minimumStock,
      unit: consumable.unit,
    });
    setAddEditOpen(true);
  };

  const handleSave = () => {
    if (!formData.partNumber.trim()) return;
    if (editingId) {
      onUpdateConsumable(editingId, formData);
    } else {
      onAddConsumable(formData);
    }
    setAddEditOpen(false);
  };

  const handleSetStock = () => {
    if (stockAdjustId && stockAdjustValue !== '') {
      onSetStock(stockAdjustId, parseInt(stockAdjustValue, 10) || 0);
      setStockAdjustId(null);
      setStockAdjustValue('');
    }
  };

  const getStockStatus = (c: Consumable): 'ok' | 'low' | 'critical' => {
    if (c.currentStock === 0) return 'critical';
    if (c.currentStock <= c.minimumStock) return 'low';
    return 'ok';
  };

  const getStockPercent = (c: Consumable): number => {
    const max = Math.max(c.minimumStock * 3, c.currentStock, 1);
    return Math.min(100, Math.round((c.currentStock / max) * 100));
  };

  const handleReorder = (consumable: Consumable) => {
    if (reorderConfig.action === 'website') {
      window.open(reorderConfig.websiteUrl, '_blank');
    } else if (reorderConfig.action === 'email') {
      const subject = reorderConfig.emailSubject.replace('{{partNumber}}', consumable.partNumber);
      const body = `Reorder request for:\n\nPart Number: ${consumable.partNumber}\nDescription: ${consumable.description}\nCurrent Stock: ${consumable.currentStock} ${consumable.unit}\n\nPlease send a quote.`;
      window.open(`mailto:${reorderConfig.emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    }
  };

  // ── Helper: ink/makeup level color (matching Dashboard style) ──
  const getLevelColor = (level?: string) => {
    switch (level) {
      case 'FULL': return { bg: 'bg-teal-400', text: 'text-teal-400', fill: '100%' };
      case 'GOOD': return { bg: 'bg-teal-400', text: 'text-teal-400', fill: '75%' };
      case 'LOW': return { bg: 'bg-amber-400', text: 'text-amber-400', fill: '33%' };
      case 'EMPTY': return { bg: 'bg-red-500', text: 'text-red-400', fill: '5%' };
      default: return { bg: 'bg-slate-600', text: 'text-slate-500', fill: '0%' };
    }
  };

  // ── Left panel: Printer cards (matching reference design) ──
  const renderPrinterCard = (printer: Printer) => {
    const assignment = assignments.find(a => a.printerId === printer.id);
    const inkConsumable = assignment?.inkConsumableId ? consumables.find(c => c.id === assignment.inkConsumableId) : undefined;
    const makeupConsumable = assignment?.makeupConsumableId ? consumables.find(c => c.id === assignment.makeupConsumableId) : undefined;
    const inkColor = getLevelColor(printer.inkLevel);
    const makeupColor = getLevelColor(printer.makeupLevel);

    return (
      <div key={printer.id} className="rounded-xl border-2 border-slate-600 bg-slate-800/80 overflow-hidden transition-all">
        {/* Printer header — dark bar with icon, name, status, current message */}
        <div className="px-4 py-3 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            printer.isAvailable ? 'bg-teal-500/20' : 'bg-slate-700'
          }`}>
            <PrinterIcon className={`w-5 h-5 ${
              printer.isAvailable ? 'text-teal-400' : 'text-slate-500'
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-base text-white block truncate">{printer.name}</span>
            <span className={`text-xs font-semibold ${
              printer.isAvailable
                ? printer.status === 'ready' ? 'text-emerald-400' : 'text-amber-400'
                : 'text-slate-500'
            }`}>
              {printer.isAvailable ? (printer.status === 'ready' ? 'Ready' : 'Not Ready') : 'Offline'}
            </span>
          </div>
          {printer.currentMessage && (
            <span className="text-xs text-slate-400 font-mono truncate max-w-[100px]">
              {printer.currentMessage}
            </span>
          )}
        </div>

        {/* Ink & Makeup gauges — side by side panels */}
        <div className="grid grid-cols-2 gap-px bg-slate-700">
          {/* Ink panel */}
          <div className="bg-slate-800/60 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Droplets className={`w-4 h-4 ${inkColor.text}`} />
              <span className={`text-sm font-bold uppercase tracking-wide ${inkColor.text}`}>
                {printer.inkLevel || 'UNKNOWN'}
              </span>
            </div>
            {/* Gauge bar */}
            <div className="h-3 bg-slate-700 rounded overflow-hidden">
              <div
                className={`h-full rounded transition-all duration-500 ${inkColor.bg}`}
                style={{ width: inkColor.fill }}
              />
            </div>
            {/* Assignment dropdown */}
            <Select
              value={assignment?.inkConsumableId ?? 'none'}
              onValueChange={(v) => onAssignConsumable(printer.id, 'ink', v === 'none' ? undefined : v)}
            >
              <SelectTrigger className="h-7 text-xs border-dashed border-slate-600 bg-slate-900/50 text-slate-300 px-2">
                <SelectValue placeholder="Assign ink..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {inkConsumables.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.partNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {inkConsumable && (
              <p className="text-[10px] text-slate-500 truncate">{inkConsumable.description}</p>
            )}
          </div>

          {/* Makeup panel */}
          <div className="bg-slate-800/60 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Package className={`w-4 h-4 ${makeupColor.text}`} />
              <span className={`text-sm font-bold uppercase tracking-wide ${makeupColor.text}`}>
                {printer.makeupLevel || 'UNKNOWN'}
              </span>
            </div>
            {/* Gauge bar */}
            <div className="h-3 bg-slate-700 rounded overflow-hidden">
              <div
                className={`h-full rounded transition-all duration-500 ${makeupColor.bg}`}
                style={{ width: makeupColor.fill }}
              />
            </div>
            {/* Assignment dropdown */}
            <Select
              value={assignment?.makeupConsumableId ?? 'none'}
              onValueChange={(v) => onAssignConsumable(printer.id, 'makeup', v === 'none' ? undefined : v)}
            >
              <SelectTrigger className="h-7 text-xs border-dashed border-slate-600 bg-slate-900/50 text-slate-300 px-2">
                <SelectValue placeholder="Assign makeup..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {makeupConsumables.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.partNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {makeupConsumable && (
              <p className="text-[10px] text-slate-500 truncate">{makeupConsumable.description}</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Right panel: Stock row ──
  const renderStockRow = (c: Consumable) => {
    const status = getStockStatus(c);
    const percent = getStockPercent(c);
    const isInk = c.type === 'ink';

    return (
      <Card key={c.id} className={`overflow-hidden transition-all ${
        status === 'critical' ? 'border-destructive/50' :
        status === 'low' ? 'border-yellow-500/50' : ''
      }`}>
        <CardContent className="p-0">
          <div className={`h-1 ${
            status === 'critical' ? 'bg-destructive' :
            status === 'low' ? 'bg-yellow-500' :
            isInk ? 'bg-blue-500' : 'bg-purple-500'
          }`} />
          <div className="p-2.5 space-y-1.5">
            {/* Part + description */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${
                  isInk ? 'bg-blue-500/15 text-blue-500' : 'bg-purple-500/15 text-purple-500'
                }`}>
                  {isInk ? <Droplets className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-foreground block truncate">{c.partNumber}</span>
                  {c.description && (
                    <span className="text-[10px] text-muted-foreground block truncate">{c.description}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {status === 'critical' && (
                  <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">OUT</Badge>
                )}
                {status === 'low' && (
                  <Badge className="text-[9px] px-1 py-0 h-4 bg-yellow-500 hover:bg-yellow-600 text-white">LOW</Badge>
                )}
              </div>
            </div>

            {/* Gauge */}
            <div>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-muted-foreground">Stock</span>
                <span className={`font-bold ${
                  status === 'critical' ? 'text-destructive' :
                  status === 'low' ? 'text-yellow-600' : 'text-foreground'
                }`}>
                  {c.currentStock} {c.unit} <span className="font-normal text-muted-foreground">/ min {c.minimumStock}</span>
                </span>
              </div>
              <Progress
                value={percent}
                className={`h-1.5 ${
                  status === 'critical' ? '[&>div]:bg-destructive' :
                  status === 'low' ? '[&>div]:bg-yellow-500' :
                  isInk ? '[&>div]:bg-blue-500' : '[&>div]:bg-purple-500'
                }`}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 pt-0.5">
              <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px] flex-1" onClick={() => onAdjustStock(c.id, 1)}>
                <Plus className="w-2.5 h-2.5 mr-0.5" />Add
              </Button>
              <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px] flex-1" onClick={() => onAdjustStock(c.id, -1)} disabled={c.currentStock === 0}>
                <Minus className="w-2.5 h-2.5 mr-0.5" />Use
              </Button>
              {reorderConfig.action !== 'none' && (
                <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px] flex-1" onClick={() => handleReorder(c)}>
                  <ShoppingCart className="w-2.5 h-2.5 mr-0.5" />Order
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                setStockAdjustId(c.id);
                setStockAdjustValue(String(c.currentStock));
              }} title="Set stock">
                <Package className="w-2.5 h-2.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(c)} title="Edit">
                <Pencil className="w-2.5 h-2.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteConfirmId(c.id)} title="Delete">
                <Trash2 className="w-2.5 h-2.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          {onHome && (
            <Button size="sm" variant="ghost" onClick={onHome} className="h-8 px-2">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <h2 className="text-lg font-semibold text-foreground">Consumables</h2>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setReorderSettingsOpen(true)} title="Reorder Settings">
            <Settings className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => openAdd()}>
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Printer config cards */}
        <div className="w-1/2 border-r flex flex-col">
          <div className="px-3 py-2 border-b bg-slate-900/40">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <PrinterIcon className="w-3.5 h-3.5" />
              Printer Configuration
            </h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              {printers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No printers configured.</p>
              ) : (
                printers.map(renderPrinterCard)
              )}
            </div>
          </ScrollArea>
        </div>

        {/* RIGHT: Global stock inventory */}
        <div className="w-1/2 flex flex-col">
          <div className="px-3 py-2 border-b bg-muted/20">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />
              Stock Inventory
            </h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {consumables.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Package className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">No consumables added yet.</p>
                  <Button size="sm" onClick={() => openAdd()}>
                    <Plus className="w-3 h-3 mr-1" />Add Consumable
                  </Button>
                </div>
              ) : (
                <>
                  {/* Ink section */}
                  {inkConsumables.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Droplets className="w-3 h-3 text-blue-500" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">
                          Ink ({inkConsumables.length})
                        </span>
                      </div>
                      <div className="space-y-2">
                        {inkConsumables.map(renderStockRow)}
                      </div>
                    </div>
                  )}

                  {/* Makeup section */}
                  {makeupConsumables.length > 0 && (
                    <div className={inkConsumables.length > 0 ? 'mt-3' : ''}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Package className="w-3 h-3 text-purple-500" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-500">
                          Makeup ({makeupConsumables.length})
                        </span>
                      </div>
                      <div className="space-y-2">
                        {makeupConsumables.map(renderStockRow)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={addEditOpen} onOpenChange={setAddEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Consumable' : 'Add Consumable'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formData.type} onValueChange={(v: 'ink' | 'makeup') => setFormData(prev => ({ ...prev, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ink">Ink</SelectItem>
                  <SelectItem value="makeup">Makeup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Part Number *</Label>
              <Input
                value={formData.partNumber}
                onChange={e => setFormData(prev => ({ ...prev, partNumber: e.target.value }))}
                placeholder="e.g. 51-0001-01"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="e.g. Black MEK"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Current Stock</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.currentStock}
                  onChange={e => setFormData(prev => ({ ...prev, currentStock: parseInt(e.target.value, 10) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum Stock</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.minimumStock}
                  onChange={e => setFormData(prev => ({ ...prev, minimumStock: parseInt(e.target.value, 10) || 0 }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={formData.unit} onValueChange={(v) => setFormData(prev => ({ ...prev, unit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cases">Cases (5 x Quart)</SelectItem>
                  <SelectItem value="bottles">Bottles (Quart)</SelectItem>
                  <SelectItem value="liters">Liters</SelectItem>
                  <SelectItem value="cartridges">Cartridges</SelectItem>
                  <SelectItem value="units">Units</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.partNumber.trim()}>
              {editingId ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Stock Dialog */}
      <Dialog open={!!stockAdjustId} onOpenChange={(open) => { if (!open) setStockAdjustId(null); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Set Stock Level</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New stock quantity</Label>
            <Input
              type="number"
              min={0}
              value={stockAdjustValue}
              onChange={e => setStockAdjustValue(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockAdjustId(null)}>Cancel</Button>
            <Button onClick={handleSetStock}>Set</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Consumable</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the consumable and unlink it from any assigned printers. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteConfirmId) onRemoveConsumable(deleteConfirmId); setDeleteConfirmId(null); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reorder Settings Dialog */}
      <Dialog open={reorderSettingsOpen} onOpenChange={setReorderSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reorder Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>When reordering, do what?</Label>
              <Select
                value={reorderConfig.action}
                onValueChange={(v: ReorderAction) => onUpdateReorderConfig({ action: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="website">Open Website</SelectItem>
                  <SelectItem value="email">Send Email</SelectItem>
                  <SelectItem value="consumables">View Consumables Screen</SelectItem>
                  <SelectItem value="none">Disabled (No reorder button)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reorderConfig.action === 'website' && (
              <div className="space-y-2">
                <Label>Website URL</Label>
                <Input
                  value={reorderConfig.websiteUrl}
                  onChange={e => onUpdateReorderConfig({ websiteUrl: e.target.value })}
                  placeholder="https://www.buybestcode.co"
                />
              </div>
            )}

            {reorderConfig.action === 'email' && (
              <>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    value={reorderConfig.emailAddress}
                    onChange={e => onUpdateReorderConfig({ emailAddress: e.target.value })}
                    placeholder="orders@example.com"
                    type="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Subject</Label>
                  <Input
                    value={reorderConfig.emailSubject}
                    onChange={e => onUpdateReorderConfig({ emailSubject: e.target.value })}
                    placeholder="Reorder Request — {{partNumber}}"
                  />
                  <p className="text-xs text-muted-foreground">Use {'{{partNumber}}'} to insert the part number.</p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setReorderSettingsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
