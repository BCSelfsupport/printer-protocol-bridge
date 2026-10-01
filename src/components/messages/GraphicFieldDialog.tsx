import { useEffect, useState } from 'react';
import { Plus, ArrowLeft, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { getCachedGraphic, requestGraphic, subscribeGraphics, type GraphicBitmap } from '@/lib/graphicBitmap';

export interface GraphicFieldConfig {
  number: number;
  name: string;
}

interface GraphicFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onAddGraphic: (config: GraphicFieldConfig) => void;
  /** Sends a command to the connected printer; used for ^LL (list graphics) and ^VG (preview). */
  onSendCommand?: (command: string) => Promise<unknown>;
}

/** Pull graphic file names out of a ^LL reply (tolerates lists, numbering, commas). */
export function parseGraphicList(response: string): string[] {
  const names = response.match(/[A-Za-z0-9_\-.]+\.bmp\b/gi) ?? [];
  const seen = new Set<string>();
  return names.filter((n) => {
    const k = n.toUpperCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function BitmapPreview({ bmp }: { bmp: GraphicBitmap }) {
  const scale = Math.max(1, Math.min(3, Math.floor(80 / bmp.height)));
  return (
    <svg width={bmp.width * scale} height={bmp.height * scale} className="max-w-full">
      {bmp.dots.flatMap((row, y) =>
        row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x * scale} y={y * scale} width={scale} height={scale} className="fill-foreground" /> : null)),
      )}
    </svg>
  );
}

export function GraphicFieldDialog({ open, onOpenChange, onBack, onAddGraphic, onSendCommand }: GraphicFieldDialogProps) {
  const [graphics, setGraphics] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setVersion] = useState(0);

  useEffect(() => subscribeGraphics(() => setVersion((v) => v + 1)), []);

  const loadList = async () => {
    if (!onSendCommand) {
      setGraphics([]);
      setError('Connect to a printer to see its graphics.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await onSendCommand('^LL');
      const text = typeof res === 'string' ? res : String((res as { response?: string } | undefined)?.response ?? '');
      const list = parseGraphicList(text);
      setGraphics(list);
      setSelectedIndex(0);
      if (list.length === 0) setError('No graphics found on this printer.');
    } catch {
      setError('Could not read graphics from the printer.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedName = graphics[selectedIndex];
  useEffect(() => {
    if (selectedName && onSendCommand && getCachedGraphic(selectedName) === undefined) {
      void requestGraphic(selectedName, onSendCommand);
    }
  }, [selectedName, onSendCommand]);
  const bmp = selectedName ? getCachedGraphic(selectedName) : undefined;

  const handleBack = () => {
    onOpenChange(false);
    onBack();
  };

  const handleAdd = () => {
    if (!selectedName) return;
    onAddGraphic({ number: selectedIndex + 1, name: selectedName });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b">
          <button onClick={handleBack} className="industrial-button p-2 rounded">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <DialogTitle className="flex-1 text-center text-lg font-semibold pr-10">
            Graphics: {graphics.length}
          </DialogTitle>
        </div>

        <div className="bg-card p-4">
          <div className="flex gap-3">
            <div className="flex-1 space-y-3 min-w-0">
              <div className="bg-muted border border-border rounded-lg p-2 h-24 flex items-center justify-center overflow-hidden">
                {loading ? (
                  <span className="text-sm text-muted-foreground">Reading printer…</span>
                ) : bmp ? (
                  <BitmapPreview bmp={bmp} />
                ) : selectedName ? (
                  <span className="text-foreground font-bold text-lg">{selectedName.replace(/\.bmp$/i, '')}</span>
                ) : (
                  <span className="text-sm text-muted-foreground text-center">{error ?? 'No graphics'}</span>
                )}
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <div className="grid grid-cols-[60px_1fr] bg-muted/80 border-b border-border">
                  <div className="px-2 py-1.5 text-xs font-semibold text-foreground border-r border-border">Number</div>
                  <div className="px-2 py-1.5 text-xs font-semibold text-foreground">Name</div>
                </div>
                <div className="max-h-32 overflow-y-auto">
                  {graphics.map((name, index) => (
                    <div
                      key={name}
                      onClick={() => setSelectedIndex(index)}
                      className={`grid grid-cols-[60px_1fr] cursor-pointer transition-colors ${
                        index === selectedIndex ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="px-2 py-1.5 text-sm border-r border-border text-center">{index + 1}</div>
                      <div className="px-2 py-1.5 text-sm truncate">{name}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button onClick={() => void loadList()} className="industrial-button p-2 rounded" title="Refresh from printer" disabled={loading}>
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setSelectedIndex((p) => Math.max(0, p - 1))} className="industrial-button p-2 rounded" disabled={selectedIndex === 0}>
                <ArrowUp className="w-5 h-5" />
              </button>
              <button
                onClick={() => setSelectedIndex((p) => Math.min(graphics.length - 1, p + 1))}
                className="industrial-button p-2 rounded"
                disabled={selectedIndex >= graphics.length - 1}
              >
                <ArrowDown className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex justify-center mt-4">
            <button onClick={handleAdd} disabled={!selectedName} className="industrial-button px-6 py-2 rounded flex items-center gap-2 disabled:opacity-50">
              <Plus className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">Add</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
