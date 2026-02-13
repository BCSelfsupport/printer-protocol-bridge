import { useState } from 'react';
import { Plus, Pencil, Trash2, Package, Droplets, AlertTriangle, Minus, Link } from 'lucide-react';
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
import { Consumable, PrinterConsumableAssignment } from '@/types/consumable';
import { Printer } from '@/types/printer';

interface ConsumablesScreenProps {
  consumables: Consumable[];
  assignments: PrinterConsumableAssignment[];
  printers: Printer[];
  onAddConsumable: (consumable: Omit<Consumable, 'id'>) => Consumable;
  onUpdateConsumable: (id: string, updates: Partial<Omit<Consumable, 'id'>>) => void;
  onRemoveConsumable: (id: string) => void;
  onSetStock: (id: string, amount: number) => void;
  onAdjustStock: (id: string, delta: number) => void;
  onAssignConsumable: (printerId: number, type: 'ink' | 'makeup', consumableId: string | undefined) => void;
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
  unit: 'bottles',
};

export function ConsumablesScreen({
  consumables,
  assignments,
  printers,
  onAddConsumable,
  onUpdateConsumable,
  onRemoveConsumable,
  onSetStock,
  onAdjustStock,
  onAssignConsumable,
}: ConsumablesScreenProps) {
  const [addEditOpen, setAddEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ConsumableFormData>(defaultFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [stockAdjustId, setStockAdjustId] = useState<string | null>(null);
  const [stockAdjustValue, setStockAdjustValue] = useState<string>('');
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

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

  const getStockBadge = (c: Consumable) => {
    const status = getStockStatus(c);
    if (status === 'critical') return <Badge variant="destructive" className="text-xs"><AlertTriangle className="w-3 h-3 mr-1" />OUT OF STOCK</Badge>;
    if (status === 'low') return <Badge className="text-xs bg-yellow-500 hover:bg-yellow-600 text-white"><AlertTriangle className="w-3 h-3 mr-1" />LOW STOCK</Badge>;
    return <Badge variant="secondary" className="text-xs">In Stock</Badge>;
  };

  // Get printers assigned to a consumable
  const getPrintersUsing = (consumableId: string) => {
    return assignments
      .filter(a => a.inkConsumableId === consumableId || a.makeupConsumableId === consumableId)
      .map(a => printers.find(p => p.id === a.printerId))
      .filter(Boolean) as Printer[];
  };

  const renderConsumableCard = (c: Consumable) => {
    const printersUsing = getPrintersUsing(c.id);
    const status = getStockStatus(c);

    return (
      <Card key={c.id} className={`transition-all ${status === 'critical' ? 'border-destructive/50 bg-destructive/5' : status === 'low' ? 'border-yellow-500/50 bg-yellow-500/5' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {c.type === 'ink' ? (
                  <Droplets className="w-4 h-4 text-blue-500 flex-shrink-0" />
                ) : (
                  <Package className="w-4 h-4 text-purple-500 flex-shrink-0" />
                )}
                <span className="font-semibold text-foreground truncate">{c.partNumber}</span>
                {getStockBadge(c)}
              </div>
              {c.description && (
                <p className="text-sm text-muted-foreground mb-2 truncate">{c.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Stock: </span>
                  <span className={`font-medium ${status === 'critical' ? 'text-destructive' : status === 'low' ? 'text-yellow-600' : 'text-foreground'}`}>
                    {c.currentStock} {c.unit}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Min: </span>
                  <span className="font-medium text-foreground">{c.minimumStock} {c.unit}</span>
                </div>
              </div>
              {printersUsing.length > 0 && (
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                  <Link className="w-3 h-3 text-muted-foreground" />
                  {printersUsing.map(p => (
                    <Badge key={p.id} variant="outline" className="text-xs">{p.name}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => onAdjustStock(c.id, 1)} title="Add 1">
                <Plus className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => onAdjustStock(c.id, -1)} title="Remove 1" disabled={c.currentStock === 0}>
                <Minus className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => {
                setStockAdjustId(c.id);
                setStockAdjustValue(String(c.currentStock));
              }} title="Set stock">
                <Package className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => openEdit(c)}>
                <Pencil className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteConfirmId(c.id)}>
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
        <h2 className="text-lg font-semibold text-foreground">Consumables</h2>
        <div className="flex gap-2">
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
            <TabsContent value="all" className="space-y-3 mt-0">
              {consumables.map(renderConsumableCard)}
            </TabsContent>
            <TabsContent value="ink" className="space-y-3 mt-0">
              {inkConsumables.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No ink consumables added.</p>
              ) : inkConsumables.map(renderConsumableCard)}
            </TabsContent>
            <TabsContent value="makeup" className="space-y-3 mt-0">
              {makeupConsumables.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No makeup consumables added.</p>
              ) : makeupConsumables.map(renderConsumableCard)}
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
                  <SelectItem value="bottles">Bottles</SelectItem>
                  <SelectItem value="cartridges">Cartridges</SelectItem>
                  <SelectItem value="liters">Liters</SelectItem>
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
