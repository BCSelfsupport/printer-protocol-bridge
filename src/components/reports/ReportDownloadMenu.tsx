import { useState } from 'react';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { exportReportToPDF, exportRunsToCSV } from '@/lib/reportExport';
import type { ProductionRun } from '@/types/production';

export function ReportDownloadMenu({
  title,
  subtitle,
  getElement,
  runs,
  disabled,
}: {
  title: string;
  subtitle?: string;
  getElement: () => HTMLElement | null;
  runs: ProductionRun[];
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);

  const handlePDF = async () => {
    const el = getElement();
    if (!el) {
      toast.error('Nothing to export', { description: 'No report content available.' });
      return;
    }
    setBusy('pdf');
    try {
      await exportReportToPDF({
        title,
        subtitle,
        element: el,
        filename: `${title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`,
      });
      toast.success('PDF downloaded', { description: `${title} saved successfully.` });
    } catch (err) {
      console.error('[ReportDownload] PDF export failed', err);
      toast.error('PDF export failed', { description: String(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleCSV = () => {
    if (runs.length === 0) {
      toast.error('No data', { description: 'No production runs in selected range.' });
      return;
    }
    setBusy('csv');
    try {
      exportRunsToCSV(runs, `${title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`);
      toast.success('CSV downloaded', { description: `${runs.length} runs exported.` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || busy !== null}
          className="gap-2 border-primary/30 hover:bg-primary/5 hover:border-primary/50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {busy === 'pdf' ? 'Generating PDF…' : busy === 'csv' ? 'Exporting CSV…' : 'Download'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={handlePDF} className="gap-2 cursor-pointer">
          <div className="w-7 h-7 rounded-md bg-destructive/10 flex items-center justify-center">
            <FileText className="w-3.5 h-3.5 text-destructive" />
          </div>
          <div>
            <div className="text-xs font-semibold">PDF Report</div>
            <div className="text-[10px] text-muted-foreground">Branded, printable</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCSV} className="gap-2 cursor-pointer">
          <div className="w-7 h-7 rounded-md bg-success/10 flex items-center justify-center">
            <FileSpreadsheet className="w-3.5 h-3.5 text-success" />
          </div>
          <div>
            <div className="text-xs font-semibold">CSV Data</div>
            <div className="text-[10px] text-muted-foreground">Raw rows for spreadsheets</div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
