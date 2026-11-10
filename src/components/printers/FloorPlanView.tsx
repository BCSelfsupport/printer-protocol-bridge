import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, useReactFlow, applyNodeChanges, type Node, type NodeProps, type NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Factory, Lock, Pencil, Plus, Printer as PrinterIcon, RotateCw, Scan, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FloorEquipment } from './FloorEquipment';
import { addFloorItem, readFloorPlan, updateFloorItem, floorNames, floorPrinterStatus, FLOOR_STORAGE_KEY, type FloorItem, type FloorKind } from '@/lib/floorPlan';
import type { Printer } from '@/types/printer';
import { cn } from '@/lib/utils';

type EquipmentNode = Node<{ item: FloorItem; printer?: Printer }, 'equipment'>;
const lightClasses = { healthy: 'bg-success', warning: 'bg-warning', fault: 'bg-destructive', offline: 'bg-muted-foreground', unknown: 'bg-muted-foreground' };
const statusNames = { healthy: 'No reported issues', warning: 'Attention needed', fault: 'Reported fault', offline: 'Offline', unknown: 'Status unknown' };
function EquipmentNodeView({ data, selected }: NodeProps<EquipmentNode>) {
  const { item, printer } = data;
  return <div className={cn('floor-node', selected && 'floor-node-selected')} style={{ width: 220 * item.scale / 100, height: (item.kind === 'label' ? 42 : 260) * item.scale / 100 }}>
    <div className="floor-node-content" style={{ transform: `scale(${item.scale / 100})`, width: 220 }}>
      {(item.kind === 'printer' || item.kind === 'label') && <div className="floor-node-label flex items-center justify-center gap-2 px-1 text-sm font-semibold text-foreground text-center break-words">
        {printer && <span title={statusNames[floorPrinterStatus(printer)]} className={cn('h-3 w-3 shrink-0 rounded-full', lightClasses[floorPrinterStatus(printer)])} />}
        <span>{printer ? `${printer.name} · ID ${printer.id}` : item.label}</span>
      </div>}
      <div className="floor-symbol" style={{ transform: `rotate(${item.rotation}deg)` }}><FloorEquipment kind={item.kind} /></div>
    </div>
  </div>;
}
const nodeTypes = { equipment: EquipmentNodeView };
const palette: FloorKind[] = ['straight', 'bend', 'filler', 'capper', 'labeler', 'packer', 'label'];

interface Props { printers: Printer[]; onOpenPrinter: (printer: Printer) => void; onService: (printer: Printer) => void }
export function FloorPlanView(props: Props) {
  return <ReactFlowProvider><FloorPlanEditor {...props} /></ReactFlowProvider>;
}
function FloorPlanEditor({ printers, onOpenPrinter, onService }: Props) {
  const [items, setItems] = useState<FloorItem[]>(readFloorPlan);
  const [editing, setEditing] = useState(false);
  const [libraryKind, setLibraryKind] = useState<FloorKind>('straight');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overviewId, setOverviewId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState(false);
  const flow = useReactFlow<EquipmentNode>();
  const selected = items.find(i => i.id === selectedId);
  const overview = printers.find(p => p.id === overviewId);
  const unplaced = printers.filter(p => !items.some(i => i.kind === 'printer' && i.printerId === p.id));
  useEffect(() => {
    try { localStorage.setItem(FLOOR_STORAGE_KEY, JSON.stringify(items)); setSaveError(false); }
    catch { setSaveError(true); }
  }, [items]);
  const nodes = useMemo<EquipmentNode[]>(() => items.filter(i => i.kind !== 'printer' || printers.some(p => p.id === i.printerId)).map(item => ({
    id: item.id, type: 'equipment', position: { x: item.x, y: item.y }, selected: item.id === selectedId,
    zIndex: item.kind === 'printer' ? 100 : item.kind === 'label' ? 200 : 0,
    data: { item, printer: printers.find(p => p.id === item.printerId) },
    style: { width: 220 * item.scale / 100, height: (item.kind === 'label' ? 42 : 260) * item.scale / 100 },
  })), [items, printers, selectedId]);
  const add = (kind: FloorKind, printer?: Printer, position?: { x: number; y: number }) => {
    const center = position ?? flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setItems(prev => {
      let point = { ...center };
      if (!position) {
        let attempts = 0;
        while (prev.some(i => Math.abs(i.x - point.x) < 240 && Math.abs(i.y - point.y) < 280) && attempts < 50) {
          point = { x: center.x + (attempts % 4) * 260, y: center.y + Math.floor(attempts / 4) * 290 }; attempts++;
        }
      }
      const next = addFloorItem(prev, kind, printer, point); setSelectedId(next.at(-1)?.id ?? null); return next;
    });
    requestAnimationFrame(() => flow.fitView({ padding: 0.25, maxZoom: 1 }));
  };
  const change = useCallback((changes: NodeChange<EquipmentNode>[]) => {
    if (!editing) return;
    const moved = applyNodeChanges(changes, nodes);
    setItems(prev => prev.map(item => { const node = moved.find(n => n.id === item.id); return node ? { ...item, x: node.position.x, y: node.position.y } : item; }));
  }, [editing, nodes]);
  const patch = (values: Parameters<typeof updateFloorItem>[2]) => { if (selected) setItems(prev => updateFloorItem(prev, selected.id, values)); };
  return <div className="flex flex-col flex-1 min-h-0 bg-background text-foreground">
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b">
      <div className="flex items-center gap-2 text-sm"><Factory className="h-4 w-4 text-primary" /><strong>Production floor</strong><span className="text-muted-foreground">{items.filter(i => i.kind === 'printer' && printers.some(p => p.id === i.printerId)).length}/{printers.length} printers</span></div>
      <div className="flex items-center gap-1">
        {saveError && <span role="alert" className="text-destructive text-xs">Layout could not be saved</span>}
        <Button size="icon" variant="ghost" title="Zoom out" aria-label="Zoom out" onClick={() => flow.zoomOut()}><ZoomOut className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" title="Zoom in" aria-label="Zoom in" onClick={() => flow.zoomIn()}><ZoomIn className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" title="Fit whole floor" aria-label="Fit whole floor" onClick={() => flow.fitView({ padding: 0.25, maxZoom: 1 })}><Scan className="h-4 w-4" /></Button>
        <Button size="sm" variant={editing ? 'default' : 'outline'} onClick={() => { setEditing(!editing); setSelectedId(null); }}>{editing ? <Lock className="h-4 w-4 mr-2" /> : <Pencil className="h-4 w-4 mr-2" />}{editing ? 'Done' : 'Edit Layout'}</Button>
      </div>
    </div>
    <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
      {editing && <aside className="w-full sm:w-56 shrink-0 border-b sm:border-b-0 sm:border-r bg-card overflow-auto max-h-52 sm:max-h-none p-3 space-y-4">
        <section className="space-y-2"><h3 className="text-xs uppercase text-muted-foreground font-semibold">Machine library</h3>
          <Select value={libraryKind} onValueChange={value => setLibraryKind(value as FloorKind)}><SelectTrigger aria-label="Machine library"><SelectValue /></SelectTrigger><SelectContent>{palette.map(kind => <SelectItem key={kind} value={kind}>{floorNames[kind]}</SelectItem>)}</SelectContent></Select>
          <div className="flex justify-center border-b pb-2 overflow-hidden"><FloorEquipment kind={libraryKind} /></div>
          <Button className="w-full" size="sm" draggable onDragStart={e => e.dataTransfer.setData('application/codesync-floor', libraryKind)} onClick={() => add(libraryKind)}><Plus className="h-4 w-4 mr-2" />Add to Plan</Button>
        </section>
        <section><h3 className="text-xs uppercase text-muted-foreground font-semibold mb-2">Unplaced printers · {unplaced.length}</h3>
          {unplaced.map(p => <Button key={p.id} className="w-full justify-start h-auto min-h-10 mb-1 whitespace-normal text-left" variant="outline" draggable onDragStart={e => e.dataTransfer.setData('application/codesync-floor', `printer:${p.id}`)} onClick={() => add('printer', p)}><PrinterIcon className="h-4 w-4 mr-2 shrink-0" />{p.name} · ID {p.id}</Button>)}
        </section>
        {selected && <section className="space-y-3 border-t pt-3"><h3 className="font-semibold text-sm">{floorNames[selected.kind]}</h3>
          {selected.kind !== 'printer' && <label className="block text-xs">Name<Input className="mt-1" value={selected.label} onChange={e => patch({ label: e.target.value })} /></label>}
          <label className="block text-xs">Size (%)<Input aria-label="Size percent" type="number" min={25} max={300} step={5} value={selected.scale} onChange={e => { if (e.target.value) patch({ scale: Number(e.target.value) }); }} className="mt-1" /></label>
          <label className="block text-xs">Rotation (°)<div className="flex gap-1 mt-1"><Input aria-label="Rotation degrees" type="number" value={selected.rotation} onChange={e => patch({ rotation: Number(e.target.value) })} /><Button variant="outline" size="icon" title="Rotate 90 degrees" aria-label="Rotate 90 degrees" onClick={() => patch({ rotation: selected.rotation + 90 })}><RotateCw className="h-4 w-4" /></Button></div></label>
          <Button variant="outline" size="sm" className="w-full text-destructive" onClick={() => { setItems(prev => prev.filter(i => i.id !== selected.id)); setSelectedId(null); }}><Trash2 className="h-4 w-4 mr-2" />Remove from plan</Button>
        </section>}
      </aside>}
      <div className="relative flex-1 min-h-48 floor-surface" onDragOver={e => { if (editing) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }} onDrop={e => {
        if (!editing) return; e.preventDefault(); const value = e.dataTransfer.getData('application/codesync-floor'); const position = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        if (value.startsWith('printer:')) { const printer = printers.find(p => p.id === Number(value.split(':')[1])); if (printer) add('printer', printer, position); }
        else if (palette.includes(value as FloorKind)) add(value as FloorKind, undefined, position);
      }}>
        <ReactFlow<EquipmentNode> nodes={nodes} edges={[]} nodeTypes={nodeTypes} onNodesChange={change} nodesDraggable={editing} nodesConnectable={false} elementsSelectable={editing} elevateNodesOnSelect={false} onNodeDragStart={(_, node) => setSelectedId(node.id)} deleteKeyCode={null} minZoom={0.2} maxZoom={2.5} fitView fitViewOptions={{ padding: 0.3, maxZoom: 1 }} snapToGrid snapGrid={[10, 10]} onNodeClick={(_, node) => { if (editing) setSelectedId(node.id); else if (node.data.printer) setOverviewId(node.data.printer.id); }} onPaneClick={() => setSelectedId(null)} proOptions={{ hideAttribution: true }}>
          <Background variant={BackgroundVariant.Lines} gap={20} size={1} />
        </ReactFlow>
        {items.length === 0 && <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3 text-muted-foreground"><Factory className="h-12 w-12 opacity-40" /><h3 className="font-semibold text-foreground">Production floor</h3>{!editing && <Button className="pointer-events-auto" onClick={() => setEditing(true)}><Plus className="h-4 w-4 mr-2" />Create Layout</Button>}</div>}
      </div>
    </div>
    <div className="border-t flex flex-wrap gap-4 px-4 py-2 text-xs text-muted-foreground">{(['healthy', 'warning', 'fault', 'offline'] as const).map(s => <span key={s} className="flex items-center gap-1.5"><i className={cn('w-2 h-2 rounded-full', lightClasses[s])} />{s === 'offline' ? 'Offline / unknown' : statusNames[s]}</span>)}</div>
    <Dialog open={!!overview} onOpenChange={open => { if (!open) setOverviewId(null); }}><DialogContent className="max-h-[85vh] overflow-auto"><DialogHeader><DialogTitle>{overview?.name} · ID {overview?.id}</DialogTitle></DialogHeader>{overview && <>
      <div className="flex justify-center"><FloorEquipment kind="printer" /></div>
      <div className="flex items-center gap-2"><i className={cn('h-3 w-3 rounded-full', lightClasses[floorPrinterStatus(overview)])} />{statusNames[floorPrinterStatus(overview)]}</div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">{[['Address', `${overview.ipAddress}:${overview.port}`], ['Line', overview.lineId ?? '—'], ['Selected message', overview.currentMessage ?? 'Unknown'], ['Jet', overview.jetRunning === undefined ? 'Unknown' : overview.jetRunning ? 'Running' : 'Stopped'], ['Ink', overview.isAvailable ? overview.inkLevel ?? 'Unknown' : 'Unknown'], ['Makeup', overview.isAvailable ? overview.makeupLevel ?? 'Unknown' : 'Unknown'], ['Print count', overview.isAvailable ? overview.printCount?.toLocaleString() ?? 'Unknown' : 'Unknown'], ['Model', overview.printerModel ?? 'Unknown']].map(([label, value]) => <div key={label}><dt className="text-muted-foreground text-xs">{label}</dt><dd className="font-medium break-words">{value}</dd></div>)}</dl>
      {overview.syncLastFailure && <p className="text-destructive text-sm">{overview.syncLastFailure.reason}</p>}
      <div className="flex flex-wrap gap-2 border-t pt-4"><Button disabled={!overview.isAvailable} onClick={() => { setOverviewId(null); onOpenPrinter(overview); }}>Open Printer</Button><Button variant="outline" disabled={!overview.isAvailable} onClick={() => { setOverviewId(null); onService(overview); }}>Service Overview</Button></div>
    </>}</DialogContent></Dialog>
  </div>;
}