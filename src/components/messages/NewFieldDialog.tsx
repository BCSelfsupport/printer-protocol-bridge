import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { FileText, Hash, User, Barcode, Image, ChevronRight, Plus, ArrowLeft, Tag } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const FIELD_TYPES = [
  { value: 'text', label: 'Text Field', icon: FileText, action: 'add' },
  { value: 'lineid', label: 'Line ID', icon: Tag, action: 'add' },
  { value: 'userdefine', label: 'User Define', icon: User, action: 'expand' },
  { value: 'autocode', label: 'AutoCode Field', icon: Hash, action: 'submenu' },
  { value: 'barcode', label: 'Barcode Field', icon: Barcode, action: 'submenu' },
  { value: 'logo', label: 'Graphic Field', icon: Image, action: 'submenu' },
] as const;

interface NewFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFieldType: (type: string, options?: { promptBeforePrint?: boolean; promptLabel?: string; promptLength?: number; lineIdValue?: string }) => void;
  onOpenAutoCode: () => void;
  onOpenBarcode: () => void;
  onOpenUserDefine: () => void;
  onOpenGraphic: () => void;
  connectedPrinterLineId?: string;
}

export function NewFieldDialog({ 
  open, 
  onOpenChange, 
  onSelectFieldType,
  onOpenAutoCode,
  onOpenBarcode,
  onOpenUserDefine,
  onOpenGraphic,
  connectedPrinterLineId,
}: NewFieldDialogProps) {
  const [showPromptConfig, setShowPromptConfig] = useState(false);
  const [showLineIdWarning, setShowLineIdWarning] = useState(false);
  const [promptLabel, setPromptLabel] = useState('');
  const [promptLength, setPromptLength] = useState(3);

  const handleSelect = (fieldType: typeof FIELD_TYPES[number]) => {
    if (fieldType.value === 'autocode') {
      onOpenChange(false);
      onOpenAutoCode();
      return;
    }
    if (fieldType.value === 'barcode') {
      onOpenChange(false);
      onOpenBarcode();
      return;
    }
    if (fieldType.value === 'userdefine') {
      setShowPromptConfig(true);
      return;
    }
    if (fieldType.value === 'logo') {
      onOpenChange(false);
      onOpenGraphic();
      return;
    }
    if (fieldType.value === 'lineid') {
      if (!connectedPrinterLineId?.trim()) {
        setShowLineIdWarning(true);
        return;
      }
      onSelectFieldType('text', { lineIdValue: connectedPrinterLineId });
      onOpenChange(false);
      return;
    }
    onSelectFieldType(fieldType.value);
    onOpenChange(false);
  };

  const handleAddPromptedField = () => {
    onSelectFieldType('text', {
      promptBeforePrint: true,
      promptLabel: promptLabel.trim().toUpperCase() || 'ENTER VALUE',
      promptLength: Math.max(1, promptLength),
    });
    onOpenChange(false);
    // Reset
    setShowPromptConfig(false);
    setPromptLabel('');
    setPromptLength(3);
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      setShowPromptConfig(false);
      setShowLineIdWarning(false);
      setPromptLabel('');
      setPromptLength(3);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b">
          <button
            onClick={() => {
              if (showPromptConfig) {
                setShowPromptConfig(false);
              } else {
                handleClose(false);
              }
            }}
            className="industrial-button p-2 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <DialogTitle className="flex-1 text-center text-lg font-semibold pr-10">
            {showLineIdWarning ? 'Line ID Required' : showPromptConfig ? 'User Define' : 'New Field'}
          </DialogTitle>
        </div>

        {showLineIdWarning ? (
          /* Line ID not configured warning */
          <div className="bg-card p-6 space-y-4 text-center">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-accent-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-foreground font-medium text-sm">
                No Line ID Configured
              </p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                You need to configure a Line ID before adding this field.
                In the left panel, find your networked printer card and tap the 
                <span className="text-primary font-medium"> printer icon </span> 
                in the top left of the card to open printer setup, then enter a Line ID value.
              </p>
            </div>
            <button
              onClick={() => {
                setShowLineIdWarning(false);
                handleClose(false);
              }}
              className="w-full industrial-button text-white py-3 rounded-lg font-medium"
            >
              OK
            </button>
          </div>
        ) : showPromptConfig ? (
          /* Prompted text field config */
          <div className="bg-card p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Operator will be asked to enter this value each time the message is selected for printing.
            </p>
            <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
              <label className="text-foreground font-medium text-sm">Prompt Label:</label>
              <Input
                value={promptLabel}
                onChange={(e) => setPromptLabel(e.target.value)}
                className="w-40 h-8 text-sm"
                placeholder="LOT CODE"
              />
            </div>
            <div className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-3">
              <label className="text-foreground font-medium text-sm">Max Characters: {promptLength}</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPromptLength(prev => Math.max(1, prev - 1))}
                  className="industrial-button p-2 rounded"
                >
                  <span className="text-sm font-bold">−</span>
                </button>
                <button
                  onClick={() => setPromptLength(prev => Math.min(99, prev + 1))}
                  className="industrial-button p-2 rounded"
                >
                  <span className="text-sm font-bold">+</span>
                </button>
              </div>
            </div>
            <button
              onClick={handleAddPromptedField}
              className="w-full industrial-button text-white py-3 rounded-lg flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5 text-primary" />
              <span className="font-medium">Add Prompted Field</span>
            </button>
          </div>
        ) : (
          /* Field type grid */
          <div className="bg-card p-4">
            <div className="grid grid-cols-2 gap-3">
              {FIELD_TYPES.map((fieldType) => (
                <button
                  key={fieldType.value}
                  onClick={() => handleSelect(fieldType)}
                  className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border border-border rounded-lg p-3 transition-colors group"
                >
                  <span className="text-foreground font-medium text-sm">
                    {fieldType.label}
                  </span>
                  <div className="industrial-button p-2 rounded">
                    {fieldType.action === 'add' ? (
                      <Plus className="w-5 h-5 text-primary" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
