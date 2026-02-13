import { useState } from 'react';
import { Plus, Pencil, Trash2, Package, Droplets, AlertTriangle, Minus, Link, ArrowLeft, Settings, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [reorderSettingsOpen, setReorderSettingsOpen] = useState(false);

  const inkConsumables = consumables.filter(c => c.type === 'ink');
  const makeupConsumables = consumables.filter(c => c.type === 'makeup');

  const openAdd = () => {
    setEditingId(null);
    setFormData(defaultFormData);
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
    // Show percentage relative to a reasonable max (double the minimum, or current stock, whichever is higher)
    const max = Math.max(c.minimumStock * 3, c.currentStock, 1);
    return Math.min(100, Math.round((c.currentStock / max) * 100));
  };

  // Get printers assigned to a consumable
  const getPrintersUsing = (consumableId: string) => {
    return assignments
      .filter(a => a.inkConsumableId === consumableId || a.makeupConsumableId === consumableId)
      .map(a => printers.find(p => p.id === a.printerId))
      .filter(Boolean) as Printer[];
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

  const renderConsumableCard = (c: Consumable) => {
    const printersUsing = getPrintersUsing(c.id);
    const status = getStockStatus(c);
    const percent = getStockPercent(c);
    const isInk = c.type === 'ink';

    return (
      <Card
        key={c.id}
        className={`transition-all overflow-hidden ${
          status === 'critical' ? 'border-destructive/60 bg-destructive/5' :
          status === 'low' ? 'border-yellow-500/60 bg-yellow-500/5' : ''
        }`}
      >
        <CardContent className="p-0">
          {/* Colored top strip */}
          <div className={`h-1.5 ${
            status === 'critical' ? 'bg-destructive' :
            status === 'low' ? 'bg-yellow-500' :
            isInk ? 'bg-blue-500' : 'bg-purple-500'
          }`} />

          <div className="p-3">
            {/* Header row: icon + part number + badge */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                  isInk ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'
                }`}>
                  {isInk ? <Droplets className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <span className="font-semibold text-sm text-foreground block truncate">{c.partNumber}</span>
                  {c.description && (
                    <span className="text-[11px] text-muted-foreground block truncate">{c.description}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {status === 'critical' && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />OUT
                  </Badge>
                )}
                {status === 'low' && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-yellow-500 hover:bg-yellow-600 text-white">
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />LOW
                  </Badge>
                )}
              </div>
            </div>

            {/* Stock gauge */}
            <div className="mb-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Stock</span>
                <span className={`font-bold ${
                  status === 'critical' ? 'text-destructive' :
                  status === 'low' ? 'text-yellow-600' : 'text-foreground'
                }`}>
                  {c.currentStock} {c.unit}
                </span>
              </div>
              <Progress
                value={percent}
                className={`h-2 ${
                  status === 'critical' ? '[&>div]:bg-destructive' :
                  status === 'low' ? '[&>div]:bg-yellow-500' :
                  isInk ? '[&>div]:bg-blue-500' : '[&>div]:bg-purple-500'
                }`}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>Min: {c.minimumStock}</span>
                {printersUsing.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Link className="w-2.5 h-2.5" />
                    {printersUsing.map(p => p.name).join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
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
      {/* Header with actions */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          {onHome && (
            <Button size="sm" variant="ghost" onClick={onHome} className="h-8 px-2">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <h2 className="text-lg font-semibold text-foreground">Consumables</h2>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setReorderSettingsOpen(true)} title="Reorder Settings">
            <Settings className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAssignDialogOpen(true)}>
            <Link className="w-4 h-4 mr-1" />
            Assign
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {consumables.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Package className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No Consumables Added</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">
            Add your ink and makeup part numbers to track stock levels and get alerts when supplies run low.
          </p>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" />
            Add Consumable
          </Button>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <Tabs defaultValue="all" className="p-4">
            <TabsList className="mb-4">
              <TabsTrigger value="all">All ({consumables.length})</TabsTrigger>
              <TabsTrigger value="ink">Ink ({inkConsumables.length})</TabsTrigger>
              <TabsTrigger value="makeup">Makeup ({makeupConsumables.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {consumables.map(renderConsumableCard)}
              </div>
            </TabsContent>
            <TabsContent value="ink" className="mt-0">
              {inkConsumables.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No ink consumables added.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {inkConsumables.map(renderConsumableCard)}
                </div>
              )}
            </TabsContent>
            <TabsContent value="makeup" className="mt-0">
              {makeupConsumables.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No makeup consumables added.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {makeupConsumables.map(renderConsumableCard)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </ScrollArea>
      )}

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
                placeholder="e.g. BC-INK-001"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="e.g. Black Ink Cartridge"
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

      {/* Assign Consumables to Printers Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Assign Consumables to Printers</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pr-4">
              {printers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No printers configured.</p>
              ) : printers.map(printer => {
                const assignment = assignments.find(a => a.printerId === printer.id);
                return (
                  <Card key={printer.id}>
                    <CardContent className="p-3 space-y-3">
                      <div className="font-medium text-foreground">{printer.name}</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Ink</Label>
                          <Select
                            value={assignment?.inkConsumableId ?? 'none'}
                            onValueChange={(v) => onAssignConsumable(printer.id, 'ink', v === 'none' ? undefined : v)}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {inkConsumables.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.partNumber}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Makeup</Label>
                          <Select
                            value={assignment?.makeupConsumableId ?? 'none'}
                            onValueChange={(v) => onAssignConsumable(printer.id, 'makeup', v === 'none' ? undefined : v)}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {makeupConsumables.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.partNumber}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setAssignDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
