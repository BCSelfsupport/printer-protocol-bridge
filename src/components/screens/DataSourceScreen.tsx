import { useState, useRef, useCallback } from 'react';
import {
  Database, Plus, Upload, Trash2, Play, Square, Pause, Link, FileDown, Wand2, Leaf, Settings2,
} from 'lucide-react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PrintMessage } from '@/types/printer';
import { DataSourceWizard } from '@/components/datasource/DataSourceWizard';
import { InlineDataGrid } from '@/components/datasource/InlineDataGrid';
import { IntegrationConfig } from '@/components/datasource/IntegrationConfig';

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
  field_mappings: Record<string, string>;
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
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Print job state
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [jobSourceId, setJobSourceId] = useState('');
  const [jobMessageName, setJobMessageName] = useState('');
  const [jobFieldMappings, setJobFieldMappings] = useState<Record<string, string>>({});
  const [activeJob, setActiveJob] = useState<PrintJob | null>(null);
  const [jobRunning, setJobRunning] = useState(false);
  const [jobPaused, setJobPaused] = useState(false);
  const [rttStats, setRttStats] = useState<{ last: number; avg: number; min: number; max: number } | null>(null);
  const jobAbortRef = useRef(false);
  const jobPausedRef = useRef(false);
  const rttSamplesRef = useRef<number[]>([]);

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

  // Quick-import: drag-drop CSV directly onto the source list
  const quickImport = useCallback(async (file: File) => {
    const text = await file.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) { toast.error('CSV needs header + data rows'); return; }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const name = file.name.replace(/\.(csv|txt)$/i, '').replace(/[_-]/g, ' ');

    const { data: source, error: createErr } = await supabase
      .from('data_sources')
      .insert({ name, columns: headers })
      .select()
      .single();
    if (createErr || !source) { toast.error('Failed to create'); return; }

    const rows = lines.slice(1).map((line, idx) => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const values: Record<string, string> = {};
      headers.forEach((h, i) => { values[h] = vals[i] || ''; });
      return { data_source_id: source.id, row_index: idx, values };
    });

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      await supabase.from('data_source_rows').insert(batch);
    }

    queryClient.invalidateQueries({ queryKey: ['data-sources'] });
    toast.success(`Quick import: ${rows.length} rows from "${name}"`);
  }, [queryClient]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) {
      quickImport(file);
    } else {
      toast.error('Drop a CSV or TXT file');
    }
  }, [quickImport]);

  const handleQuickFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) quickImport(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Generic sample loader
  const loadSampleCsv = useCallback(async (filePath: string, displayName: string) => {
    try {
      const res = await fetch(filePath);
      if (!res.ok) throw new Error('Could not load sample file');
      const csvText = await res.text();

      const lines = csvText.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

      const { data: source, error: createErr } = await supabase
        .from('data_sources')
        .insert({ name: displayName, columns: headers })
        .select()
        .single();
      if (createErr || !source) throw createErr || new Error('Failed to create');

      const rows = lines.slice(1).map((line, idx) => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const values: Record<string, string> = {};
        headers.forEach((h, i) => { values[h] = vals[i] || ''; });
        return { data_source_id: source.id, row_index: idx, values };
      });
      for (let i = 0; i < rows.length; i += 100) {
        await supabase.from('data_source_rows').insert(rows.slice(i, i + 100));
      }
      queryClient.invalidateQueries({ queryKey: ['data-sources'] });
      toast.success(`Loaded "${displayName}" — ${rows.length} rows`);
    } catch (err: any) {
      toast.error(`Failed to load sample: ${err.message}`);
    }
  }, [queryClient]);

  const handleLoadSample = () => loadSampleCsv('/sample-data/food-products-sample.csv', 'Food Products Sample');
  const handleLoadMetrcSample = () => loadSampleCsv('/sample-data/metrc-tags-sample.csv', 'METRC Tags Sample');

  // Print job creation
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['print-jobs'] });
      setJobDialogOpen(false);
      toast.success('Print job created');
    },
  });

  // Run print job (^MB / ^NM / ^ME protocol)
  const runPrintJob = useCallback(async (job: PrintJob) => {
    if (!isConnected || !connectedPrinterId) {
      toast.error('Not connected to printer');
      return;
    }

    setActiveJob(job);
    setJobRunning(true);
    setJobPaused(false);
    setRttStats(null);
    rttSamplesRef.current = [];
    jobAbortRef.current = false;
    jobPausedRef.current = false;

    try {
      const mbResult = await onSendCommand('^MB');
      if (!mbResult.success) {
        toast.error(`Failed to enter one-to-one mode: ${mbResult.response}`);
        setJobRunning(false);
        return;
      }
      toast.info('Entered One-to-One print mode');

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

      const startIndex = job.current_row_index;
      for (let i = startIndex; i < rows.length; i++) {
        if (jobAbortRef.current) {
          toast.info(`Job stopped at row ${i + 1}/${rows.length}`);
          await supabase
            .from('print_jobs')
            .update({ current_row_index: i, status: 'paused' })
            .eq('id', job.id);
          break;
        }

        while (jobPausedRef.current && !jobAbortRef.current) {
          await new Promise(r => setTimeout(r, 200));
        }
        if (jobAbortRef.current) continue;

        const row = rows[i];
        const rowValues = row.values as Record<string, string>;

        let fieldSubcommands = '';
        Object.entries(job.field_mappings).forEach(([colName, fieldIdx]) => {
          const value = rowValues[colName] || '';
          const idx = parseInt(fieldIdx);
          if (!isNaN(idx)) {
            fieldSubcommands += `^AT${idx};0;0;7;${value}`;
          }
        });

        if (!fieldSubcommands) continue;

        const t0 = performance.now();
        const nmCommand = `^NM 0;0;0;0;${job.message_name}${fieldSubcommands}`;
        const result = await onSendCommand(nmCommand);
        const rtt = Math.round(performance.now() - t0);

        // Update RTT stats
        const samples = rttSamplesRef.current;
        samples.push(rtt);
        // Keep last 50 samples for rolling average
        if (samples.length > 50) samples.shift();
        setRttStats({
          last: rtt,
          avg: Math.round(samples.reduce((a, b) => a + b, 0) / samples.length),
          min: Math.min(...samples),
          max: Math.max(...samples),
        });

        const newIndex = i + 1;
        setActiveJob(prev => prev ? { ...prev, current_row_index: newIndex } : null);

        // Update DB progress every 50 rows or at the end (minimise DB overhead during fast printing)
        if (newIndex % 50 === 0 || newIndex === rows.length) {
          await supabase
            .from('print_jobs')
            .update({
              current_row_index: newIndex,
              status: newIndex >= rows.length ? 'completed' : 'running',
            })
            .eq('id', job.id);
        }

        // If printer returned 'R' (ready), proceed immediately — no delay needed.
        // Otherwise wait a minimal 50ms for the printer to finish processing.
        if (result.response?.trim() !== 'R') {
          await new Promise(r => setTimeout(r, 50));
        }
      }

      await onSendCommand('^ME');
      toast.success('Print job completed');

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
  }, [isConnected, connectedPrinterId, onSendCommand, queryClient]);

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
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="sources">Data Sources</TabsTrigger>
          <TabsTrigger value="jobs">Print Jobs</TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-1">
            <Settings2 className="w-3.5 h-3.5" /> Integrations
          </TabsTrigger>
        </TabsList>

        {/* ── Data Sources Tab ── */}
        <TabsContent value="sources" className="flex-1 flex flex-col gap-3">
          {/* Source list + drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            className={`bg-card rounded-lg p-4 overflow-auto transition-all ${
              dragOver ? 'ring-2 ring-primary ring-offset-2' : ''
            }`}
            style={{ minHeight: 120, maxHeight: '35vh' }}
          >
            {isLoading ? (
              <p className="text-muted-foreground text-center py-8">Loading...</p>
            ) : dataSources.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="font-medium">No Data Sources</p>
                <p className="text-sm mt-1">
                  Use the <strong>Wizard</strong> for guided setup, or <strong>drop a CSV</strong> here for quick import
                </p>
                <div className="flex justify-center gap-3 mt-4">
                  <button
                    onClick={() => setWizardOpen(true)}
                    className="industrial-button text-white px-6 py-3 rounded-lg inline-flex items-center gap-2"
                  >
                    <Wand2 className="w-5 h-5" />
                    <span className="font-medium">Database Wizard</span>
                  </button>
                  <button
                    onClick={handleLoadSample}
                    className="industrial-button-success text-white px-6 py-3 rounded-lg inline-flex items-center gap-2"
                  >
                    <FileDown className="w-5 h-5" />
                    <span className="font-medium">Food Sample</span>
                  </button>
                  <button
                    onClick={handleLoadMetrcSample}
                    className="px-6 py-3 rounded-lg inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white transition-colors"
                  >
                    <Leaf className="w-5 h-5" />
                    <span className="font-medium">METRC Sample</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {dataSources.map((ds) => (
                  <div
                    key={ds.id}
                    onClick={() => setSelectedSource(ds)}
                    className={`flex items-center justify-between py-2.5 px-4 rounded-lg cursor-pointer transition-colors ${
                      selectedSource?.id === ds.id
                        ? 'bg-primary/20 border border-primary/30'
                        : 'hover:bg-muted/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Database className="w-4 h-4 text-primary" />
                      <div>
                        <span className="font-medium text-sm">{ds.name}</span>
                        <p className="text-xs text-muted-foreground">
                          {ds.columns.length} columns · {ds.rowCount ?? 0} rows
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {/* Drop hint */}
                <p className="text-xs text-center text-muted-foreground pt-2">
                  Drop a CSV file here for quick import
                </p>
              </div>
            )}
          </div>

          {/* Inline data preview grid */}
          <InlineDataGrid source={selectedSource} />

          {/* Action buttons */}
          <div className="overflow-x-auto -mx-4 px-4 pb-2">
            <div className="flex gap-3 justify-center min-w-max">
              <button
                onClick={() => setWizardOpen(true)}
                className="industrial-button text-white px-6 py-3 rounded-lg flex flex-col items-center min-w-[100px]"
              >
                <Wand2 className="w-7 h-7 mb-1" />
                <span className="text-xs font-medium">Wizard</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="industrial-button text-white px-6 py-3 rounded-lg flex flex-col items-center min-w-[100px]"
              >
                <Upload className="w-7 h-7 mb-1" />
                <span className="text-xs font-medium">Quick Import</span>
              </button>

              <button
                onClick={handleCreateJob}
                disabled={!selectedSource || (selectedSource.rowCount ?? 0) === 0}
                className="industrial-button-success text-white px-6 py-3 rounded-lg flex flex-col items-center min-w-[100px] disabled:opacity-50"
              >
                <Link className="w-7 h-7 mb-1" />
                <span className="text-xs font-medium">Print Job</span>
              </button>

              <button
                onClick={() => selectedSource && setDeleteConfirmOpen(true)}
                disabled={!selectedSource}
                className="industrial-button-danger text-white px-6 py-3 rounded-lg flex flex-col items-center min-w-[100px] disabled:opacity-50"
              >
                <Trash2 className="w-7 h-7 mb-1" />
                <span className="text-xs font-medium">Delete</span>
              </button>
            </div>
          </div>
        </TabsContent>

        {/* ── Print Jobs Tab ── */}
        <TabsContent value="jobs" className="flex-1 flex flex-col">
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
              {/* TCP Round-Trip Time display */}
              {rttStats && (
                <div className="flex items-center gap-4 mb-3 text-xs font-mono bg-background/50 rounded px-3 py-2 border border-border">
                  <span className="text-muted-foreground">TCP RTT:</span>
                  <span className={rttStats.last < 50 ? 'text-green-500' : rttStats.last < 150 ? 'text-yellow-500' : 'text-destructive'}>
                    {rttStats.last}ms
                  </span>
                  <span className="text-muted-foreground">avg: {rttStats.avg}ms</span>
                  <span className="text-muted-foreground">min: {rttStats.min}ms</span>
                  <span className="text-muted-foreground">max: {rttStats.max}ms</span>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={handlePauseResume}>
                  {jobPaused ? <Play className="w-4 h-4 mr-1" /> : <Pause className="w-4 h-4 mr-1" />}
                  {jobPaused ? 'Resume' : 'Pause'}
                </Button>
                <Button size="sm" variant="destructive" onClick={handleStopJob}>
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

        {/* ── Integrations Tab ── */}
        <TabsContent value="integrations" className="flex-1 overflow-y-auto">
          <IntegrationConfig projectId={import.meta.env.VITE_SUPABASE_PROJECT_ID || ''} />
        </TabsContent>
      </Tabs>

      {/* Hidden file input for quick import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={handleQuickFileSelect}
      />

      {/* Database Setup Wizard */}
      <DataSourceWizard open={wizardOpen} onOpenChange={setWizardOpen} />

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
