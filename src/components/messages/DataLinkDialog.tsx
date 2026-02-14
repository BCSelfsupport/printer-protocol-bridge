import { useState, useEffect } from 'react';
import { Database, Link, Unlink } from 'lucide-react';
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
  const [mappings, setMappings] = useState<Record<string, string>>({}); // column -> field index

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
      setMappings((existingJob.field_mappings as Record<string, string>) || {});
    } else {
      setSelectedSourceId('');
      setMappings({});
    }
  }, [existingJob]);

  const selectedSource = dataSources.find(s => s.id === selectedSourceId);

  const handleMappingChange = (column: string, fieldIndex: string) => {
    setMappings(prev => {
      if (fieldIndex === 'none') {
        const updated = { ...prev };
        delete updated[column];
        return updated;
      }
      return { ...prev, [column]: fieldIndex };
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
            Object.entries(mappings).forEach(([colName, fieldIdx]) => {
              const idx = parseInt(fieldIdx);
              if (!isNaN(idx) && rowValues[colName] != null) {
                fieldValues[idx] = String(rowValues[colName]);
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
              <p className="text-sm text-muted-foreground mt-1">
                No data sources found. Go to the Data screen to import a CSV first.
              </p>
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
              <div className="space-y-2">
                {selectedSource.columns.map(col => (
                  <div key={col} className="flex items-center gap-3">
                    <span className="text-sm font-medium min-w-[120px] truncate">{col}</span>
                    <span className="text-muted-foreground">→</span>
                    <Select
                      value={mappings[col] || 'none'}
                      onValueChange={(v) => handleMappingChange(col, v)}
                    >
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {fieldOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {rowCount != null && (
                <p className="text-xs text-muted-foreground mt-2">
                  {rowCount} rows will be printed using this mapping.
                </p>
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
