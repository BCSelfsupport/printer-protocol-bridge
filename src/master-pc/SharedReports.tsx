import { useMemo, useRef, useState } from 'react';
import { ReportTypeSelector, type ReportType } from '@/components/reports/ReportTypeSelector';
import { ReportTimeScope } from '@/components/reports/ReportTimeScopeBar';
import { ReportDownloadMenu } from '@/components/reports/ReportDownloadMenu';
import { ProductionSummaryReport } from '@/components/reports/ProductionSummaryReport';
import { ShiftReport } from '@/components/reports/ShiftReport';
import { CustomReportRenderer } from '@/components/reports/CustomReportRenderer';
import { DEFAULT_SCOPE } from '@/types/reportTemplates';
import { filterRuns, resolveScope } from '@/lib/reportAggregation';
import { calculateOEE } from '@/types/production';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Printer } from '@/types/printer';
import type { SharedHistory } from './types';
export function SharedReports({ history, printers }: { history: SharedHistory; printers: Printer[] }) {
  const [type, setType] = useState<ReportType>('production');
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const [templateId, setTemplateId] = useState('');
  const node = useRef<HTMLDivElement>(null);
  const template = history.templates.find(t => t.id === templateId);
  const runs = useMemo(() => filterRuns(history.runs, resolveScope(type === 'custom' && template ? template.scope : scope), type === 'custom' && template ? template.scope.printerIds : scope.printerIds), [history.runs, scope, template, type]);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><ReportTypeSelector value={type} onChange={setType} /><ReportDownloadMenu getNode={() => node.current} runs={runs} title="Production report" filenameStem="master-production-report" /></div>
    <ReportTimeScope scope={scope} onChange={setScope} printers={printers} />
    {type === 'custom' && <Select value={templateId} onValueChange={setTemplateId}><SelectTrigger><SelectValue placeholder="Saved report" /></SelectTrigger><SelectContent>{history.templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>}
    <div ref={node}>
      {type === 'production' && <ProductionSummaryReport runs={runs} printers={printers} scope={scope} />}
      {type === 'shift' && <ShiftReport runs={runs} printers={printers} scope={scope} />}
      {type === 'custom' && template && <CustomReportRenderer template={template} runs={runs} printers={printers} />}
      {type === 'oee' && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Printer / Message</th><th>Actual / Target</th><th>Availability</th><th>Performance</th><th>OEE</th></tr></thead><tbody>{runs.map(run => { const m = calculateOEE(run); return <tr key={run.id} className="border-b"><td className="p-3">{run.printerName} · {run.messageName}</td><td>{run.actualCount} / {run.targetCount}</td><td>{m.availability.toFixed(1)}%</td><td>{m.performance.toFixed(1)}%</td><td>{m.oee.toFixed(1)}%</td></tr>; })}</tbody></table></div>}
    </div>
    {!history.runs.length && <p className="text-muted-foreground">No production records on the Master PC.</p>}
  </div>;
}
