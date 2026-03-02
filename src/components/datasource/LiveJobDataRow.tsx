import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DataSource {
  id: string;
  name: string;
  columns: string[];
}

interface LiveJobDataRowProps {
  dataSourceId: string;
  currentRowIndex: number;
  dataSources: DataSource[];
}

export function LiveJobDataRow({ dataSourceId, currentRowIndex, dataSources }: LiveJobDataRowProps) {
  const activeRowRef = useRef<HTMLTableRowElement>(null);
  const source = dataSources.find(s => s.id === dataSourceId);

  const { data: rows = [] } = useQuery({
    queryKey: ['data-source-rows', dataSourceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_source_rows')
        .select('*')
        .eq('data_source_id', dataSourceId)
        .order('row_index', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!dataSourceId,
  });

  // Auto-scroll to active row
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentRowIndex]);

  if (!source || rows.length === 0) return null;

  const columns = source.columns;
  // Show a window of rows around the current index
  const windowSize = 8;
  const startIdx = Math.max(0, currentRowIndex - 2);
  const endIdx = Math.min(rows.length, startIdx + windowSize);
  const visibleRows = rows.slice(startIdx, endIdx);

  return (
    <div className="mb-3 border border-border rounded-lg overflow-hidden">
      <div className="max-h-[200px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-xs sticky top-0 bg-card z-10">#</TableHead>
              {columns.slice(0, 4).map((col) => (
                <TableHead key={col} className="text-xs whitespace-nowrap sticky top-0 bg-card z-10">
                  {col}
                </TableHead>
              ))}
              {columns.length > 4 && (
                <TableHead className="text-xs sticky top-0 bg-card z-10">...</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => {
              const rowValues = row.values as Record<string, string>;
              const isActive = row.row_index === currentRowIndex;
              const isPrinted = row.row_index < currentRowIndex;
              return (
                <TableRow
                  key={row.id}
                  ref={isActive ? activeRowRef : undefined}
                  className={
                    isActive
                      ? 'bg-primary/20 border-l-2 border-l-primary font-medium'
                      : isPrinted
                      ? 'opacity-40'
                      : ''
                  }
                >
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {row.row_index + 1}
                    {isActive && <span className="ml-1 text-primary">▶</span>}
                  </TableCell>
                  {columns.slice(0, 4).map((col) => (
                    <TableCell key={col} className="text-xs whitespace-nowrap max-w-[150px] truncate">
                      {rowValues[col] || ''}
                    </TableCell>
                  ))}
                  {columns.length > 4 && (
                    <TableCell className="text-xs text-muted-foreground">…</TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
