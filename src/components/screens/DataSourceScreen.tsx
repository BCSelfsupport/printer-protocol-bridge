import { useState, useRef } from 'react';
import { Database, Plus, Upload, Trash2, Play, Eye } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface DataSource {
  id: string;
  name: string;
  columns: string[];
  created_at: string;
  rowCount?: number;
}

interface DataSourceRow {
  id: string;
  row_index: number;
  values: Record<string, string>;
}

interface DataSourceScreenProps {
  onHome: () => void;
}

export function DataSourceScreen({ onHome }: DataSourceScreenProps) {
  const queryClient = useQueryClient();
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [viewingSource, setViewingSource] = useState<DataSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importingForSource, setImportingForSource] = useState<DataSource | null>(null);

  // Fetch data sources
  const { data: dataSources = [], isLoading } = useQuery({
    queryKey: ['data-sources'],
    queryFn: async () => {
      const { data: sources, error } = await supabase
        .from('data_sources')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Get row counts
      const withCounts: DataSource[] = await Promise.all(
        (sources || []).map(async (s: any) => {
          const { count } = await supabase
            .from('data_source_rows')
            .select('*', { count: 'exact', head: true })
            .eq('data_source_id', s.id);
          return { ...s, rowCount: count || 0 };
        })
      );
      return withCounts;
    },
  });

  // Fetch rows for viewing
  const { data: viewRows = [] } = useQuery({
    queryKey: ['data-source-rows', viewingSource?.id],
    queryFn: async () => {
      if (!viewingSource) return [];
      const { data, error } = await supabase
        .from('data_source_rows')
        .select('*')
        .eq('data_source_id', viewingSource.id)
        .order('row_index', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        row_index: r.row_index,
        values: r.values as Record<string, string>,
      }));
    },
    enabled: !!viewingSource,
  });

  // Create data source
  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('data_sources')
        .insert({ name, columns: [] })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources'] });
      toast.success('Data source created');
    },
  });

  // Delete data source
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('data_sources').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources'] });
      setSelectedSource(null);
      toast.success('Data source deleted');
    },
  });

  // Import CSV rows
  const importMutation = useMutation({
    mutationFn: async ({ sourceId, csvText }: { sourceId: string; csvText: string }) => {
      const lines = csvText.trim().split('\n');
      if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

      // Update columns on the data source
      await supabase
        .from('data_sources')
        .update({ columns: headers })
        .eq('id', sourceId);

      // Clear existing rows
      await supabase.from('data_source_rows').delete().eq('data_source_id', sourceId);

      // Parse and insert rows in batches
      const rows = lines.slice(1).map((line, idx) => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const values: Record<string, string> = {};
        headers.forEach((h, i) => {
          values[h] = vals[i] || '';
        });
        return {
          data_source_id: sourceId,
          row_index: idx,
          values,
        };
      });

      // Insert in batches of 100
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase.from('data_source_rows').insert(batch);
        if (error) throw error;
      }

      return { rowCount: rows.length, columns: headers };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['data-sources'] });
      queryClient.invalidateQueries({ queryKey: ['data-source-rows'] });
      toast.success(`Imported ${result.rowCount} rows with ${result.columns.length} columns`);
    },
    onError: (err: Error) => {
      toast.error(`Import failed: ${err.message}`);
    },
  });

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate(newName.trim());
    setNewDialogOpen(false);
    setNewName('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !importingForSource) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      importMutation.mutate({ sourceId: importingForSource.id, csvText: text });
      setImportingForSource(null);
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex-1 p-4 flex flex-col">
      <SubPageHeader title="Data Sources" onHome={onHome} />

      {/* Data source list */}
      <div className="flex-1 bg-card rounded-lg p-4 mb-4 overflow-auto">
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : dataSources.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No Data Sources</p>
            <p className="text-sm mt-1">Create a data source and import CSV data for variable printing</p>
          </div>
        ) : (
          <div className="space-y-2">
            {dataSources.map((ds) => (
              <div
                key={ds.id}
                onClick={() => setSelectedSource(ds)}
                className={`flex items-center justify-between py-3 px-4 rounded-lg cursor-pointer transition-colors ${
                  selectedSource?.id === ds.id
                    ? 'bg-primary/20 border border-primary/30'
                    : 'hover:bg-muted/50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-primary" />
                  <div>
                    <span className="font-medium">{ds.name}</span>
                    <p className="text-xs text-muted-foreground">
                      {ds.columns.length} columns · {ds.rowCount ?? 0} rows
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="overflow-x-auto -mx-4 px-4 pb-2">
        <div className="flex gap-4 justify-center min-w-max">
          <button
            onClick={() => {
              setNewName('');
              setNewDialogOpen(true);
            }}
            className="industrial-button text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px]"
          >
            <Plus className="w-8 h-8 mb-1" />
            <span className="font-medium">New</span>
          </button>

          <button
            onClick={() => {
              if (!selectedSource) return;
              setImportingForSource(selectedSource);
              fileInputRef.current?.click();
            }}
            disabled={!selectedSource}
            className="industrial-button text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px] disabled:opacity-50"
          >
            <Upload className="w-8 h-8 mb-1" />
            <span className="font-medium">Import CSV</span>
          </button>

          <button
            onClick={() => selectedSource && setViewingSource(selectedSource)}
            disabled={!selectedSource}
            className="industrial-button-gray text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px] disabled:opacity-50"
          >
            <Eye className="w-8 h-8 mb-1" />
            <span className="font-medium">View</span>
          </button>

          <button
            onClick={() => selectedSource && setDeleteConfirmOpen(true)}
            disabled={!selectedSource}
            className="industrial-button text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px] disabled:opacity-50"
          >
            <Trash2 className="w-8 h-8 mb-1" />
            <span className="font-medium">Delete</span>
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* New Data Source Dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Data Source</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="dsName">Name</Label>
            <Input
              id="dsName"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Address Labels, Batch Codes"
              className="mt-2"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Data Dialog */}
      <Dialog open={!!viewingSource} onOpenChange={() => setViewingSource(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{viewingSource?.name} — Data Preview</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh]">
            {viewingSource && viewingSource.columns.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {viewingSource.columns.map((col) => (
                      <TableHead key={col}>{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground">{row.row_index + 1}</TableCell>
                      {viewingSource.columns.map((col) => (
                        <TableCell key={col}>{row.values[col] || ''}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                No data imported yet. Use "Import CSV" to add data.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Data Source</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedSource?.name}"? All associated data rows will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedSource) deleteMutation.mutate(selectedSource.id);
                setDeleteConfirmOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
