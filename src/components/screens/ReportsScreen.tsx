import { useRef, useState, useMemo } from 'react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { ReportsScreen as OEEReport } from '@/components/reports/OEEReport';
import { ReportTypeSelector, type ReportType } from '@/components/reports/ReportTypeSelector';
import { ReportTimeScope } from '@/components/reports/ReportTimeScopeBar';
import { ReportDownloadMenu } from '@/components/reports/ReportDownloadMenu';
import { ProductionSummaryReport } from '@/components/reports/ProductionSummaryReport';
import { ShiftReport } from '@/components/reports/ShiftReport';
import { CustomReportBuilder } from '@/components/reports/CustomReportBuilder';
import { CustomReportRenderer } from '@/components/reports/CustomReportRenderer';
import { SavedTemplatesBar } from '@/components/reports/SavedTemplatesBar';
import { useReportTemplates } from '@/hooks/useReportTemplates';
import { DEFAULT_SCOPE, type CustomReportTemplate } from '@/types/reportTemplates';
import { resolveScope, filterRuns } from '@/lib/reportAggregation';
import { Button } from '@/components/ui/button';
import { Sliders } from 'lucide-react';
import type { ProductionRun, ProductionSnapshot } from '@/types/production';
import type { Printer } from '@/types/printer';

interface Props {
  runs: ProductionRun[];
  snapshots: ProductionSnapshot[];
  printers: Printer[];
  onAddRun: (run: Omit<ProductionRun, 'id'>) => Promise<ProductionRun>;
  onUpdateRun: (id: string, updates: Partial<ProductionRun>) => void;
  onDeleteRun: (id: string) => void;
  onAddDowntime: (runId: string, reason: string) => void;
  onEndDowntime: (runId: string, eventId: string) => void;
  onHome: () => void;
}

export function ReportsScreen(props: Props) {
  const [type, setType] = useState<ReportType>('oee');
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const reportRef = useRef<HTMLDivElement>(null);

  const { templates, saveTemplate, deleteTemplate, duplicateTemplate } = useReportTemplates();
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CustomReportTemplate | null>(null);

  const activeTemplate = useMemo(
    () => templates.find(t => t.id === activeTemplateId) ?? null,
    [templates, activeTemplateId]
  );

  const filteredRuns = useMemo(() => {
    const range = resolveScope(scope);
    return filterRuns(props.runs, range, scope.printerIds);
  }, [props.runs, scope]);

  // OEE keeps its own self-contained UI
  if (type === 'oee') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-3">
          <ReportTypeSelector value={type} onChange={setType} />
        </div>
        <div className="flex-1 overflow-hidden">
          <OEEReport {...props} />
        </div>
      </div>
    );
  }

  const renderTitle = () => {
    if (type === 'production') return 'Production Summary';
    if (type === 'shift') return 'Shift Report';
    if (type === 'custom') return activeTemplate?.name ?? 'Custom Report';
    return 'Report';
  };

  const renderFilenameStem = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const base = renderTitle().toLowerCase().replace(/\s+/g, '-');
    return `${base}-${stamp}`;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <SubPageHeader
        title="Reports"
        onHome={props.onHome}
        rightContent={
          <ReportDownloadMenu
            getNode={() => reportRef.current}
            runs={type === 'custom' && activeTemplate
              ? filterRuns(props.runs, resolveScope(activeTemplate.scope), activeTemplate.scope.printerIds)
              : filteredRuns}
            title={renderTitle()}
            filenameStem={renderFilenameStem()}
          />
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <ReportTypeSelector value={type} onChange={setType} />

        {type !== 'custom' && (
          <ReportTimeScope scope={scope} onChange={setScope} printers={props.printers} />
        )}

        {type === 'custom' && (
          <SavedTemplatesBar
            templates={templates}
            activeId={activeTemplateId}
            onSelect={setActiveTemplateId}
            onNew={() => { setEditingTemplate(null); setBuilderOpen(true); }}
            onEdit={(t) => { setEditingTemplate(t); setBuilderOpen(true); }}
            onDuplicate={async (id) => {
              const copy = await duplicateTemplate(id);
              if (copy) setActiveTemplateId(copy.id);
            }}
            onDelete={async (id) => {
              await deleteTemplate(id);
              if (activeTemplateId === id) setActiveTemplateId(null);
            }}
          />
        )}

        <div ref={reportRef} className="space-y-3">
          {type === 'production' && (
            <ProductionSummaryReport runs={filteredRuns} printers={props.printers} scope={scope} />
          )}
          {type === 'shift' && (
            <ShiftReport runs={filteredRuns} printers={props.printers} scope={scope} />
          )}
          {type === 'custom' && activeTemplate && (
            <CustomReportRenderer
              template={activeTemplate}
              runs={filterRuns(
                props.runs,
                resolveScope(activeTemplate.scope),
                activeTemplate.scope.printerIds
              )}
              printers={props.printers}
            />
          )}
          {type === 'custom' && !activeTemplate && (
            <div className="rounded-xl border-2 border-dashed border-border/60 bg-card/50 p-12 text-center">
              <Sliders className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-bold text-foreground mb-1">No template selected</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Build a custom report by choosing metrics, groupings, and visualizations.
              </p>
              <Button onClick={() => { setEditingTemplate(null); setBuilderOpen(true); }}>
                <Sliders className="w-4 h-4 mr-2" /> Create Template
              </Button>
            </div>
          )}
        </div>
      </div>

      <CustomReportBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        printers={props.printers}
        initial={editingTemplate ?? undefined}
        onSave={async (t) => {
          const saved = await saveTemplate(t);
          setActiveTemplateId(saved.id);
          setBuilderOpen(false);
        }}
      />
    </div>
  );
}
