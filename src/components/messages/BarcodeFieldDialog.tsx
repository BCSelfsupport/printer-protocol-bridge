import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, X, Keyboard, Hash, User, ChevronRight } from 'lucide-react';
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
  { value: 'i25', label: 'Interleaved 2 of 5', group: '1D' },
  { value: 'upca', label: 'UPC-A', group: '1D' },
  { value: 'upce', label: 'UPC-E', group: '1D' },
  { value: 'ean13', label: 'EAN 13', group: '1D' },
  { value: 'ean8', label: 'EAN 8', group: '1D' },
  { value: 'code39', label: 'Code 39', group: '1D' },
  { value: 'code128', label: 'Code 128', group: '1D' },
  { value: 'code128_ucc', label: 'A UCC/EAN-128', group: '1D' },
  { value: 'code128_sscc', label: 'UCC/EAN-128 SSCC', group: '1D' },
  { value: 'code128_multi', label: 'Multi-Information', group: '1D' },
  { value: 'datamatrix', label: 'Data Matrix', group: '2D' },
  { value: 'qrcode', label: 'QR Code', group: '2D' },
  { value: 'dotcode', label: 'DotCode', group: '2D' },
] as const;

const START_CODES = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
] as const;

// GS1 Application Identifiers for UCC/EAN-128
const APPLICATION_IDENTIFIERS = [
  { code: '00', label: 'Serial Shipping Container Code' },
  { code: '01', label: 'Shipping Container Code' },
  { code: '10', label: 'Batch or Lot Number' },
  { code: '11', label: 'Production Date (YYMMDD)' },
  { code: '13', label: 'Packaging Date (YYMMDD)' },
  { code: '15', label: 'Best Before/Sell By Date (YYMMDD)' },
  { code: '17', label: 'Sell By/Expiration Date (YYMMDD)' },
  { code: '20', label: 'Product Variant' },
  { code: '21', label: 'Serial Number' },
  { code: '22', label: 'HIBCC; quantity, date, batch, and link' },
  { code: '23', label: 'Lot Number' },
  { code: '30', label: 'Quantity each' },
  { code: '240', label: 'Secondary product attributes' },
  { code: '250', label: 'Secondary Serial number' },
  { code: '310', label: 'Net Weight, kilograms' },
  { code: '311', label: 'Length or first dimension, meters' },
  { code: '312', label: 'Width, diameter, or 2nd dimension, meters' },
  { code: '313', label: 'Depth, thickness, height, or 3rd dimension, meters' },
  { code: '314', label: 'Area, square meters' },
  { code: '315', label: 'Volume, liters' },
  { code: '316', label: 'Volume, cubic meters' },
  { code: '320', label: 'Net weight, pounds' },
  { code: '330', label: 'Gross weight, kilograms' },
  { code: '331', label: 'Length or first dimension, meters logistics' },
  { code: '332', label: 'Width, diameter, or 2nd dimension, meters logistics' },
  { code: '333', label: 'Depth, thickness, height, or 3rd dimension, meters logistics' },
  { code: '334', label: 'Area, square meters logistics' },
  { code: '335', label: 'Gross volume, liters logistics' },
  { code: '336', label: 'Gross volume, cubic meters logistics' },
  { code: '340', label: 'Gross weight, pounds' },
  { code: '400', label: 'Customer purchase order number' },
  { code: '410', label: 'Ship to location code (EAN-13 or DUNS)' },
  { code: '411', label: 'Bill to location code (EAN-13 or DUNS)' },
  { code: '412', label: 'Purchase from location code (EAN-13 or DUNS)' },
  { code: '420', label: 'Ship to postal code' },
  { code: '421', label: 'Ship to postal code with 3-digit ISO country code' },
  { code: '8001', label: 'Roll products: width, length, core diameter, direction, splices' },
  { code: '8002', label: 'Electronic serial number for cellular telephones' },
  { code: '90', label: 'FACT identifiers (internal applications)' },
  { code: '91', label: 'Internal use (raw materials, packaging, components)' },
] as const;

// Data Matrix sizes with capacity
const DATAMATRIX_SIZES = [
  { value: '10x10', label: '10×10', numericCap: 6, alphaCap: 3 },
  { value: '12x12', label: '12×12', numericCap: 10, alphaCap: 6 },
  { value: '14x14', label: '14×14', numericCap: 16, alphaCap: 10 },
  { value: '16x16', label: '16×16', numericCap: 24, alphaCap: 16 },
  { value: '18x18', label: '18×18', numericCap: 36, alphaCap: 25 },
  { value: '20x20', label: '20×20', numericCap: 44, alphaCap: 31 },
  { value: '22x22', label: '22×22', numericCap: 60, alphaCap: 43 },
  { value: '24x24', label: '24×24', numericCap: 72, alphaCap: 52 },
  { value: '26x26', label: '26×26', numericCap: 88, alphaCap: 64 },
  { value: '32x32', label: '32×32', numericCap: 124, alphaCap: 91 },
  { value: '36x12', label: '36×12', numericCap: 44, alphaCap: 31 },
  { value: '36x16', label: '36×16', numericCap: 64, alphaCap: 46 },
  { value: '48x16', label: '48×16', numericCap: 98, alphaCap: 72 },
] as const;

// QR Code versions/sizes
const QRCODE_SIZES = [
  { value: '1', label: 'Version 1 (21×21)', numericCap: 17, alphaCap: 10, binaryCap: 7, kanjiCap: 4 },
  { value: '2', label: 'Version 2 (25×25)', numericCap: 34, alphaCap: 20, binaryCap: 14, kanjiCap: 8 },
  { value: '3', label: 'Version 3 (29×29)', numericCap: 58, alphaCap: 35, binaryCap: 24, kanjiCap: 15 },
] as const;

// DotCode scales
const DOTCODE_SCALES = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
] as const;

export interface BarcodeFieldConfig {
  data: string;
  encoding: string;
  humanReadable: boolean;
  checksum: 'manual' | 'auto';
  startCode?: 'A' | 'B' | 'C';
  applicationIdentifier?: string;
  size?: string;
  dotcodeScale?: string;
  dotcodeHeight?: number;
  dotcodeWidth?: number;
  dotcodeMask?: 'auto' | 'manual';
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
  const [applicationIdentifier, setApplicationIdentifier] = useState('01');
  const [matrixSize, setMatrixSize] = useState('12x12');
  const [qrVersion, setQrVersion] = useState('1');
  const [dotcodeScale, setDotcodeScale] = useState('2');
  const [dotcodeHeight, setDotcodeHeight] = useState(9);
  const [dotcodeWidth, setDotcodeWidth] = useState(36);
  const [dotcodeMask, setDotcodeMask] = useState<'auto' | 'manual'>('auto');

  const is2D = encoding === 'datamatrix' || encoding === 'qrcode' || encoding === 'dotcode';
  const isCode128 = encoding.startsWith('code128');
  const isUCC = encoding === 'code128_ucc' || encoding === 'code128_sscc' || encoding === 'code128_multi';
  const isDataMatrix = encoding === 'datamatrix';
  const isQR = encoding === 'qrcode';
  const isDotCode = encoding === 'dotcode';

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
      humanReadable: is2D ? false : humanReadable,
      checksum,
      startCode: isCode128 ? startCode : undefined,
      applicationIdentifier: isUCC ? applicationIdentifier : undefined,
      size: isDataMatrix ? matrixSize : isQR ? qrVersion : undefined,
      dotcodeScale: isDotCode ? dotcodeScale : undefined,
      dotcodeHeight: isDotCode ? dotcodeHeight : undefined,
      dotcodeWidth: isDotCode ? dotcodeWidth : undefined,
      dotcodeMask: isDotCode ? dotcodeMask : undefined,
    });
    
    // Reset form
    setData('');
    setEncoding('code128');
    setHumanReadable(false);
    setChecksum('auto');
    setStartCode('B');
    setApplicationIdentifier('01');
    setMatrixSize('12x12');
    setQrVersion('1');
    setDotcodeScale('2');
    setDotcodeHeight(9);
    setDotcodeWidth(36);
    setDotcodeMask('auto');
    onOpenChange(false);
  };

  const dataInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // iOS/Android: focusing immediately on open can fail; queue it.
    const t = window.setTimeout(() => {
      dataInputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const focusDataInput = () => {
    dataInputRef.current?.focus();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden h-[100dvh] max-h-[100dvh] md:h-auto md:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b shrink-0">
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

        {/* Body (scrolls) */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y">
          <div className="bg-card p-4 space-y-4">
            {/* Data input with clear button */}
            <div className="flex gap-2" onClick={focusDataInput}>
              <Input
                ref={dataInputRef}
                value={data}
                onChange={(e) => setData(e.target.value)}
                placeholder="Enter barcode data..."
                className="flex-1"
                inputMode="text"
                enterKeyHint="done"
                autoCapitalize="characters"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearData();
                  // Keep focus so keyboard stays up
                  requestAnimationFrame(() => dataInputRef.current?.focus());
                }}
                className="industrial-button p-2 rounded text-destructive"
                aria-label="Clear barcode data"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Encoding selector - full width */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Encoding</Label>
              <Select value={encoding} onValueChange={setEncoding}>
                <SelectTrigger className="bg-gradient-to-b from-muted to-muted/60 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="header-1d" disabled className="font-semibold text-muted-foreground text-xs">
                    1D Barcodes
                  </SelectItem>
                  {BARCODE_ENCODINGS.filter(e => e.group === '1D').map((enc) => (
                    <SelectItem key={enc.value} value={enc.value}>
                      {enc.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="header-2d" disabled className="font-semibold text-muted-foreground text-xs mt-2">
                    2D Barcodes
                  </SelectItem>
                  {BARCODE_ENCODINGS.filter(e => e.group === '2D').map((enc) => (
                    <SelectItem key={enc.value} value={enc.value}>
                      {enc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Settings grid - 2 columns */}
            <div className="grid grid-cols-2 gap-3">
              {/* Human Readable toggle - not for 2D codes */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Human Readable</Label>
                <button
                  onClick={() => !is2D && setHumanReadable(!humanReadable)}
                  disabled={is2D}
                  className={`w-full flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 border border-border rounded-lg p-2.5 transition-colors ${
                    is2D ? 'opacity-50 cursor-not-allowed' : 'hover:from-muted/80 hover:to-muted/40'
                  }`}
                >
                  <span className="text-sm">
                    {is2D ? 'N/A' : humanReadable ? 'On' : 'Off'}
                  </span>
                  <ChevronRight className="w-4 h-4 opacity-50" />
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

              {/* Start Code (Code 128 variants only) */}
              {isCode128 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Start Code</Label>
                  <Select 
                    value={startCode} 
                    onValueChange={(v) => setStartCode(v as 'A' | 'B' | 'C')}
                  >
                    <SelectTrigger className="bg-gradient-to-b from-muted to-muted/60 border-border">
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
              )}

              {/* Application Identifier (UCC/EAN-128 variants) */}
              {isUCC && (
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs text-muted-foreground">Application Identifier (AI)</Label>
                  <Select 
                    value={applicationIdentifier} 
                    onValueChange={setApplicationIdentifier}
                  >
                    <SelectTrigger className="bg-gradient-to-b from-muted to-muted/60 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {APPLICATION_IDENTIFIERS.map((ai) => (
                        <SelectItem key={ai.code} value={ai.code}>
                          ({ai.code}) {ai.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Data Matrix Size */}
              {isDataMatrix && (
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs text-muted-foreground">Matrix Size</Label>
                  <Select value={matrixSize} onValueChange={setMatrixSize}>
                    <SelectTrigger className="bg-gradient-to-b from-muted to-muted/60 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATAMATRIX_SIZES.map((size) => (
                        <SelectItem key={size.value} value={size.value}>
                          {size.label} (Num: {size.numericCap}, Alpha: {size.alphaCap})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* QR Code Version */}
              {isQR && (
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs text-muted-foreground">QR Version</Label>
                  <Select value={qrVersion} onValueChange={setQrVersion}>
                    <SelectTrigger className="bg-gradient-to-b from-muted to-muted/60 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QRCODE_SIZES.map((size) => (
                        <SelectItem key={size.value} value={size.value}>
                          {size.label} (Num: {size.numericCap}, Alpha: {size.alphaCap})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* DotCode options */}
              {isDotCode && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">DotCode Scale</Label>
                    <Select value={dotcodeScale} onValueChange={setDotcodeScale}>
                      <SelectTrigger className="bg-gradient-to-b from-muted to-muted/60 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOTCODE_SCALES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">DotCode Mask</Label>
                    <Select value={dotcodeMask} onValueChange={(v) => setDotcodeMask(v as 'auto' | 'manual')}>
                      <SelectTrigger className="bg-gradient-to-b from-muted to-muted/60 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">DotCode Height</Label>
                    <Input
                      type="number"
                      value={dotcodeHeight}
                      onChange={(e) => setDotcodeHeight(parseInt(e.target.value) || 9)}
                      min={5}
                      max={32}
                      className="bg-gradient-to-b from-muted to-muted/60 border-border"
                      inputMode="numeric"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">DotCode Width</Label>
                    <Input
                      type="number"
                      value={dotcodeWidth}
                      onChange={(e) => setDotcodeWidth(parseInt(e.target.value) || 36)}
                      min={10}
                      max={200}
                      className="bg-gradient-to-b from-muted to-muted/60 border-border"
                      inputMode="numeric"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Action buttons row */}
            <div className="grid grid-cols-3 gap-3">
              <button
                className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border border-border rounded-lg p-3 transition-colors"
                onClick={focusDataInput}
                type="button"
              >
                <span className="text-sm font-medium">Keyboard</span>
                <div className="industrial-button p-1.5 rounded">
                  <Keyboard className="w-4 h-4" />
                </div>
              </button>

              <button
                className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border border-border rounded-lg p-3 transition-colors"
                onClick={() => {
                  // Placeholder for future: open AutoCode selector to inject barcode data
                  focusDataInput();
                }}
                type="button"
              >
                <span className="text-sm font-medium">AutoCode</span>
                <div className="industrial-button p-1.5 rounded">
                  <Hash className="w-4 h-4" />
                </div>
              </button>

              <button
                className="flex items-center justify-between bg-gradient-to-b from-muted to-muted/60 hover:from-muted/80 hover:to-muted/40 border border-border rounded-lg p-3 transition-colors"
                onClick={() => {
                  // Placeholder for future: open User Define selector to inject barcode data
                  focusDataInput();
                }}
                type="button"
              >
                <span className="text-sm font-medium">User Define</span>
                <div className="industrial-button p-1.5 rounded">
                  <User className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Sticky bottom add button */}
        <div className="shrink-0 bg-background border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
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
