import { useState, useEffect, useCallback } from 'react';
import { Database, Link, Unlink, Check, ChevronLeft, ChevronRight, Eye, Sparkles } from 'lucide-react';
import { detectMetrcCsv } from '@/lib/metrcDetector';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface DataSource {
  id: string;
  name: string;
  columns: string[];
}

interface DataLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageName: string;
  fieldCount: number;
  printerId: number | null;
  isConnected: boolean;
  /** Called after linking with field→value pairs from the first data row */
  onLink?: (fieldValues: Record<number, string>) => void;
}

export function DataLinkDialog({
  open,
  onOpenChange,
  messageName,
  fieldCount,
  printerId,
  isConnected,
  onLink,
}: DataLinkDialogProps) {
  const queryClient = useQueryClient();
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [mappings, setMappings] = useState<Record<string, string[]>>({}); // column -> field indices array
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);

  // Fetch data sources
  const { data: dataSources = [] } = useQuery({
    queryKey: ['data-sources-for-link'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_sources')
        .select('id, name, columns')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as DataSource[];
    },
    enabled: open,
  });

  // Check for existing print job for this message
  const { data: existingJob } = useQuery({
    queryKey: ['print-job-for-message', messageName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('print_jobs')
        .select('*')
        .eq('message_name', messageName)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Pre-fill from existing job
  useEffect(() => {
    if (existingJob) {
      setSelectedSourceId(existingJob.data_source_id);
      // Migrate old single-value mappings to array format
      const raw = (existingJob.field_mappings as Record<string, string | string[]>) || {};
      const migrated: Record<string, string[]> = {};
      Object.entries(raw).forEach(([col, val]) => {
        migrated[col] = Array.isArray(val) ? val : [val];
      });
      setMappings(migrated);
    } else {
      setSelectedSourceId('');
      setMappings({});
    }
  }, [existingJob]);

  const selectedSource = dataSources.find(s => s.id === selectedSourceId);

  // Auto-apply METRC suggested mappings when a source is selected and no mappings exist yet
  useEffect(() => {
    if (!selectedSource || existingJob) return;
    if (Object.keys(mappings).length > 0) return;
    
    const metrc = detectMetrcCsv(selectedSource.columns);
    if (metrc.isMetrc && Object.keys(metrc.suggestedMappings).length > 0) {
      const autoMappings: Record<string, string[]> = {};
      Object.entries(metrc.suggestedMappings).forEach(([col, info]) => {
        if (info.fieldIndex <= fieldCount) {
          autoMappings[col] = [String(info.fieldIndex)];
        }
      });
      if (Object.keys(autoMappings).length > 0) {
        setMappings(autoMappings);
        toast.info('🌿 METRC detected — auto-mapped columns to fields');
      }
    }
  }, [selectedSource?.id]);

  const handleToggleMapping = (column: string, fieldIndex: string) => {
    setMappings(prev => {
      const current = prev[column] || [];
      if (current.includes(fieldIndex)) {
        // Remove this field
        const updated = current.filter(f => f !== fieldIndex);
        if (updated.length === 0) {
          const { [column]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [column]: updated };
      }
      // Add this field
      return { ...prev, [column]: [...current, fieldIndex] };
    });
  };

  // Get row count for the selected source
  const { data: rowCount } = useQuery({
    queryKey: ['data-source-row-count', selectedSourceId],
    queryFn: async () => {
      const { count } = await supabase
        .from('data_source_rows')
        .select('*', { count: 'exact', head: true })
        .eq('data_source_id', selectedSourceId);
      return count || 0;
    },
    enabled: !!selectedSourceId,
  });

  // Save/update print job
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSourceId || !printerId) throw new Error('Missing data source or printer');

      const mappedCount = Object.keys(mappings).length;
      if (mappedCount === 0) throw new Error('Map at least one column to a field');

      const jobData = {
        data_source_id: selectedSourceId,
        message_name: messageName,
        printer_id: printerId,
        field_mappings: mappings,
        total_rows: rowCount || 0,
        status: 'ready' as const,
      };

      if (existingJob) {
        const { error } = await supabase
          .from('print_jobs')
          .update(jobData)
          .eq('id', existingJob.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('print_jobs')
          .insert({ ...jobData, current_row_index: 0 });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['print-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['print-job-for-message'] });

      // Fetch first row and pass mapped values back to the editor
      if (onLink && selectedSourceId) {
        try {
          const { data: firstRow } = await supabase
            .from('data_source_rows')
            .select('values')
            .eq('data_source_id', selectedSourceId)
            .order('row_index', { ascending: true })
            .limit(1)
            .single();

           if (firstRow) {
             const rowValues = firstRow.values as Record<string, string>;
             const fieldValues: Record<number, string> = {};
             Object.entries(mappings).forEach(([colName, fieldIndices]) => {
               for (const fi of fieldIndices) {
                 const idx = parseInt(fi);
                 if (!isNaN(idx) && rowValues[colName] != null) {
                   fieldValues[idx] = String(rowValues[colName]);
                 }
               }
             });
             onLink(fieldValues);
           }
        } catch (e) {
          console.warn('Could not fetch first row for preview:', e);
        }
      }

      toast.success('Data source linked to message');
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Unlink
  const unlinkMutation = useMutation({
    mutationFn: async () => {
      if (!existingJob) return;
      const { error } = await supabase
        .from('print_jobs')
        .delete()
        .eq('id', existingJob.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['print-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['print-job-for-message'] });
      setSelectedSourceId('');
      setMappings({});
      toast.success('Data source unlinked');
    },
  });

  // Preview: push row values to the editor via onLink
  const pushRowToEditor = useCallback((row: Record<string, string>) => {
    if (!onLink) return;
    const fieldValues: Record<number, string> = {};
    Object.entries(mappings).forEach(([colName, fieldIndices]) => {
      for (const fi of fieldIndices) {
        const idx = parseInt(fi);
        if (!isNaN(idx) && row[colName] != null) {
          fieldValues[idx] = String(row[colName]);
        }
      }
    });
    onLink(fieldValues);
  }, [mappings, onLink]);

  const startPreview = useCallback(async () => {
    if (!selectedSourceId) return;
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase
        .from('data_source_rows')
        .select('values')
        .eq('data_source_id', selectedSourceId)
        .order('row_index', { ascending: true })
        .limit(1000);
      if (error) throw error;
      const rows = (data || []).map(r => r.values as Record<string, string>);
      setPreviewRows(rows);
      setPreviewIndex(0);
      setPreviewActive(true);
      if (rows.length > 0) pushRowToEditor(rows[0]);
    } catch (e) {
      toast.error('Failed to load preview rows');
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedSourceId, pushRowToEditor]);

  const goToRow = useCallback((idx: number) => {
    if (idx < 0 || idx >= previewRows.length) return;
    setPreviewIndex(idx);
    pushRowToEditor(previewRows[idx]);
  }, [previewRows, pushRowToEditor]);

  const fieldOptions = Array.from({ length: fieldCount }, (_, i) => ({
    value: String(i + 1),
    label: `F${i + 1}`,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Link Data Source
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Data source selector */}
          <div>
            <Label>Data Source</Label>
            {dataSources.length === 0 ? (
              <div className="space-y-2 mt-1">
                <p className="text-sm text-muted-foreground">
                  No data sources found. Go to the <strong>Data</strong> screen to import a CSV first.
                </p>
                <p className="text-xs text-muted-foreground">
                  💡 For METRC tags, import your METRC CSV export — the system will auto-detect the tag columns.
                </p>
              </div>
            ) : (
              <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose a data source..." />
                </SelectTrigger>
                <SelectContent>
                  {dataSources.map(ds => (
                    <SelectItem key={ds.id} value={ds.id}>
                      {ds.name} ({ds.columns.length} columns)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Column → Field mapping */}
          {selectedSource && selectedSource.columns.length > 0 && (
            <div>
              <Label className="mb-2 block">Map Columns → Fields</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Assign each CSV column to a field number (F1, F2, etc.) shown on the canvas.
              </p>
              <div className="space-y-3">
              {(() => {
                const metrc = detectMetrcCsv(selectedSource.columns);
                return selectedSource.columns.map(col => {
                  const selected = mappings[col] || [];
                  const isSuggested = metrc.isMetrc && col in metrc.suggestedMappings;
                  return (
                    <div key={col} className="flex items-start gap-3">
                      <span className={`text-sm font-medium min-w-[120px] truncate mt-1 ${isSuggested ? 'text-green-600' : ''}`}>
                        {col}
                        {isSuggested && <Sparkles className="w-3 h-3 inline ml-1 -mt-0.5" />}
                      </span>
                      <span className="text-muted-foreground mt-1">→</span>
                      <div className="flex flex-wrap gap-1.5">
                        {fieldOptions.map(opt => {
                          const isActive = selected.includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              onClick={() => handleToggleMapping(col, opt.value)}
                              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                                isActive
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                              }`}
                            >
                              {isActive && <Check className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
              </div>
              {rowCount != null && (
                <p className="text-xs text-muted-foreground mt-2">
                  {rowCount} rows will be printed using this mapping.
                </p>
              )}
            </div>
          )}

          {/* Preview / Test stepper */}
          {selectedSource && Object.keys(mappings).length > 0 && (
            <div className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Eye className="w-4 h-4" /> Preview Data
                </Label>
                {!previewActive ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={startPreview}
                    disabled={previewLoading}
                  >
                    {previewLoading ? 'Loading…' : 'Start Preview'}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Row {previewIndex + 1} of {previewRows.length}
                  </span>
                )}
              </div>

              {previewActive && previewRows.length > 0 && (
                <>
                  {/* Current row values */}
                  <div className="bg-muted rounded p-2 space-y-1 max-h-[120px] overflow-y-auto">
                    {Object.entries(mappings).map(([colName, fieldIndices]) => (
                      <div key={colName} className="flex items-baseline gap-2 text-xs">
                        <span className="text-muted-foreground min-w-[80px] truncate">{colName}:</span>
                        <span className="font-mono font-medium truncate">
                          {previewRows[previewIndex]?.[colName] || '—'}
                        </span>
                        <span className="text-muted-foreground ml-auto shrink-0">
                          → {fieldIndices.map(f => `F${f}`).join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Stepper controls */}
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => goToRow(0)}
                      disabled={previewIndex === 0}
                      className="px-2"
                    >
                      ⏮
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => goToRow(previewIndex - 1)}
                      disabled={previewIndex === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm font-medium tabular-nums min-w-[60px] text-center">
                      {previewIndex + 1} / {previewRows.length}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => goToRow(previewIndex + 1)}
                      disabled={previewIndex >= previewRows.length - 1}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => goToRow(previewRows.length - 1)}
                      disabled={previewIndex >= previewRows.length - 1}
                      className="px-2"
                    >
                      ⏭
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Step through rows to preview on the canvas behind this dialog
                  </p>
                </>
              )}
            </div>
          )}

          {!isConnected && (
            <p className="text-xs text-destructive">
              Connect to a printer before linking data.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {existingJob && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => unlinkMutation.mutate()}
              className="mr-auto"
            >
              <Unlink className="w-4 h-4 mr-1" />
              Unlink
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!selectedSourceId || Object.keys(mappings).length === 0 || !printerId}
          >
            <Link className="w-4 h-4 mr-1" />
            {existingJob ? 'Update Link' : 'Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
