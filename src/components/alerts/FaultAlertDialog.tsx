import { useState, useEffect, useCallback, useRef } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';


export interface PrinterFault {
  code: string;
  severity: string;
  message: string;
}

interface FaultAlertDialogProps {
  /** Active faults from ^LE polling */
  faults: PrinterFault[];
  /** Whether a printer is currently connected */
  isConnected: boolean;
}

const SNOOZE_DURATION_MS = 3 * 60 * 1000; // 3 minutes
const FAULT_IMAGE_EXTENSIONS = ['png', 'bmp', 'jpg', 'jpeg', 'webp'] as const;
const DASH_VARIANTS_REGEX = /[‐‑‒–—−]/g;

const normalizeFaultCodeForAsset = (rawCode: string) => {
  const normalizedDashes = rawCode.trim().replace(DASH_VARIANTS_REGEX, '-');
  const strictCodeMatch = normalizedDashes.match(/\b\d{2}-\d{4}\b/);
  if (strictCodeMatch) return strictCodeMatch[0];

  return normalizedDashes.replace(/[^a-zA-Z0-9_-]/g, '');
};

export function FaultAlertDialog({ faults, isConnected }: FaultAlertDialogProps) {
  const [open, setOpen] = useState(false);
  // Index of the fault currently being displayed
  const [currentIndex, setCurrentIndex] = useState(0);
  // Track which fault codes are currently snoozed (code -> expiry timestamp)
  const snoozedRef = useRef<Record<string, number>>({});
  // Track which faults we've already shown so we don't re-pop immediately
  const [dismissedCodes, setDismissedCodes] = useState<Set<string>>(new Set());
  const [imageExtIndex, setImageExtIndex] = useState(0);

  // Determine which faults should trigger a popup (not snoozed)
  const getActiveFaults = useCallback(() => {
    const now = Date.now();
    for (const code of Object.keys(snoozedRef.current)) {
      if (snoozedRef.current[code] <= now) {
        delete snoozedRef.current[code];
      }
    }
    return faults.filter(f => !snoozedRef.current[f.code]);
  }, [faults]);

  // When faults change, check if we need to show the dialog
  useEffect(() => {
    if (!isConnected || faults.length === 0) {
      setOpen(false);
      setCurrentIndex(0);
      return;
    }

    const active = getActiveFaults();
    if (active.length > 0) {
      const hasNew = active.some(f => !dismissedCodes.has(f.code));
      if (hasNew) {
        setCurrentIndex(0);
        setOpen(true);
      }
    }
  }, [faults, isConnected, getActiveFaults, dismissedCodes]);

  // When faults are cleared, reset
  useEffect(() => {
    if (faults.length === 0) {
      setDismissedCodes(new Set());
      snoozedRef.current = {};
      setCurrentIndex(0);
    }
  }, [faults.length]);

  // Reset when disconnected
  useEffect(() => {
    if (!isConnected) {
      setDismissedCodes(new Set());
      snoozedRef.current = {};
      setCurrentIndex(0);
    }
  }, [isConnected]);

  const activeFaults = getActiveFaults();
  const currentFault = activeFaults[currentIndex];

  useEffect(() => {
    setImageExtIndex(0);
  }, [currentFault?.code]);

  const handleDismiss = useCallback(() => {
    if (!currentFault) return;

    const now = Date.now();
    // Snooze this specific fault
    snoozedRef.current[currentFault.code] = now + SNOOZE_DURATION_MS;
    setDismissedCodes(prev => {
      const next = new Set(prev);
      next.add(currentFault.code);
      return next;
    });

    // Schedule re-check after snooze expires
    const code = currentFault.code;
    setTimeout(() => {
      setDismissedCodes(prev => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    }, SNOOZE_DURATION_MS);

    // Check if there are more faults to show
    const remaining = activeFaults.filter((f, i) => i !== currentIndex && !snoozedRef.current[f.code]);
    if (remaining.length > 0) {
      // Move to next fault (recalculate index since we snoozed current)
      setCurrentIndex(0);
    } else {
      setOpen(false);
      setCurrentIndex(0);
    }
  }, [currentFault, activeFaults, currentIndex]);

  if (!currentFault || (!open && activeFaults.length === 0)) return null;

  // Build the fault code image path with extension fallback support (png/bmp/etc)
  const normalizedFaultCode = normalizeFaultCodeForAsset(currentFault?.code ?? '');
  const qrImagePath = normalizedFaultCode
    ? `/fault-codes/${normalizedFaultCode}.${FAULT_IMAGE_EXTENSIONS[imageExtIndex]}`
    : '';

  const isLastFault = currentIndex >= activeFaults.length - 1;

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-[60] grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] border border-destructive/50 bg-card shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg overflow-hidden"
        >
          {/* Hidden title/description for accessibility */}
          <AlertDialogPrimitive.Title className="sr-only">
            Fault {currentFault.code}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="sr-only">
            {currentFault.message}
          </AlertDialogPrimitive.Description>

          {/* Image with clickable OK hotspot overlay */}
          <div className="relative">
            <img
              src={qrImagePath}
              alt={`Fault ${currentFault.code}: ${currentFault.message}`}
              className="w-full"
              onError={() => {
                setImageExtIndex((prev) =>
                  prev < FAULT_IMAGE_EXTENSIONS.length - 1 ? prev + 1 : prev,
                );
              }}
            />
            {/* Invisible clickable hotspot over the OK button area in the image
                Positioned at roughly bottom-right where the OK button sits */}
            <AlertDialogPrimitive.Action
              className="absolute cursor-pointer"
              style={{ right: '8%', bottom: '4%', width: '25%', height: '12%' }}
              onClick={handleDismiss}
            >
              <span className="sr-only">
                {activeFaults.length > 1 && !isLastFault ? 'Next Fault' : 'OK'}
              </span>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
