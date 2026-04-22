import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RotateCcw } from 'lucide-react';
import type { MessageDetails } from '@/components/screens/EditMessageScreen';

/** Override map: counter slot id (1-4) → desired starting value. */
export type CounterOverrides = Record<number, number>;

interface ScanCounterDialogProps {
  open: boolean;
  /** The message about to be printed — used to detect referenced counter slots. */
  details: MessageDetails | null;
  /** Live counter values polled from the printer (index 0 = Counter 1). */
  liveCounters?: number[];
  /** Label of the field that was just scanned (shown for context). */
  scanLabel?: string;
  /** Value the operator scanned (shown for context). */
  scannedValue?: string;
  onCancel: () => void;
  /** Continue to print. Overrides only contain counters the operator actually changed. */
  onConfirm: (overrides: CounterOverrides) => void;
}

/**
 * Detect which counter slots (1-4) the message references — either via
 * a counter-type field or a `{C1}/{CN1}/{COUNTER1}` token in any field's data.
 */
export function detectReferencedCounters(details: MessageDetails | null): number[] {
  if (!details) return [];
  const slots = new Set<number>();
  for (const f of details.fields) {
    if (f.type === 'counter') {
      const m = f.autoCodeFieldType?.match(/^counter_(\d+)$/i);
      if (m) slots.add(parseInt(m[1], 10));
    }
    if (typeof f.data === 'string') {
      const re = /\{(?:COUNTER|CN|C)(\d+)\}/gi;
      let match: RegExpExecArray | null;
      while ((match = re.exec(f.data)) !== null) {
        slots.add(parseInt(match[1], 10));
      }
    }
  }
  return [...slots].filter((n) => n >= 1 && n <= 4).sort((a, b) => a - b);
}

export function ScanCounterDialog({
  open,
  details,
  liveCounters,
  scanLabel,
  scannedValue,
  onCancel,
  onConfirm,
}: ScanCounterDialogProps) {
  const slots = useMemo(() => detectReferencedCounters(details), [details]);
  const [values, setValues] = useState<Record<number, string>>({});

  // Map each slot → its configured Start Count from the message's advanced
  // settings. This is what "Reset" should restore to (NOT a hardcoded 0),
  // because the printer's own Counter Reset behaviour uses startCount.
  const startCounts = useMemo(() => {
    const map: Record<number, number> = {};
    const configs = details?.advancedSettings?.counters ?? [];
    for (const slot of slots) {
      const cfg = configs.find((c) => c.id === slot);
      map[slot] = cfg?.startCount ?? 0;
    }
    return map;
  }, [details, slots]);

  // Seed the inputs with the current live count whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    const seed: Record<number, string> = {};
    for (const slot of slots) {
      const live = liveCounters?.[slot - 1] ?? 0;
      seed[slot] = String(live);
    }
    setValues(seed);
  }, [open, slots, liveCounters]);

  if (slots.length === 0) return null;

  const handleConfirm = () => {
    const overrides: CounterOverrides = {};
    for (const slot of slots) {
      const live = liveCounters?.[slot - 1] ?? 0;
      const raw = values[slot] ?? String(live);
      const parsed = parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) continue;
      if (parsed !== live) overrides[slot] = parsed;
    }
    onConfirm(overrides);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set counter{slots.length > 1 ? 's' : ''}</DialogTitle>
        </DialogHeader>

        {scanLabel && scannedValue && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{scanLabel}:</span>{' '}
            <span className="font-mono font-semibold break-all">{scannedValue}</span>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Adjust the starting count{slots.length > 1 ? 's' : ''} before printing, or continue with
          the current value.
        </p>

        <div className="space-y-3">
          {slots.map((slot) => {
            const live = liveCounters?.[slot - 1] ?? 0;
            return (
              <div key={slot} className="space-y-1">
                <Label htmlFor={`counter-${slot}`} className="text-sm">
                  Counter {slot} <span className="text-muted-foreground">(current: {live})</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`counter-${slot}`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={values[slot] ?? ''}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [slot]: e.target.value }))
                    }
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setValues((prev) => ({ ...prev, [slot]: '0' }))}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reset to 0
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}