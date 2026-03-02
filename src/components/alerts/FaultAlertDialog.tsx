import { useState, useEffect, useCallback, useRef } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';


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
  /** Send ^CA to acknowledge/clear the fault on the printer hardware */
  onAcknowledge?: () => void;
}

const SNOOZE_DURATION_MS = 3 * 60 * 1000; // 3 minutes
const FAULT_IMAGE_EXTENSIONS = ['png', 'bmp', 'jpg', 'jpeg', 'webp'] as const;
const DASH_VARIANTS_REGEX = /[‐‑‒–—−]/g;

const normalizeFaultCodeForAsset = (rawCode: string) => {
  const normalizedDashes = rawCode.trim().replace(DASH_VARIANTS_REGEX, '-');
  const strictCodeMatch = normalizedDashes.match(/\b[0-9A-Fa-f]{2}-[0-9A-Fa-f]{4}\b/);
  if (strictCodeMatch) return strictCodeMatch[0];

  return normalizedDashes.replace(/[^a-zA-Z0-9_-]/g, '');
};

export function FaultAlertDialog({ faults, isConnected, onAcknowledge }: FaultAlertDialogProps) {
  const [open, setOpen] = useState(false);
  // Index of the fault currently being displayed
  const [currentIndex, setCurrentIndex] = useState(0);
  // Track which fault codes are currently snoozed (code -> expiry timestamp)
  const snoozedRef = useRef<Record<string, number>>({});
  // Track which faults we've already shown so we don't re-pop immediately
  const [dismissedCodes, setDismissedCodes] = useState<Set<string>>(new Set());
  const [imageExtIndex, setImageExtIndex] = useState(0);

  const previousActiveCodesRef = useRef<Set<string>>(new Set());
  const previousDismissedCodesRef = useRef<Set<string>>(new Set());
  const hasSeededConnectedSnapshotRef = useRef(false);

  // Determine which faults should trigger a popup (not snoozed)
  const getActiveFaults = useCallback(() => {
    const now = Date.now();
    for (const code of Object.keys(snoozedRef.current)) {
      if (snoozedRef.current[code] <= now) {
        delete snoozedRef.current[code];
      }
    }
    return faults.filter(f => !snoozedRef.current[f.code] && !dismissedCodes.has(f.code));
  }, [faults, dismissedCodes]);

  // When faults change, show dialog only for newly introduced faults
  // (or when a snoozed/dismissed fault becomes eligible again).
  useEffect(() => {
    if (!isConnected) {
      setOpen(false);
      setCurrentIndex(0);
      previousActiveCodesRef.current = new Set();
      previousDismissedCodesRef.current = new Set();
      hasSeededConnectedSnapshotRef.current = false;
      return;
    }

    const active = getActiveFaults();
    const activeCodes = new Set(active.map((fault) => fault.code));

    // Seed first connected snapshot to avoid popup on startup/connect.
    if (!hasSeededConnectedSnapshotRef.current) {
      hasSeededConnectedSnapshotRef.current = true;
      previousActiveCodesRef.current = activeCodes;
      previousDismissedCodesRef.current = new Set(dismissedCodes);
      return;
    }

    const previousActiveCodes = previousActiveCodesRef.current;
    const previousDismissedCodes = previousDismissedCodesRef.current;

    const hasNewFault = active.some((fault) => !previousActiveCodes.has(fault.code));
    const hasDismissalExpired = active.some((fault) =>
      previousDismissedCodes.has(fault.code) && !dismissedCodes.has(fault.code),
    );

    if ((hasNewFault || hasDismissalExpired) && active.length > 0) {
      setCurrentIndex(0);
      setOpen(true);
    }

    if (active.length === 0) {
      setOpen(false);
      setCurrentIndex(0);
    }

    previousActiveCodesRef.current = activeCodes;
    previousDismissedCodesRef.current = new Set(dismissedCodes);
  }, [faults, isConnected, getActiveFaults, dismissedCodes]);

  // When a fault disappears from the list, remove it from dismissedCodes
  // so it can re-trigger the dialog if it comes back later.
  useEffect(() => {
    if (faults.length === 0) {
      setDismissedCodes(new Set());
      snoozedRef.current = {};
      setCurrentIndex(0);
    } else {
      // Remove dismissed/snoozed entries for faults that are no longer active
      const currentCodes = new Set(faults.map(f => f.code));
      setDismissedCodes(prev => {
        const next = new Set<string>();
        for (const code of prev) {
          if (currentCodes.has(code)) next.add(code);
        }
        return next.size !== prev.size ? next : prev;
      });
      // Also clear snooze for faults that went away
      for (const code of Object.keys(snoozedRef.current)) {
        if (!currentCodes.has(code)) {
          delete snoozedRef.current[code];
        }
      }
    }
  }, [faults]);

  // Reset when disconnected
  useEffect(() => {
    if (!isConnected) {
      setDismissedCodes(new Set());
      snoozedRef.current = {};
      previousActiveCodesRef.current = new Set();
      previousDismissedCodesRef.current = new Set();
      hasSeededConnectedSnapshotRef.current = false;
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

    // Send ^CA to clear the fault on the printer hardware
    onAcknowledge?.();

    // Mark this fault as dismissed and check for remaining faults
    setDismissedCodes(prev => {
      const next = new Set(prev);
      next.add(currentFault.code);
      // Calculate remaining undismissed faults
      const remaining = activeFaults.filter(f => f.code !== currentFault.code && !next.has(f.code));
      if (remaining.length > 0) {
        // Keep dialog open and reset index for next fault
        setCurrentIndex(0);
        // Force re-open in case AlertDialogPrimitive.Action auto-closed it
        setTimeout(() => setOpen(true), 50);
      } else {
        setOpen(false);
        setCurrentIndex(0);
      }
      return next;
    });
  }, [currentFault, activeFaults, currentIndex, onAcknowledge]);

  if (!currentFault || (!open && activeFaults.length === 0)) return null;

  // Build the fault image URL robustly for both web and Electron file:// runtime.
  const normalizedFaultCode = normalizeFaultCodeForAsset(currentFault?.code ?? '');
  const qrImagePath = normalizedFaultCode
    ? (() => {
        const ext = FAULT_IMAGE_EXTENSIONS[imageExtIndex];
        try {
          return new URL(`fault-codes/${normalizedFaultCode}.${ext}`, document.baseURI).toString();
        } catch {
          const baseUrl = import.meta.env.BASE_URL ?? '/';
          return `${baseUrl}fault-codes/${normalizedFaultCode}.${ext}`;
        }
      })()
    : '';

  const isLastFault = currentIndex >= activeFaults.length - 1;

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={setOpen}>
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
