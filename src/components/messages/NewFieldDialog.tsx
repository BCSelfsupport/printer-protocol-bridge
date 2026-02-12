import { FileText, Hash, User, Barcode, Image, ChevronRight, Plus, ArrowLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

const FIELD_TYPES = [
  { value: 'text', label: 'Text Field', icon: FileText, action: 'add' },
  { value: 'autocode', label: 'AutoCode Field', icon: Hash, action: 'submenu' },
  { value: 'userdefine', label: 'User Define', icon: User, action: 'submenu' },
  { value: 'barcode', label: 'Barcode Field', icon: Barcode, action: 'submenu' },
  { value: 'logo', label: 'Graphic Field', icon: Image, action: 'submenu' },
] as const;

interface NewFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFieldType: (type: string) => void;
  onOpenAutoCode: () => void;
  onOpenBarcode: () => void;
  onOpenUserDefine: () => void;
  onOpenGraphic: () => void;
}

export function NewFieldDialog({ 
  open, 
  onOpenChange, 
  onSelectFieldType,
  onOpenAutoCode,
  onOpenBarcode,
  onOpenUserDefine,
  onOpenGraphic,
}: NewFieldDialogProps) {
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
      onOpenChange(false);
      onOpenUserDefine();
      return;
    }
    if (fieldType.value === 'logo') {
      onOpenChange(false);
      onOpenGraphic();
      return;
    }
    onSelectFieldType(fieldType.value);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Header styled like the reference */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b">
          <button
            onClick={() => onOpenChange(false)}
            className="industrial-button p-2 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <DialogTitle className="flex-1 text-center text-lg font-semibold pr-10">
            New Field
          </DialogTitle>
        </div>

        {/* Field type grid */}
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
      </DialogContent>
    </Dialog>
  );
}
