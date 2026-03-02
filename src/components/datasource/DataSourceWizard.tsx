import { useState, useRef, useCallback } from 'react';
import {
  Database, Upload, FileSpreadsheet, ChevronRight, ChevronLeft,
  CheckCircle2, Leaf, AlertTriangle,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { detectMetrcCsv, type MetrcDetectionResult } from '@/lib/metrcDetector';

interface DataSourceWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = 'choose' | 'upload' | 'preview' | 'done';

export function DataSourceWizard({ open, onOpenChange }: DataSourceWizardProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>('choose');
  const [sourceType, setSourceType] = useState<'csv' | 'metrc'>('csv');
  const [sourceName, setSourceName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);

  // Parsed CSV data
  const [columns, setColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [metrcResult, setMetrcResult] = useState<MetrcDetectionResult | null>(null);

  const reset = () => {
    setStep('choose');
    setSourceType('csv');
    setSourceName('');
    setColumns([]);
    setPreviewRows([]);
    setAllRows([]);
    setMetrcResult(null);
    setImporting(false);
    setDragOver(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const parseCsv = (csvText: string, fileName: string) => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      toast.error('CSV must have a header row and at least one data row');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const values: Record<string, string> = {};
      headers.forEach((h, i) => { values[h] = vals[i] || ''; });
      return values;
    });

    setColumns(headers);
    setAllRows(rows);
    setPreviewRows(rows.slice(0, 10));

    // Auto-name from file name
    if (!sourceName) {
      const name = fileName.replace(/\.(csv|txt)$/i, '').replace(/[_-]/g, ' ');
      setSourceName(name);
    }

    // METRC detection
    const detection = detectMetrcCsv(headers);
    setMetrcResult(detection);

    if (sourceType === 'csv' && detection.isMetrc && detection.confidence === 'high') {
      toast.info('🌿 METRC format detected! Tag/UID column found.');
    }

    setStep('preview');
  };

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      parseCsv(text, file.name);
    };
    reader.readAsText(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) {
      handleFileSelect(file);
    } else {
      toast.error('Please drop a CSV or TXT file');
    }
  }, [sourceName, sourceType]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleSave = async () => {
    if (!sourceName.trim() || columns.length === 0) return;
    setImporting(true);

    try {
      // Create data source
      const { data: source, error: createErr } = await supabase
        .from('data_sources')
        .insert({ name: sourceName.trim(), columns })
        .select()
        .single();
      if (createErr || !source) throw createErr || new Error('Failed to create');

      // Insert rows in batches
      for (let i = 0; i < allRows.length; i += 100) {
        const batch = allRows.slice(i, i + 100).map((values, idx) => ({
          data_source_id: source.id,
          row_index: i + idx,
          values,
        }));
        const { error } = await supabase.from('data_source_rows').insert(batch);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['data-sources'] });
      queryClient.invalidateQueries({ queryKey: ['data-source-rows'] });
      toast.success(`Imported ${allRows.length} rows with ${columns.length} columns`);
      setStep('done');
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            {step === 'choose' && 'Add Database Connection'}
            {step === 'upload' && 'Select Data File'}
            {step === 'preview' && 'Preview & Confirm'}
            {step === 'done' && 'Import Complete'}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          {(['choose', 'upload', 'preview', 'done'] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s ? 'bg-primary text-primary-foreground' :
                (['choose', 'upload', 'preview', 'done'].indexOf(step) > i)
                  ? 'bg-primary/30 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {i + 1}
              </div>
              {i < 3 && <ChevronRight className="w-3 h-3" />}
            </div>
          ))}
        </div>

        {/* Step 1: Choose type */}
        {step === 'choose' && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              Select the type of data source to connect:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => { setSourceType('csv'); setStep('upload'); }}
                className={`p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50 hover:bg-primary/5 border-border`}
              >
                <FileSpreadsheet className="w-8 h-8 mb-2 text-primary" />
                <p className="font-medium">CSV / Text File</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Import data from comma-separated files, spreadsheet exports, or ERP data
                </p>
              </button>
              <button
                onClick={() => { setSourceType('metrc'); setStep('upload'); }}
                className={`p-4 rounded-lg border-2 text-left transition-all hover:border-green-500/50 hover:bg-green-500/5 border-border`}
              >
                <Leaf className="w-8 h-8 mb-2 text-green-600" />
                <p className="font-medium">METRC Export</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Import METRC tag/UID data for cannabis compliance labeling with DataMatrix codes
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Upload file */}
        {step === 'upload' && (
          <div className="space-y-4 py-4">
            <div>
              <Label>Data Source Name</Label>
              <Input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder={sourceType === 'metrc' ? 'e.g. METRC Tags March 2026' : 'e.g. Product Labels, Address List'}
                className="mt-1"
              />
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-primary bg-primary/10'
                  : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">
                Drop your {sourceType === 'metrc' ? 'METRC CSV export' : 'CSV file'} here
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse — supports .csv and .txt files
              </p>
              {sourceType === 'metrc' && (
                <p className="text-xs text-green-600 mt-3">
                  🌿 METRC exports are auto-detected — Unit Code and Retail ID columns will be mapped automatically
                </p>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && (
          <div className="space-y-4 py-2">
            {/* METRC detection banner */}
            {metrcResult?.isMetrc && (
              <div className={`flex items-start gap-2 p-3 rounded-lg ${
                metrcResult.confidence === 'high'
                  ? 'bg-green-500/10 border border-green-500/30'
                  : 'bg-yellow-500/10 border border-yellow-500/30'
              }`}>
                <Leaf className="w-5 h-5 mt-0.5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    METRC format detected ({metrcResult.confidence} confidence)
                  </p>
                  {metrcResult.tagColumn && (
                    <p className="text-xs text-muted-foreground">
                      Tag/UID column: <strong>{metrcResult.tagColumn}</strong>
                      {metrcResult.retailIdColumn && <> · Retail ID: <strong>{metrcResult.retailIdColumn}</strong></>}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div>
              <Label>Name</Label>
              <Input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Data Preview</Label>
                <span className="text-xs text-muted-foreground">
                  {allRows.length} rows · {columns.length} columns
                  {previewRows.length < allRows.length && ` (showing first ${previewRows.length})`}
                </span>
              </div>
              <div className="overflow-auto max-h-[35vh] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-xs">#</TableHead>
                      {columns.map((col) => (
                        <TableHead key={col} className="text-xs whitespace-nowrap">
                          {col}
                          {metrcResult?.tagColumn === col && (
                            <span className="ml-1 text-green-600">🏷️</span>
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        {columns.map((col) => (
                          <TableCell key={col} className="text-xs whitespace-nowrap max-w-[200px] truncate">
                            {row[col] || ''}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <p className="text-lg font-medium">Import Successful</p>
            <p className="text-sm text-muted-foreground mt-1">
              "{sourceName}" — {allRows.length} rows with {columns.length} columns
            </p>
            {metrcResult?.isMetrc && (
              <p className="text-sm text-green-600 mt-2">
                🌿 METRC data ready for DataMatrix/QR printing
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-4">
              Link this data source to a message to start variable data printing.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'upload' && (
            <Button variant="outline" onClick={() => setStep('choose')} className="mr-auto">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')} className="mr-auto">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={!sourceName.trim() || importing}
              >
                {importing ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Importing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Import {allRows.length} Rows
                  </>
                )}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={handleClose}>
              Done
            </Button>
          )}
          {step !== 'done' && step !== 'preview' && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
