import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Printer } from 'lucide-react';

interface DataSource {
  id: string;
  name: string;
  columns: string[];
}

interface PrintMessagePreviewProps {
  dataSourceId: string;
  currentRowIndex: number;
  fieldMappings: Record<string, string | string[]>;
  messageName: string;
  dataSources: DataSource[];
}

export function PrintMessagePreview({
  dataSourceId,
  currentRowIndex,
  fieldMappings,
  messageName,
  dataSources,
}: PrintMessagePreviewProps) {
  const [flash, setFlash] = useState(false);
  const prevIndexRef = useRef(currentRowIndex);
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

  // Flash animation when row index advances
  useEffect(() => {
    if (currentRowIndex !== prevIndexRef.current) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 400);
      prevIndexRef.current = currentRowIndex;
      return () => clearTimeout(timer);
    }
  }, [currentRowIndex]);

  if (!source || rows.length === 0) return null;

  // Current row being loaded (waiting for print go)
  const currentRow = rows.find(r => r.row_index === currentRowIndex);
  // Previously printed row
  const prevRow = currentRowIndex > 0 ? rows.find(r => r.row_index === currentRowIndex - 1) : null;

  const rowValues = currentRow ? (currentRow.values as Record<string, string>) : null;
  const prevValues = prevRow ? (prevRow.values as Record<string, string>) : null;

  // Get mapped field values for display
  const mappedFields: { label: string; value: string }[] = [];
  if (rowValues) {
    Object.entries(fieldMappings).forEach(([colName, fieldIdx]) => {
      const value = rowValues[colName] || '';
      if (value) {
        mappedFields.push({ label: colName, value });
      }
    });
  }

  const prevMappedFields: { label: string; value: string }[] = [];
  if (prevValues) {
    Object.entries(fieldMappings).forEach(([colName]) => {
      const value = prevValues[colName] || '';
      if (value) {
        prevMappedFields.push({ label: colName, value });
      }
    });
  }

  return (
    <div className="mb-3 relative overflow-hidden">
      {/* Previous print - sliding out */}
      {prevMappedFields.length > 0 && (
        <div
          className={`bg-muted/30 border border-border rounded-lg p-3 mb-2 transition-all duration-300 ${
            flash ? 'opacity-30 -translate-y-1 scale-[0.98]' : 'opacity-60'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              ✓ Printed #{currentRowIndex}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {prevMappedFields.map((f, i) => (
              <span key={i} className="text-xs font-mono text-muted-foreground line-through">
                {f.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Current message - active */}
      <div
        className={`relative border rounded-lg p-3 transition-all duration-300 ${
          flash
            ? 'bg-primary/20 border-primary shadow-lg shadow-primary/20 scale-[1.01]'
            : 'bg-card border-primary/50'
        }`}
      >
        {/* Flash overlay */}
        {flash && (
          <div className="absolute inset-0 bg-primary/10 rounded-lg animate-pulse pointer-events-none" />
        )}

        <div className="flex items-center gap-2 mb-2">
          <Printer className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">
            {messageName} — Record #{currentRowIndex + 1}
          </span>
        </div>

        {mappedFields.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {mappedFields.map((f, i) => (
              <div key={i} className="flex items-baseline gap-1.5">
                <span className="text-[10px] text-muted-foreground uppercase">{f.label}:</span>
                <span className={`text-sm font-mono font-bold transition-all duration-300 ${
                  flash ? 'text-primary scale-105' : 'text-foreground'
                }`}>
                  {f.value}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No field mappings configured</p>
        )}
      </div>
    </div>
  );
}
