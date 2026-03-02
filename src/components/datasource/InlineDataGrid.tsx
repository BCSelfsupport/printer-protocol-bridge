import { Database, Eye, EyeOff } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { detectMetrcCsv } from '@/lib/metrcDetector';

interface DataSource {
  id: string;
  name: string;
  columns: string[];
  rowCount?: number;
}

interface InlineDataGridProps {
  source: DataSource | null;
}

export function InlineDataGrid({ source }: InlineDataGridProps) {
  const [expanded, setExpanded] = useState(true);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['data-source-rows-inline', source?.id],
    queryFn: async () => {
      if (!source) return [];
      const { data, error } = await supabase
        .from('data_source_rows')
        .select('*')
        .eq('data_source_id', source.id)
        .order('row_index', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        row_index: r.row_index,
        values: r.values as Record<string, string>,
      }));
    },
    enabled: !!source,
  });

  if (!source) {
    return (
      <div className="flex-1 bg-card rounded-lg p-6 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Database className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Select a data source to preview its data</p>
        </div>
      </div>
    );
  }

  const metrcResult = source.columns.length > 0 ? detectMetrcCsv(source.columns) : null;

  return (
    <div className="flex-1 bg-card rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">{source.name}</span>
          <span className="text-xs text-muted-foreground">
            {source.columns.length} cols · {source.rowCount ?? 0} rows
          </span>
          {metrcResult?.isMetrc && (
            <span className="text-xs bg-green-500/15 text-green-700 px-2 py-0.5 rounded">
              🌿 METRC
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </Button>
      </div>

      {/* Grid */}
      {expanded && (
        <div className="overflow-auto flex-1">
          {source.columns.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <p className="text-sm">No data imported yet.</p>
              <p className="text-xs mt-1">Use the wizard or drag-drop a CSV file to import data.</p>
            </div>
          ) : isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-xs sticky left-0 bg-card">#</TableHead>
                  {source.columns.map((col) => (
                    <TableHead key={col} className="text-xs whitespace-nowrap">
                      {col}
                      {metrcResult?.tagColumn === col && (
                        <span className="ml-1">🏷️</span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-muted-foreground sticky left-0 bg-card">
                      {row.row_index + 1}
                    </TableCell>
                    {source.columns.map((col) => (
                      <TableCell key={col} className="text-xs whitespace-nowrap max-w-[180px] truncate">
                        {row.values[col] || ''}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {rows.length > 0 && (source.rowCount ?? 0) > 50 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Showing first 50 of {source.rowCount} rows
            </p>
          )}
        </div>
      )}
    </div>
  );
}
