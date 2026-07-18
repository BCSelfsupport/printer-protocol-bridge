import { useEffect, useState } from 'react';
import { Sparkles, Wrench, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface ReleaseNote {
  id: string;
  type: 'feature' | 'bugfix';
  title: string;
  date: string;
  summary: string;
}

const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: 'per-printer-message-settings',
    type: 'feature',
    title: 'Per-Printer Message Settings (Squid-Style Parity)',
    date: '18 Jul 2026',
    summary:
      'Major rework of how message tuning is stored and shared across the fleet. Each printer now keeps its own Width, Delay, Bold, Gap and Speed for every message — the message name is shared, the tuned numbers are not. Copying a message to other printers refreshes only the content (fields, text, barcodes) and leaves each target printer\'s hard-won tuning alone. First-time sends to a printer that has never run a message seed from the source printer so the technician only tunes once. Rotation continues to come from the Printer Setup Card (Flip / Mirror Flip). The Copy and Select dialogs now pre-check every printer that has previously run the message, so a whole-fleet resend is one click. Failed pushes surface a Retry / Ignore dialog naming each printer and the exact reason, with retries capped at three. The message editor gains a collapsible "This message on other printers" panel showing each printer\'s current tuning, rotation and last-sent timestamp at a glance. Operators can also select any stored message directly at the printer HMI — the PC updates on the next poll and will not fight the operator by pushing a different message back.',
  },
  {
    id: 'faster-message-select',
    type: 'feature',
    title: 'Much Faster Message Selection Across the Fleet',
    date: '18 Jul 2026',
    summary:
      'Selecting a message across a full fleet is now dramatically faster. A 13-printer network that previously took around 4.5 minutes to complete a message change now finishes in roughly 20–30 seconds. Printers now communicate in parallel with their own safety lock rather than waiting in a single shared queue, and redundant read-back checks on user-defined fields were removed. Per-printer safety and sequenced mass-jet operations are unchanged.',
  },
  {
    id: 'stop-all-jets',
    type: 'feature',
    title: 'One Button Stop All Jets',
    date: '17 Jul 2026',
    summary:
      'Added a single “Stop All Jets” control on the Printers screen. It shuts down every running jet in sequence with safe timing, skipping printers that are already stopped, so the end-of-evening cycle down is controlled and reliable.',
  },
  {
    id: 'start-jet-status-fix',
    type: 'bugfix',
    title: 'Start Jet Status Tracking Fixed',
    date: '17 Jul 2026',
    summary:
      'Fixed a bug where starting a jet on one printer could incorrectly mark the previously-started printer as stopped in the software. Jet running state is now updated optimistically when a Start/Stop command is sent and confirmed by status polls, so “Stop All Jets” correctly targets every physically running jet.',
  },
];

const WHATS_NEW_READ_KEY = 'codesync.whatsNewReadId';

function getLatestNoteId() {
  return RELEASE_NOTES[0]?.id ?? '';
}

function hasUnreadNote() {
  try {
    const lastRead = localStorage.getItem(WHATS_NEW_READ_KEY);
    return lastRead !== getLatestNoteId();
  } catch {
    return false;
  }
}

function markRead() {
  try {
    localStorage.setItem(WHATS_NEW_READ_KEY, getLatestNoteId());
  } catch {
    /* ignore */
  }
}

interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhatsNewDialog({ open, onOpenChange }: WhatsNewDialogProps) {
  useEffect(() => {
    if (open) markRead();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b border-border bg-muted/30">
          <DialogTitle className="text-base md:text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            What&apos;s New
          </DialogTitle>
          <DialogDescription className="text-xs md:text-sm">
            Recent bug fixes and new features in CodeSync.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh]">
          <div className="p-4 space-y-4">
            {RELEASE_NOTES.map((note) => (
              <div
                key={note.id}
                className={cn(
                  'rounded-lg border p-3 space-y-2',
                  note.type === 'feature'
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : 'border-blue-500/20 bg-blue-500/5'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        note.type === 'feature'
                          ? 'bg-emerald-500/20 text-emerald-600'
                          : 'bg-blue-500/20 text-blue-600'
                      )}
                    >
                      {note.type === 'feature' ? (
                        <Zap className="w-3 h-3" />
                      ) : (
                        <Wrench className="w-3 h-3" />
                      )}
                      {note.type === 'feature' ? 'New Feature' : 'Bug Fix'}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {note.date}
                    </span>
                  </div>
                </div>
                <h3 className="text-sm md:text-base font-semibold leading-tight">
                  {note.title}
                </h3>
                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                  {note.summary}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function WhatsNewButton({
  className,
  onClick,
  label,
}: {
  className?: string;
  onClick?: () => void;
  label?: string;
}) {
  const [hasUnread, setHasUnread] = useState(hasUnreadNote);

  useEffect(() => {
    setHasUnread(hasUnreadNote());
  }, []);

  return (
    <button
      onClick={() => {
        setHasUnread(false);
        onClick?.();
      }}
      className={cn(
        'relative inline-flex items-center justify-center rounded-full transition-colors',
        label && 'gap-1',
        className
      )}
      title="What's New"
      aria-label="What's New"
    >
      <Sparkles className={cn('w-4 h-4 md:w-5 md:h-5', label && 'mb-0')} />
      {label && <span className="text-[10px] md:text-xs">{label}</span>}
      {hasUnread && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
        </span>
      )}
    </button>
  );
}
