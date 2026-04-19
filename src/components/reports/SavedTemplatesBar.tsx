import { Bookmark, Plus, Pencil, Copy, Trash2, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { CustomReportTemplate } from '@/types/reportTemplates';

interface Props {
  templates: CustomReportTemplate[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onEdit: (t: CustomReportTemplate) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SavedTemplatesBar({
  templates, activeId, onSelect, onNew, onEdit, onDuplicate, onDelete,
}: Props) {
  return (
    <div className="rounded-xl border bg-card p-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 pr-2 border-r border-border/40">
          <Bookmark className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Templates</span>
        </div>

        {templates.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">No saved templates yet — configure one below and save.</span>
        ) : (
          templates.map(t => {
            const active = t.id === activeId;
            return (
              <div
                key={t.id}
                className={cn(
                  'flex items-center rounded-lg overflow-hidden transition-all',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                )}
              >
                <button
                  onClick={() => onSelect(t.id)}
                  className="px-2.5 py-1 text-xs font-semibold"
                >
                  {t.name}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className={cn('px-1.5 py-1 hover:bg-black/10', active ? 'text-primary-foreground' : 'text-muted-foreground')}>
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(t)}>
                      <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(t.id)}>
                      <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDelete(t.id)} className="text-destructive focus:text-destructive">
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        )}

        <div className="flex-1" />

        <Button size="sm" variant="outline" onClick={onNew} className="h-7">
          <Plus className="w-3.5 h-3.5 mr-1" /> New Template
        </Button>
      </div>
    </div>
  );
}
