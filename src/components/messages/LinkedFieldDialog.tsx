import { useState } from 'react';
import { Link2, ArrowLeft, ScanLine, User, Hash, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TokenSource } from '@/lib/tokenResolver';

interface LinkedFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  /** All tokens available within the current message. */
  availableTokens: TokenSource[];
  /** Called with the final composed data string (e.g. "{WORK_ORDER}-{COUNTER1}"). */
  onAddLinkedField: (data: string) => void;
}

const KIND_ICON = {
  scanned: ScanLine,
  prompted: User,
  counter: Hash,
} as const;

const KIND_LABEL = {
  scanned: 'Scanned',
  prompted: 'Prompted',
  counter: 'Counter',
} as const;

export function LinkedFieldDialog({
  open,
  onOpenChange,
  onBack,
  availableTokens,
  onAddLinkedField,
}: LinkedFieldDialogProps) {
  const [composed, setComposed] = useState('');

  const handleBack = () => {
    onOpenChange(false);
    setComposed('');
    onBack();
  };

  const insertToken = (token: string) => {
    setComposed((prev) => `${prev}{${token}}`);
  };

  const handleAdd = () => {
    if (!composed.trim()) return;
    onAddLinkedField(composed);
    onOpenChange(false);
    setComposed('');
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) setComposed('');
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b">
          <button
            onClick={handleBack}
            className="industrial-button p-2 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <DialogTitle className="flex-1 text-center text-lg font-semibold pr-10">
            Linked Field
          </DialogTitle>
        </div>

        <div className="bg-card p-4 space-y-3">
          <div className="flex items-start gap-2 bg-primary/10 border border-primary/30 rounded-lg p-3">
            <Link2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground leading-relaxed">
              A linked field reuses the value of another field. Tap a token below to insert it.
              The value updates automatically — counters tick, scanned values populate from the mobile app.
            </p>
          </div>

          {availableTokens.length === 0 ? (
            <div className="text-center py-6 px-4 border border-dashed border-border rounded-lg">
              <p className="text-sm text-muted-foreground">
                No linkable tokens yet. Add a Scanned Field, User Define, or Counter to this message first,
                then come back here.
              </p>
            </div>
          ) : (
            <>
              {/* Token palette */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Available tokens
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {availableTokens.map((t) => {
                    const Icon = KIND_ICON[t.kind];
                    return (
                      <button
                        key={t.token}
                        onClick={() => insertToken(t.token)}
                        className="flex items-center gap-2 bg-gradient-to-b from-muted to-muted/60 hover:from-muted/80 border border-border rounded-lg p-2.5 text-left transition-colors"
                      >
                        <Icon className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {t.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {`{${t.token}}`} · {KIND_LABEL[t.kind]}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Composer */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Field content
                </Label>
                <Input
                  value={composed}
                  onChange={(e) => setComposed(e.target.value)}
                  placeholder="Pick a token above or type — e.g. {WORK_ORDER}"
                  className="font-mono text-sm h-10"
                />
                <p className="text-[11px] text-muted-foreground">
                  You can combine tokens and literal text:{' '}
                  <span className="font-mono">https://track.example.com/{'{WORK_ORDER}'}</span>
                </p>
              </div>

              <button
                onClick={handleAdd}
                disabled={!composed.trim()}
                className="w-full industrial-button text-white py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5 text-primary" />
                <span className="font-medium">Add Linked Field</span>
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
