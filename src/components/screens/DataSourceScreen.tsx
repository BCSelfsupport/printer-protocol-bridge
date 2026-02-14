import { useState, useRef, useCallback } from 'react';
import { Database, Plus, Upload, Trash2, Eye, Play, Square, Pause, Link } from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { PrintMessage } from '@/types/printer';

interface DataSource {
  id: string;
  name: string;
  columns: string[];
  created_at: string;
  rowCount?: number;
}

interface PrintJob {
  id: string;
  data_source_id: string;
  message_name: string;
  printer_id: number;
  field_mappings: Record<string, string>; // column -> field index
  current_row_index: number;
  total_rows: number;
  status: string;
  created_at: string;
}

interface DataSourceScreenProps {
  onHome: () => void;
  messages: PrintMessage[];
  isConnected: boolean;
  connectedPrinterId: number | null;
  onSendCommand: (command: string) => Promise<{ success: boolean; response: string }>;
}

export function DataSourceScreen({ 
  onHome, 
  messages, 
  isConnected, 
  connectedPrinterId,
  onSendCommand,
}: DataSourceScreenProps) {
  const queryClient = useQueryClient();
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [viewingSource, setViewingSource] = useState<DataSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importingForSource, setImportingForSource] = useState<DataSource | null>(null);

  // Print job state
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [jobSourceId, setJobSourceId] = useState('');
  const [jobMessageName, setJobMessageName] = useState('');
  const [jobFieldMappings, setJobFieldMappings] = useState<Record<string, string>>({});
  const [activeJob, setActiveJob] = useState<PrintJob | null>(null);
  const [jobRunning, setJobRunning] = useState(false);
  const [jobPaused, setJobPaused] = useState(false);
  const jobAbortRef = useRef(false);
  const jobPausedRef = useRef(false);

  // Fetch data sources
  const { data: dataSources = [], isLoading } = useQuery({
    queryKey: ['data-sources'],
    queryFn: async () => {
      const { data: sources, error } = await supabase
        .from('data_sources')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

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

  // Fetch print jobs
  const { data: printJobs = [] } = useQuery({
    queryKey: ['print-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('print_jobs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((j: any) => ({
        ...j,
        field_mappings: j.field_mappings as Record<string, string>,
      })) as PrintJob[];
    },
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

      await supabase
        .from('data_sources')
        .update({ columns: headers })
        .eq('id', sourceId);

      await supabase.from('data_source_rows').delete().eq('data_source_id', sourceId);

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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Open print job creation dialog
  const handleCreateJob = () => {
    if (!selectedSource || selectedSource.columns.length === 0) {
      toast.error('Select a data source with imported data first');
      return;
    }
    setJobSourceId(selectedSource.id);
    setJobMessageName('');
    setJobFieldMappings({});
    setJobDialogOpen(true);
  };

  // Save print job to database
  const createJobMutation = useMutation({
    mutationFn: async () => {
      if (!connectedPrinterId || !jobMessageName) throw new Error('Missing printer or message');
      const source = dataSources.find(s => s.id === jobSourceId);
      if (!source) throw new Error('Data source not found');
      
      const { data, error } = await supabase
        .from('print_jobs')
        .insert({
          data_source_id: jobSourceId,
          message_name: jobMessageName,
          printer_id: connectedPrinterId,
          field_mappings: jobFieldMappings,
          current_row_index: 0,
          total_rows: source.rowCount || 0,
          status: 'ready',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['print-jobs'] });
      setJobDialogOpen(false);
      toast.success('Print job created');
    },
  });

  // Run a print job using ^MB / ^NM / ^ME protocol
  const runPrintJob = useCallback(async (job: PrintJob) => {
    if (!isConnected || !connectedPrinterId) {
      toast.error('Not connected to printer');
      return;
    }

    setActiveJob(job);
    setJobRunning(true);
    setJobPaused(false);
    jobAbortRef.current = false;
    jobPausedRef.current = false;

    try {
      // Step 1: Enter one-to-one mode
      const mbResult = await onSendCommand('^MB');
      if (!mbResult.success) {
        toast.error(`Failed to enter one-to-one mode: ${mbResult.response}`);
        setJobRunning(false);
        return;
      }
      toast.info('Entered One-to-One print mode');

      // Step 2: Fetch all rows for this data source
      const { data: rows, error } = await supabase
        .from('data_source_rows')
        .select('*')
        .eq('data_source_id', job.data_source_id)
        .order('row_index', { ascending: true });
      
      if (error || !rows) {
        toast.error('Failed to fetch data rows');
        await onSendCommand('^ME');
        setJobRunning(false);
        return;
      }

      // Get the data source for columns
      const source = dataSources.find(s => s.id === job.data_source_id);
      if (!source) {
        await onSendCommand('^ME');
        setJobRunning(false);
        return;
      }

      // Step 3: Send each row as a ^NM command
      const startIndex = job.current_row_index;
      for (let i = startIndex; i < rows.length; i++) {
        // Check abort
        if (jobAbortRef.current) {
          toast.info(`Job stopped at row ${i + 1}/${rows.length}`);
          // Save progress
          await supabase
            .from('print_jobs')
            .update({ current_row_index: i, status: 'paused' })
            .eq('id', job.id);
          break;
        }

        // Check pause
        while (jobPausedRef.current && !jobAbortRef.current) {
          await new Promise(r => setTimeout(r, 200));
        }
        if (jobAbortRef.current) continue;

        const row = rows[i];
        const rowValues = row.values as Record<string, string>;

        // Build field subcommands from mappings
        // field_mappings: { "columnName": "1", "anotherCol": "2" } where value = field index
        let fieldSubcommands = '';
        Object.entries(job.field_mappings).forEach(([colName, fieldIdx]) => {
          const value = rowValues[colName] || '';
          const idx = parseInt(fieldIdx);
          if (!isNaN(idx)) {
            // Simple text field: ^AT fieldIdx; x; y; font; data
            // In one-to-one mode, we just need the field data update
            fieldSubcommands += `^AT${idx};0;0;7;${value}`;
          }
        });

        if (!fieldSubcommands) continue;

        // Send ^NM with the variable data for this row
        const nmCommand = `^NM 0;0;0;0;${job.message_name}${fieldSubcommands}`;
        const result = await onSendCommand(nmCommand);
        
        // Update progress
        const newIndex = i + 1;
        setActiveJob(prev => prev ? { ...prev, current_row_index: newIndex } : null);
        
        // Update DB progress periodically (every 10 rows)
        if (newIndex % 10 === 0 || newIndex === rows.length) {
          await supabase
            .from('print_jobs')
            .update({ 
              current_row_index: newIndex,
              status: newIndex >= rows.length ? 'completed' : 'running',
            })
            .eq('id', job.id);
        }

        // The printer should respond with 'R' when ready for next
        // Small delay to allow the printer to process
        if (result.response?.trim() !== 'R') {
          // Wait a bit for the printer to be ready
          await new Promise(r => setTimeout(r, 100));
        }
      }

      // Step 4: Exit one-to-one mode
      await onSendCommand('^ME');
      toast.success('Print job completed');

      // Mark as completed
      await supabase
        .from('print_jobs')
        .update({ status: 'completed', current_row_index: rows.length })
        .eq('id', job.id);

    } catch (err: any) {
      toast.error(`Print job error: ${err.message}`);
      await onSendCommand('^ME');
    } finally {
      setJobRunning(false);
      setActiveJob(null);
      queryClient.invalidateQueries({ queryKey: ['print-jobs'] });
    }
  }, [isConnected, connectedPrinterId, onSendCommand, dataSources, queryClient]);

  const handlePauseResume = () => {
    if (jobPaused) {
      jobPausedRef.current = false;
      setJobPaused(false);
      toast.info('Job resumed');
    } else {
      jobPausedRef.current = true;
      setJobPaused(true);
      toast.info('Job paused');
    }
  };

  const handleStopJob = () => {
    jobAbortRef.current = true;
    jobPausedRef.current = false;
  };

  const selectedSourceForJob = dataSources.find(s => s.id === jobSourceId);

  return (
    <div className="flex-1 p-4 flex flex-col">
      <SubPageHeader title="Data Sources" onHome={onHome} />

      <Tabs defaultValue="sources" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="sources">Data Sources</TabsTrigger>
          <TabsTrigger value="jobs">Print Jobs</TabsTrigger>
        </TabsList>

        {/* Data Sources Tab */}
        <TabsContent value="sources" className="flex-1 flex flex-col">
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
                onClick={handleCreateJob}
                disabled={!selectedSource || (selectedSource.rowCount ?? 0) === 0}
                className="industrial-button-success text-white px-8 py-4 rounded-lg flex flex-col items-center min-w-[120px] disabled:opacity-50"
              >
                <Link className="w-8 h-8 mb-1" />
                <span className="font-medium">Print Job</span>
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
        </TabsContent>

        {/* Print Jobs Tab */}
        <TabsContent value="jobs" className="flex-1 flex flex-col">
          {/* Active Job Runner */}
          {activeJob && jobRunning && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">
                  Running: {activeJob.message_name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {activeJob.current_row_index} / {activeJob.total_rows}
                </span>
              </div>
              <Progress 
                value={activeJob.total_rows > 0 
                  ? (activeJob.current_row_index / activeJob.total_rows) * 100 
                  : 0
                } 
                className="mb-3"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePauseResume}
                >
                  {jobPaused ? <Play className="w-4 h-4 mr-1" /> : <Pause className="w-4 h-4 mr-1" />}
                  {jobPaused ? 'Resume' : 'Pause'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleStopJob}
                >
                  <Square className="w-4 h-4 mr-1" />
                  Stop
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 bg-card rounded-lg p-4 overflow-auto">
            {printJobs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Play className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-lg font-medium">No Print Jobs</p>
                <p className="text-sm mt-1">Select a data source and create a print job to start variable printing</p>
              </div>
            ) : (
              <div className="space-y-2">
                {printJobs.map((job) => {
                  const source = dataSources.find(s => s.id === job.data_source_id);
                  return (
                    <div
                      key={job.id}
                      className="flex items-center justify-between py-3 px-4 rounded-lg border border-border"
                    >
                      <div>
                        <span className="font-medium">{job.message_name}</span>
                        <p className="text-xs text-muted-foreground">
                          {source?.name ?? 'Unknown source'} · {job.current_row_index}/{job.total_rows} rows
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          job.status === 'completed' 
                            ? 'bg-green-500/20 text-green-700' 
                            : job.status === 'running'
                            ? 'bg-blue-500/20 text-blue-700'
                            : job.status === 'paused'
                            ? 'bg-yellow-500/20 text-yellow-700'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {job.status}
                        </span>
                        {(job.status === 'ready' || job.status === 'paused') && !jobRunning && (
                          <Button
                            size="sm"
                            onClick={() => runPrintJob(job)}
                            disabled={!isConnected}
                          >
                            <Play className="w-4 h-4 mr-1" />
                            {job.status === 'paused' ? 'Resume' : 'Run'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

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

      {/* Create Print Job Dialog */}
      <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Print Job</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label>Data Source</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedSourceForJob?.name ?? 'Unknown'} ({selectedSourceForJob?.rowCount ?? 0} rows)
              </p>
            </div>

            <div>
              <Label>Target Message</Label>
              <Select value={jobMessageName} onValueChange={setJobMessageName}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select a message" />
                </SelectTrigger>
                <SelectContent>
                  {messages.map((msg) => (
                    <SelectItem key={msg.id} value={msg.name}>
                      {msg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {jobMessageName && selectedSourceForJob && selectedSourceForJob.columns.length > 0 && (
              <div>
                <Label className="mb-2 block">Field Mapping</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  Map each CSV column to a field number in the message (1-based)
                </p>
                <div className="space-y-2">
                  {selectedSourceForJob.columns.map((col) => (
                    <div key={col} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-32 truncate">{col}</span>
                      <span className="text-muted-foreground">→</span>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        placeholder="Field #"
                        value={jobFieldMappings[col] ?? ''}
                        onChange={(e) => {
                          setJobFieldMappings(prev => ({
                            ...prev,
                            [col]: e.target.value,
                          }));
                        }}
                        className="w-24"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isConnected && (
              <p className="text-sm text-destructive">
                ⚠ Connect to a printer before creating a print job
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJobDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createJobMutation.mutate()}
              disabled={
                !jobMessageName || 
                !isConnected ||
                Object.values(jobFieldMappings).filter(v => v).length === 0
              }
            >
              Create Job
            </Button>
          </DialogFooter>
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
