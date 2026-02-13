import { useState } from 'react';
import { Plus, Pencil, Trash2, Package, Droplets, Palette, AlertTriangle, Minus, ArrowLeft, Settings, ShoppingCart, Printer as PrinterIcon } from 'lucide-react';
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
  reorderUnit: string;
  bottlesPerReorderUnit: number;
}

const defaultFormData: ConsumableFormData = {
  type: 'ink',
  partNumber: '',
  description: '',
  currentStock: 0,
  minimumStock: 3,
  unit: 'bottles',
  reorderUnit: 'cases',
  bottlesPerReorderUnit: 5,
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
      reorderUnit: consumable.reorderUnit || consumable.unit,
      bottlesPerReorderUnit: consumable.bottlesPerReorderUnit || 1,
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

  // ── Helper: filled segments for vertical gauge (matching Dashboard) ──
  const getFilledSegments = (level?: string) => {
    switch (level) {
      case 'FULL': return 4;
      case 'GOOD': return 2;
      case 'LOW': return 1;
      case 'EMPTY': return 0;
      default: return 0;
    }
  };

  const getLevelBg = (level?: string) => {
    if (level === 'EMPTY') return 'bg-destructive';
    if (level === 'LOW') return 'bg-warning';
    return 'industrial-button';
  };

  // ── Left panel: Printer cards (matching Dashboard fluid indicators) ──
  const renderPrinterCard = (printer: Printer) => {
    const assignment = assignments.find(a => a.printerId === printer.id);
    const inkConsumable = assignment?.inkConsumableId ? consumables.find(c => c.id === assignment.inkConsumableId) : undefined;
    const makeupConsumable = assignment?.makeupConsumableId ? consumables.find(c => c.id === assignment.makeupConsumableId) : undefined;

    return (
      <div key={printer.id} className="rounded-lg border bg-card overflow-hidden">
        {/* Printer header */}
        <div className="px-3 py-2 flex items-center gap-2 border-b">
          <PrinterIcon className={`w-5 h-5 ${
            printer.isAvailable ? 'text-primary' : 'text-muted-foreground'
          }`} />
          <div className="flex-1 min-w-0">
            <span className="font-bold text-sm text-foreground block truncate">{printer.name}</span>
            <span className={`text-xs font-semibold ${
              printer.isAvailable
                ? printer.status === 'ready' ? 'text-success' : 'text-warning'
                : 'text-muted-foreground'
            }`}>
              {printer.isAvailable ? (printer.status === 'ready' ? 'Ready' : 'Not Ready') : 'Offline'}
            </span>
          </div>
          {printer.currentMessage && (
            <span className="text-xs text-muted-foreground font-mono truncate max-w-[100px]">
              {printer.currentMessage}
            </span>
          )}
        </div>

        {/* Fluid indicators — matching Dashboard blue cards with vertical segmented bars */}
        <div className="p-3 flex gap-2">
          {/* Makeup indicator */}
          <div className={`flex-1 h-[70px] rounded-lg flex items-center justify-between px-3 ${getLevelBg(printer.makeupLevel)}`}>
            <div className="flex flex-col items-center">
              <Droplets className="w-6 h-6 text-white" />
              <span className="text-[10px] text-white font-medium mt-0.5">Makeup</span>
            </div>
            <div className="flex flex-col-reverse gap-0.5 h-12 w-4 bg-black/20 rounded p-0.5">
              {[0, 1, 2, 3].map((seg) => {
                const filled = getFilledSegments(printer.makeupLevel);
                return (
                  <div
                    key={seg}
                    className={`flex-1 rounded-sm transition-colors ${
                      seg < filled ? 'bg-white' : 'bg-white/20'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Ink indicator */}
          <div className={`flex-1 h-[70px] rounded-lg flex items-center justify-between px-3 ${getLevelBg(printer.inkLevel)}`}>
            <div className="flex flex-col items-center">
              <Palette className="w-6 h-6 text-white" />
              <span className="text-[10px] text-white font-medium mt-0.5">Ink</span>
            </div>
            <div className="flex flex-col-reverse gap-0.5 h-12 w-4 bg-black/20 rounded p-0.5">
              {[0, 1, 2, 3].map((seg) => {
                const filled = getFilledSegments(printer.inkLevel);
                return (
                  <div
                    key={seg}
                    className={`flex-1 rounded-sm transition-colors ${
                      seg < filled ? 'bg-white' : 'bg-white/20'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Assignment dropdowns — Makeup first, Ink second (matching indicators above) */}
        <div className="px-3 pb-3 grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Makeup Part</Label>
            <Select
              value={assignment?.makeupConsumableId ?? 'none'}
              onValueChange={(v) => onAssignConsumable(printer.id, 'makeup', v === 'none' ? undefined : v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Assign..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {makeupConsumables.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.partNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Ink Part</Label>
            <Select
              value={assignment?.inkConsumableId ?? 'none'}
              onValueChange={(v) => onAssignConsumable(printer.id, 'ink', v === 'none' ? undefined : v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Assign..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {inkConsumables.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.partNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    );
  };

  // ── Right panel: Stock row with graphical bottle columns ──
  const renderStockRow = (c: Consumable) => {
    const status = getStockStatus(c);
    const isInk = c.type === 'ink';
    const maxDisplay = Math.max(c.currentStock, c.minimumStock + 2, 6);

    return (
      <Card key={c.id} className={`overflow-hidden transition-all ${
        status === 'critical' ? 'border-destructive/50' :
        status === 'low' ? 'border-warning/50' : ''
      }`}>
        <CardContent className="p-0">
          <div className="p-2.5 space-y-1.5">
            {/* Part header + status badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isInk ? 'bg-primary/15 text-primary' : 'bg-primary/15 text-primary'
                }`}>
                  {isInk ? <Droplets className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-bold text-foreground block truncate">{c.partNumber}</span>
                  {c.description && (
                    <span className="text-xs text-muted-foreground block truncate">{c.description}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {status === 'critical' && (
                  <Badge variant="destructive" className="text-xs px-1.5 py-0">OUT</Badge>
                )}
                {status === 'low' && (
                  <Badge className="text-xs px-1.5 py-0 bg-warning text-warning-foreground">LOW</Badge>
                )}
              </div>
            </div>

            {/* Graphical bottle columns */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground font-medium">{c.currentStock} {c.unit}</span>
                <span className="text-muted-foreground">min {c.minimumStock}</span>
              </div>
              <div className="flex items-end gap-0.5 h-8 px-1 py-1 bg-muted/30 rounded-md">
                {Array.from({ length: maxDisplay }).map((_, i) => {
                  const isFilled = i < c.currentStock;
                  const isBelowMin = i < c.minimumStock;
                  return (
                    <div
                      key={i}
                      className={`flex-1 max-w-3 rounded-sm transition-all duration-300 ${
                        isFilled
                          ? status === 'critical' ? 'bg-destructive'
                            : status === 'low' ? 'bg-warning'
                            : 'bg-primary'
                          : isBelowMin
                            ? 'bg-destructive/15 border border-dashed border-destructive/30'
                            : 'bg-muted/40'
                      }`}
                      style={{ height: isFilled ? '100%' : '60%' }}
                    />
                  );
                })}
              </div>
              {c.reorderUnit && c.reorderUnit !== c.unit && c.bottlesPerReorderUnit && (
                <p className="text-xs text-muted-foreground">
                  1 {c.reorderUnit.replace(/s$/, '')} = {c.bottlesPerReorderUnit} {c.unit}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 pt-0.5">
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs flex-1" onClick={() => onAdjustStock(c.id, 1)}>
                <Plus className="w-3 h-3 mr-0.5" />Add
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs flex-1" onClick={() => onAdjustStock(c.id, -1)} disabled={c.currentStock === 0}>
                <Minus className="w-3 h-3 mr-0.5" />Use
              </Button>
              {reorderConfig.action !== 'none' && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs flex-1" onClick={() => handleReorder(c)}>
                  <ShoppingCart className="w-3 h-3 mr-0.5" />Order
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                setStockAdjustId(c.id);
                setStockAdjustValue(String(c.currentStock));
              }} title="Set stock">
                <Package className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(c)} title="Edit">
                <Pencil className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteConfirmId(c.id)} title="Delete">
                <Trash2 className="w-3 h-3" />
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
          <h2 className="text-xl font-semibold text-foreground">Consumables</h2>
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
          <div className="px-4 py-2.5 border-b bg-muted/20">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <PrinterIcon className="w-4 h-4" />
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
          <div className="px-4 py-2.5 border-b bg-muted/20">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Package className="w-4 h-4" />
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
                      <div className="flex items-center gap-2 mb-2">
                        <Droplets className="w-4 h-4 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
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
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
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
              <Label>Stock Unit</Label>
              <Select value={formData.unit} onValueChange={(v) => setFormData(prev => ({ ...prev, unit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottles">Bottles</SelectItem>
                  <SelectItem value="liters">Liters</SelectItem>
                  <SelectItem value="cartridges">Cartridges</SelectItem>
                  <SelectItem value="units">Units</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Unit used for tracking individual stock.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Reorder Unit</Label>
                <Select value={formData.reorderUnit} onValueChange={(v) => setFormData(prev => ({ ...prev, reorderUnit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cases">Cases</SelectItem>
                    <SelectItem value="boxes">Boxes</SelectItem>
                    <SelectItem value="bottles">Bottles</SelectItem>
                    <SelectItem value="units">Units</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Per Reorder Unit</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.bottlesPerReorderUnit}
                  onChange={e => setFormData(prev => ({ ...prev, bottlesPerReorderUnit: parseInt(e.target.value, 10) || 1 }))}
                />
                <p className="text-[10px] text-muted-foreground">{formData.unit} per {formData.reorderUnit.replace(/s$/, '')}</p>
              </div>
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
