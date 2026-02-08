import { useState } from 'react';
import { ArrowLeft, X, Keyboard, Hash, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const BARCODE_ENCODINGS = [
  { value: 'i25', label: 'Interleaved 2 of 5' },
  { value: 'upca', label: 'UPC-A' },
  { value: 'upce', label: 'UPC-E' },
  { value: 'ean13', label: 'EAN 13' },
  { value: 'ean8', label: 'EAN 8' },
  { value: 'code39', label: 'Code 39' },
  { value: 'code128', label: 'Code 128' },
  { value: 'datamatrix', label: 'Data Matrix' },
  { value: 'qrcode', label: 'QR Code' },
  { value: 'dotcode', label: 'DotCode' },
] as const;

const START_CODES = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
] as const;

export interface BarcodeFieldConfig {
  data: string;
  encoding: string;
  humanReadable: boolean;
  checksum: 'manual' | 'auto';
  startCode?: 'A' | 'B' | 'C';
  size?: { width: number; height: number };
}

interface BarcodeFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onAddBarcode: (config: BarcodeFieldConfig) => void;
}

export function BarcodeFieldDialog({
  open,
  onOpenChange,
  onBack,
  onAddBarcode,
}: BarcodeFieldDialogProps) {
  const [data, setData] = useState('');
  const [encoding, setEncoding] = useState('code128');
  const [humanReadable, setHumanReadable] = useState(false);
  const [checksum, setChecksum] = useState<'manual' | 'auto'>('auto');
  const [startCode, setStartCode] = useState<'A' | 'B' | 'C'>('B');

  const isMatrixCode = encoding === 'datamatrix' || encoding === 'qrcode';
  const isCode128 = encoding === 'code128';

  const handleBack = () => {
    onOpenChange(false);
    onBack();
  };

  const handleClearData = () => {
    setData('');
  };

  const handleAdd = () => {
    if (!data.trim()) return;
    
    onAddBarcode({
      data: data.trim(),
      encoding,
      humanReadable: isMatrixCode ? false : humanReadable,
      checksum,
      startCode: isCode128 ? startCode : undefined,
    });
    
    // Reset form
    setData('');
    setEncoding('code128');
    setHumanReadable(false);
    setChecksum('auto');
    setStartCode('B');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b">
          <button
            onClick={handleBack}
            className="industrial-button p-2 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <DialogTitle className="flex-1 text-center text-lg font-semibold pr-10">
            Barcode Field
          </DialogTitle>
        </div>

        <div className="bg-card p-4 space-y-4">
          {/* Data input with clear button */}
          <div className="flex gap-2">
            <Input
              value={data}
              onChange={(e) => setData(e.target.value)}
              placeholder="Enter barcode data..."
              className="flex-1"
            />
            <button
              onClick={handleClearData}
              className="industrial-button p-2 rounded text-destructive"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Settings grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Encoding selector */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Encoding</Label>
              <Select value={encoding} onValueChange={setEncoding}>
                <SelectTrigger className="bg-gradient-to-b from-muted to-muted/60 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BARCODE_ENCODINGS.map((enc) => (
                    <SelectItem key={enc.value} value={enc.value}>
                      {enc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Human Readable toggle */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Human Readable</Label>
              <button
                onClick={() => !isMatrixCode && setHumanReadable(!humanReadable)}
                disabled={isMatrixCode}
                className={`w-full flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-2.5 transition-colors ${
                  isMatrixCode ? 'opacity-50 cursor-not-allowed' : 'hover:from-muted/80 hover:to-muted/40'
                }`}
              >
                <span className="text-sm">
                  {isMatrixCode ? 'N/A' : humanReadable ? 'On' : 'Off'}
                </span>
              </button>
            </div>

            {/* Checksum selector */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Checksum</Label>
              <Select value={checksum} onValueChange={(v) => setChecksum(v as 'manual' | 'auto')}>
                <SelectTrigger className="bg-gradient-to-b from-muted to-muted/60 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Start Code (Code 128 only) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Start Code</Label>
              <Select 
                value={startCode} 
                onValueChange={(v) => setStartCode(v as 'A' | 'B' | 'C')}
                disabled={!isCode128}
              >
                <SelectTrigger className={`bg-gradient-to-b from-muted to-muted/60 border-border ${!isCode128 ? 'opacity-50' : ''}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {START_CODES.map((sc) => (
                    <SelectItem key={sc.value} value={sc.value}>
                      {sc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action buttons row */}
          <div className="grid grid-cols-3 gap-3">
            <button
              className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border border-border rounded-lg p-3 transition-colors"
              onClick={() => {/* Keyboard input - TODO */}}
            >
              <span className="text-sm font-medium">Keyboard</span>
              <div className="industrial-button p-1.5 rounded">
                <Keyboard className="w-4 h-4" />
              </div>
            </button>

            <button
              className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border border-border rounded-lg p-3 transition-colors"
              onClick={() => {/* AutoCode - TODO */}}
            >
              <span className="text-sm font-medium">AutoCode</span>
              <div className="industrial-button p-1.5 rounded">
                <Hash className="w-4 h-4" />
              </div>
            </button>

            <button
              className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border border-border rounded-lg p-3 transition-colors"
              onClick={() => {/* User Define - TODO */}}
            >
              <span className="text-sm font-medium">User Define</span>
              <div className="industrial-button p-1.5 rounded">
                <User className="w-4 h-4" />
              </div>
            </button>
          </div>

          {/* Add button */}
          <Button 
            onClick={handleAdd}
            disabled={!data.trim()}
            className="w-full"
          >
            Add Barcode Field
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
