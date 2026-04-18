/**
 * ReportsScreen — top-level reports orchestrator.
 *
 * Hosts the ReportType selector, shared time-scope toolbar, saved templates bar,
 * and routes to the appropriate report variant (OEE, Production Summary, Shift, Custom).
 */

import { useEffect, useMemo, useState } from 'react';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { ReportTypeSelector } from '@/components/reports/ReportTypeSelector';
import { ReportTimeScope } from '@/components/reports/ReportTimeScope';
import { SavedTemplatesBar } from '@/components/reports/SavedTemplatesBar';
import { OEEReport } from '@/components/reports/OEEReport';
import { ProductionSummaryReport } from '@/components/reports/ProductionSummaryReport';
import { ShiftReport } from '@/components/reports/ShiftReport';
import { CustomReportBuilder } from '@/components/reports/CustomReportBuilder';
import { useReportTemplates } from '@/hooks/useReportTemplates';
import type { ProductionRun, ProductionSnapshot } from '@/types/production';
import type { Printer } from '@/types/printer';
import type {
  ReportType, DateScope, CustomReportConfig, SavedReportTemplate,
} from '@/types/reportTemplates';
import { DEFAULT_CUSTOM_CONFIG } from '@/types/reportTemplates';

interface ReportsScreenProps {
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

const TYPE_STORAGE_KEY = 'codesync-reports-active-type';
const SCOPE_STORAGE_KEY = 'codesync-reports-scope';
const CUSTOM_STORAGE_KEY = 'codesync-reports-custom-config';

function loadActiveType(): ReportType {
  try {
    const v = localStorage.getItem(TYPE_STORAGE_KEY);
    if (v === 'oee' || v === 'production-summary' || v === 'shift' || v === 'custom') return v;
  } catch { /* ignore */ }
  return 'oee';
}

function loadScope(): DateScope {
  try {
    const raw = localStorage.getItem(SCOPE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { preset: 'last-7', bucket: 'day', printerIds: null };
}

function loadCustomConfig(): CustomReportConfig {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_CUSTOM_CONFIG;
}

export function ReportsScreen(props: ReportsScreenProps) {
  const { printers, onHome } = props;
  const [activeType, setActiveType] = useState<ReportType>(loadActiveType);
  const [scope, setScope] = useState<DateScope>(loadScope);
  const [customConfig, setCustomConfig] = useState<CustomReportConfig>(loadCustomConfig);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const { templates, saveTemplate, deleteTemplate } = useReportTemplates();

  // Persist UI state
  useEffect(() => { try { localStorage.setItem(TYPE_STORAGE_KEY, activeType); } catch { /* ignore */ } }, [activeType]);
  useEffect(() => { try { localStorage.setItem(SCOPE_STORAGE_KEY, JSON.stringify(scope)); } catch { /* ignore */ } }, [scope]);
  useEffect(() => { try { localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(customConfig)); } catch { /* ignore */ } }, [customConfig]);

  // When printers list changes, prune missing IDs from scope
  const sanitizedScope = useMemo<DateScope>(() => {
    if (!scope.printerIds) return scope;
    const valid = scope.printerIds.filter(id => printers.some(p => p.id === id));
    if (valid.length === scope.printerIds.length) return scope;
    return { ...scope, printerIds: valid.length === 0 ? null : valid };
  }, [scope, printers]);

  const handleApplyTemplate = (t: SavedReportTemplate) => {
    setActiveType('custom');
    setCustomConfig(t.config);
    setScope(t.scope);
    setActiveTemplateId(t.id);
  };

  const handleSaveTemplate = async (name: string) => {
    const created = await saveTemplate({ name, config: customConfig, scope });
    setActiveTemplateId(created.id);
    return created;
  };

  const handleDeleteTemplate = async (id: string) => {
    await deleteTemplate(id);
    if (activeTemplateId === id) setActiveTemplateId(null);
  };

  const handleConfigChange = (next: CustomReportConfig) => {
    setCustomConfig(next);
    setActiveTemplateId(null);
  };

  const handleScopeChange = (next: DateScope) => {
    setScope(next);
    if (activeType === 'custom') setActiveTemplateId(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="p-3 md:p-4 flex-shrink-0">
        <SubPageHeader title="Production Reports" onHome={onHome} />
      </div>

      <div className="flex-1 overflow-y-auto px-3 md:px-4 pb-6 space-y-3">
        {/* Report type picker */}
        <ReportTypeSelector value={activeType} onChange={setActiveType} />

        {/* Shared time-scope toolbar */}
        <ReportTimeScope
          scope={sanitizedScope}
          onChange={handleScopeChange}
          printers={printers}
        />

        {/* Saved templates bar — only meaningful for the custom builder */}
        {activeType === 'custom' && (
          <SavedTemplatesBar
            templates={templates}
            activeTemplateId={activeTemplateId}
            onApply={handleApplyTemplate}
            onSave={handleSaveTemplate}
            onDelete={handleDeleteTemplate}
            config={customConfig}
            scope={scope}
          />
        )}

        {/* Routed report */}
        <div className="pt-1">
          {activeType === 'oee' && (
            <OEEReport
              {...props}
              scope={sanitizedScope}
              embedded
            />
          )}
          {activeType === 'production-summary' && (
            <ProductionSummaryReport
              runs={props.runs}
              scope={sanitizedScope}
              printers={printers}
            />
          )}
          {activeType === 'shift' && (
            <ShiftReport
              runs={props.runs}
              scope={sanitizedScope}
              printers={printers}
            />
          )}
          {activeType === 'custom' && (
            <CustomReportBuilder
              runs={props.runs}
              scope={sanitizedScope}
              printers={printers}
              config={customConfig}
              onChange={handleConfigChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
