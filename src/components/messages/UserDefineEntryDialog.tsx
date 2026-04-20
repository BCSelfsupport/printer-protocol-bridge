import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScanLine, Keyboard } from 'lucide-react';

export interface UserDefinePrompt {
  fieldId: number;
  label: string;   // e.g. "FLOCK CODE" from Element D:
  length: number;   // max characters allowed
}

interface UserDefineEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompts: UserDefinePrompt[];
  onConfirm: (entries: Record<number, string>) => void | Promise<void>;
}

export function UserDefineEntryDialog({
  open,
  onOpenChange,
  prompts,
  onConfirm,
}: UserDefineEntryDialogProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [entries, setEntries] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentPrompt = prompts[currentIndex];

  // Reset state when dialog opens with new prompts
  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setEntries({});
      setIsSubmitting(false);
    }
  }, [open, prompts]);

  // Auto-focus the input
  useEffect(() => {
    if (open && inputRef.current && !isSubmitting) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, currentIndex, isSubmitting]);

  if (!currentPrompt) return null;

  const currentValue = entries[currentPrompt.fieldId] ?? '';

  const handleNext = async () => {
    if (isSubmitting) return;

    if (currentIndex < prompts.length - 1) {
      setCurrentIndex(prev => prev + 1);
      return;
    }

    try {
      setIsSubmitting(true);
      await onConfirm(entries);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (isSubmitting) return;
    onOpenChange(false);
  };

  const handleChange = (value: string) => {
    if (isSubmitting) return;
    // Limit to the specified length
    const trimmed = value.slice(0, currentPrompt.length);
    setEntries(prev => ({ ...prev, [currentPrompt.fieldId]: trimmed }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && currentValue.length > 0 && !isSubmitting) {
      void handleNext();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 border-b">
          <DialogTitle className="text-center text-lg font-semibold">
            User Define: {currentPrompt.label}
          </DialogTitle>
          {prompts.length > 1 && (
            <p className="text-center text-xs text-muted-foreground mt-1">
              Field {currentIndex + 1} of {prompts.length}
            </p>
          )}
        </div>

        {/* Entry area */}
        <div className="p-6 space-y-4">
          <p className="text-center text-foreground text-base font-medium">
            Enter Characters: {currentPrompt.length}
          </p>

          <Input
            ref={inputRef}
            value={currentValue}
            onChange={(e) => handleChange(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            maxLength={currentPrompt.length}
            className="text-center text-lg font-mono tracking-widest h-12"
            placeholder={'_'.repeat(currentPrompt.length)}
            autoFocus
          />

          <p className="text-center text-xs text-muted-foreground">
            {currentValue.length} / {currentPrompt.length} characters
          </p>
        </div>

        {/* Footer */}
        <DialogFooter className="px-4 py-3 border-t bg-muted/30 flex gap-2 sm:justify-between">
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleNext()}
            disabled={currentValue.length === 0 || isSubmitting}
          >
            {isSubmitting ? 'Sending…' : currentIndex < prompts.length - 1 ? 'Next' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
