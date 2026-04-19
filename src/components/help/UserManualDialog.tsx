import { useState, useMemo } from 'react';
import { BookOpen, Search, ChevronRight, X, Download, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MANUAL, MANUAL_TITLE, MANUAL_VERSION, type ManualChapter, type ManualSection } from '@/lib/userManualContent';
import { generateUserManualPdf, downloadManualPdf } from '@/lib/manualPdfExport';
import { ScreenshotZoom } from './ScreenshotZoom';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchHit {
  chapter: ManualChapter;
  section: ManualSection;
  matchIn: 'title' | 'body';
}

function renderBody(text: string) {
  // Lightweight markdown: paragraphs, bullet lists, **bold**, ## subheading
  const blocks = text.split(/\n\n+/);
  return blocks.map((block, i) => {
    const lines = block.split('\n');
    if (lines.every(l => l.trim().startsWith('- '))) {
      return (
        <ul key={i} className="list-disc pl-5 space-y-1 text-sm text-foreground/90 leading-relaxed">
          {lines.map((l, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: inlineFormat(l.trim().slice(2)) }} />
          ))}
        </ul>
      );
    }
    if (block.startsWith('## ')) {
      return <h4 key={i} className="text-sm font-bold text-primary uppercase tracking-wider mt-4">{block.slice(3)}</h4>;
    }
    if (lines.every(l => /^\d+\.\s/.test(l.trim()))) {
      return (
        <ol key={i} className="list-decimal pl-5 space-y-1 text-sm text-foreground/90 leading-relaxed">
          {lines.map((l, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: inlineFormat(l.trim().replace(/^\d+\.\s/, '')) }} />
          ))}
        </ol>
      );
    }
    return (
      <p
        key={i}
        className="text-sm text-foreground/90 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: inlineFormat(block.replace(/\n/g, '<br/>')) }}
      />
    );
  });
}

function inlineFormat(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>')
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-secondary text-primary font-mono text-xs">$1</code>');
}

export function UserManualDialog({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState('');
  const [activeChapterId, setActiveChapterId] = useState<string>(MANUAL[0].id);
  const [activeSectionId, setActiveSectionId] = useState<string>(MANUAL[0].sections[0].id);
  const [exporting, setExporting] = useState(false);

  const handleDownload = async () => {
    setExporting(true);
    try {
      const blob = await generateUserManualPdf();
      downloadManualPdf(blob);
      toast.success('User Manual downloaded');
    } catch (e) {
      console.error('PDF export failed', e);
      toast.error('PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchHit[] = [];
    for (const chapter of MANUAL) {
      for (const section of chapter.sections) {
        if (section.title.toLowerCase().includes(q)) out.push({ chapter, section, matchIn: 'title' });
        else if (section.body.toLowerCase().includes(q)) out.push({ chapter, section, matchIn: 'body' });
      }
    }
    return out.slice(0, 30);
  }, [query]);

  const activeChapter = MANUAL.find(c => c.id === activeChapterId) ?? MANUAL[0];
  const activeSection = activeChapter.sections.find(s => s.id === activeSectionId) ?? activeChapter.sections[0];

  const goTo = (chapterId: string, sectionId: string) => {
    setActiveChapterId(chapterId);
    setActiveSectionId(sectionId);
    setQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[88vh] p-0 overflow-hidden gap-0 bg-background">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b bg-gradient-to-r from-primary/10 via-card to-card">
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground tracking-tight">{MANUAL_TITLE}</h2>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{MANUAL_VERSION} · Reference</p>
          </div>
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search the manual…"
              className="pl-8 h-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={exporting}
            className="h-9 gap-1.5"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span className="text-xs font-medium">{exporting ? 'Generating…' : 'PDF'}</span>
          </Button>
          {/* Close (X) is rendered by DialogContent itself — no custom button here */}
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar / Search results */}
          <div className="w-72 border-r bg-card/40 flex flex-col">
            <ScrollArea className="flex-1">
              {query ? (
                <div className="p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">
                    {hits.length} result{hits.length === 1 ? '' : 's'}
                  </p>
                  {hits.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic px-1">Nothing matched "{query}"</p>
                  ) : (
                    <div className="space-y-1">
                      {hits.map(h => (
                        <button
                          key={`${h.chapter.id}-${h.section.id}`}
                          onClick={() => goTo(h.chapter.id, h.section.id)}
                          className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-secondary transition-colors group"
                        >
                          <div className="text-xs font-bold text-foreground group-hover:text-primary truncate">
                            {h.section.title}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {h.chapter.title}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-2">
                  {MANUAL.map(chapter => {
                    const isActive = chapter.id === activeChapterId;
                    return (
                      <div key={chapter.id} className="mb-1">
                        <button
                          onClick={() => {
                            setActiveChapterId(chapter.id);
                            setActiveSectionId(chapter.sections[0].id);
                          }}
                          className={cn(
                            'w-full text-left px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors',
                            isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {chapter.title}
                        </button>
                        {isActive && (
                          <div className="space-y-0.5 mt-0.5 mb-2">
                            {chapter.sections.map(section => (
                              <button
                                key={section.id}
                                onClick={() => setActiveSectionId(section.id)}
                                className={cn(
                                  'w-full text-left pl-6 pr-3 py-1.5 text-sm transition-colors flex items-center gap-1.5',
                                  section.id === activeSectionId
                                    ? 'bg-primary/10 text-primary border-l-2 border-primary font-semibold'
                                    : 'text-foreground/80 hover:bg-secondary hover:text-foreground border-l-2 border-transparent'
                                )}
                              >
                                <ChevronRight className="w-3 h-3 opacity-40" />
                                {section.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="max-w-3xl mx-auto px-8 py-6 space-y-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
                  {activeChapter.title}
                </p>
                <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">
                  {activeSection.title}
                </h1>
                <p className="text-sm text-muted-foreground italic">{activeChapter.intro}</p>
              </div>

              {activeSection.screenshot && (
                <ScreenshotZoom
                  src={activeSection.screenshot}
                  alt={activeSection.title}
                  caption={activeSection.title}
                />
              )}

              <div className="space-y-3">{renderBody(activeSection.body)}</div>

              {/* Prev / Next */}
              <ManualNav
                chapter={activeChapter}
                section={activeSection}
                onNavigate={goTo}
              />
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManualNav({
  chapter, section, onNavigate,
}: {
  chapter: ManualChapter;
  section: ManualSection;
  onNavigate: (chapterId: string, sectionId: string) => void;
}) {
  // Build flat list
  const flat = MANUAL.flatMap(c => c.sections.map(s => ({ chapter: c, section: s })));
  const idx = flat.findIndex(f => f.chapter.id === chapter.id && f.section.id === section.id);
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx < flat.length - 1 ? flat[idx + 1] : null;
  return (
    <div className="flex items-center gap-2 pt-6 border-t mt-8">
      {prev && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate(prev.chapter.id, prev.section.id)}
          className="flex-1 justify-start h-auto py-2"
        >
          <div className="text-left">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Previous</div>
            <div className="text-xs font-semibold truncate">{prev.section.title}</div>
          </div>
        </Button>
      )}
      {next && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate(next.chapter.id, next.section.id)}
          className="flex-1 justify-end h-auto py-2 ml-auto"
        >
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Next</div>
            <div className="text-xs font-semibold truncate">{next.section.title}</div>
          </div>
        </Button>
      )}
    </div>
  );
}
