import { Bookmark, Trash2, Plus, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import type { SavedReportTemplate, CustomReportConfig, DateScope } from '@/types/reportTemplates';
import { cn } from '@/lib/utils';

export function SavedTemplatesBar({
  templates,
  activeTemplateId,
  onApply,
  onSave,
  onDelete,
  config,
  scope,
}: {
  templates: SavedReportTemplate[];
  activeTemplateId: string | null;
  onApply: (t: SavedReportTemplate) => void;
  onSave: (name: string) => Promise<SavedReportTemplate>;
  onDelete: (id: string) => Promise<void>;
  config: CustomReportConfig;
  scope: DateScope;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');

  const handleSave = async () => {
    if (!name.trim()) return;
    await onSave(name.trim());
    toast.success('Template saved', { description: `"${name.trim()}" is now available.` });
    setName('');
    setSaveOpen(false);
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-3 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 mr-1">
          <Bookmark className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-foreground uppercase tracking-wide">Templates</span>
        </div>

        {templates.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No saved templates yet</span>
        )}

        {templates.map(t => {
          const isActive = activeTemplateId === t.id;
          return (
            <div
              key={t.id}
              className={cn(
                'group flex items-center gap-1 rounded-lg border transition-all',
                isActive
                  ? 'border-primary/60 bg-primary/10 shadow-sm'
                  : 'border-border/50 bg-background hover:border-primary/30',
              )}
            >
              <button
                onClick={() => onApply(t)}
                className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs font-semibold text-foreground"
                title={`Apply "${t.name}"`}
              >
                {isActive && <Check className="w-3 h-3 text-primary" />}
                <span className="max-w-[140px] truncate">{t.name}</span>
              </button>
              <button
                onClick={() => onDelete(t.id)}
                className="p-1 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete template"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-primary/30 hover:bg-primary/10"
            onClick={() => setSaveOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-xs">Save Current</span>
          </Button>
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-primary" />
              Save Report Template
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                Template name
              </label>
              <Input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Weekly OEE — Line A"
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              />
            </div>
            <div className="rounded-lg bg-secondary/50 p-3 text-[11px] text-muted-foreground space-y-1">
              <div><b className="text-foreground">{config.metrics.length}</b> metrics · <b className="text-foreground">{config.visualizations.length}</b> visualizations · grouped by <b className="text-foreground">{config.grouping}</b></div>
              <div>Scope: <b className="text-foreground">{scope.preset}</b> · bucket <b className="text-foreground">{scope.bucket}</b></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name.trim()} className="industrial-button text-white border-0">
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
