import { useState } from 'react';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportNodeToPdf, exportRunsToCsv } from '@/lib/reportExport';
import type { ProductionRun } from '@/types/production';
import { toast } from 'sonner';

interface Props {
  /** Function returning the DOM node to capture for PDF (called at click time) */
  getNode: () => HTMLElement | null;
  /** Underlying runs for CSV */
  runs: ProductionRun[];
  /** PDF title (page 1 header) */
  title: string;
  /** Filename stem (no extension) */
  filenameStem: string;
  disabled?: boolean;
}

export function ReportDownloadMenu({ getNode, runs, title, filenameStem, disabled }: Props) {
  const [busy, setBusy] = useState(false);

  const downloadPdf = async () => {
    const node = getNode();
    if (!node) {
      toast.error('Nothing to export yet');
      return;
    }
    setBusy(true);
    try {
      await exportNodeToPdf(node, `${filenameStem}.pdf`, title);
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('[ReportDownloadMenu] pdf failed', err);
      toast.error('PDF export failed');
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = () => {
    if (runs.length === 0) {
      toast.error('No data to export');
      return;
    }
    try {
      exportRunsToCsv(runs, `${filenameStem}.csv`);
      toast.success('CSV downloaded');
    } catch (err) {
      console.error('[ReportDownloadMenu] csv failed', err);
      toast.error('CSV export failed');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled || busy}>
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
          Download
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={downloadPdf}>
          <FileText className="w-4 h-4 mr-2" /> PDF Report
        </DropdownMenuItem>
        <DropdownMenuItem onClick={downloadCsv}>
          <FileSpreadsheet className="w-4 h-4 mr-2" /> CSV (raw data)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
