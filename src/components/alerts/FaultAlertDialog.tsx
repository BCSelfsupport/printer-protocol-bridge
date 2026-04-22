import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { getAuthenticatedAssetUrl } from '@/lib/assetAuth';


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
const FAULT_IMAGE_VARIANTS = ['2', '3', '5'] as const;
const FAULT_IMAGE_EXTENSIONS = ['png', 'bmp', 'jpg', 'jpeg', 'webp'] as const;
const DASH_VARIANTS_REGEX = /[‐‑‒–—−]/g;

const normalizeFaultCodeForAsset = (rawCode: string) => {
  const normalizedDashes = rawCode.trim().replace(DASH_VARIANTS_REGEX, '-');
  const strictCodeMatch = normalizedDashes.match(/\b[0-9A-Fa-f]{2}-[0-9A-Fa-f]{4}\b/);
  if (strictCodeMatch) return strictCodeMatch[0].toUpperCase();

  return normalizedDashes.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
};

/**
 * Fault alert popup driven by a deterministic queue.
 *
 * Design notes:
 * - The queue (`queueCodes`) is the single source of truth for what's shown.
 *   It is rebuilt synchronously from `faults` minus snoozed/dismissed entries.
 * - We never put `setTimeout`/`setOpen` side effects inside `setState`
 *   updaters — those updaters can run twice under React StrictMode and would
 *   re-fire the popup (which is what caused the "Makeup fault loads twice"
 *   symptom).
 * - We deduplicate `faults` by code so a duplicated ^LE entry can't enqueue
 *   the same fault twice.
 * - "New fault" detection uses the raw `faults` set (not the eligible/active
 *   set), so a snooze-expired fault re-triggers reliably even if the polling
 *   payload is identical between cycles.
 */
export function FaultAlertDialog({ faults, isConnected }: FaultAlertDialogProps) {
  // Deduplicate by code — duplicated ^LE entries (e.g. Makeup reported twice)
  // must never produce two popups for the same code.
  const dedupedFaults = useMemo(() => {
    const seen = new Set<string>();
    const out: PrinterFault[] = [];
    for (const f of faults) {
      const canonicalCode = normalizeFaultCodeForAsset(f?.code ?? '');
      if (!canonicalCode || seen.has(canonicalCode)) continue;
      seen.add(canonicalCode);
      out.push({
        ...f,
        code: canonicalCode,
      });
    }
    return out;
  }, [faults]);

  const [open, setOpen] = useState(false);
  // Codes currently queued for display (in order)
  const [queueCodes, setQueueCodes] = useState<string[]>([]);

  // Snoozed codes: code -> expiry timestamp. Snoozes survive across renders
  // but never make it back into the queue until expiry.
  const snoozedRef = useRef<Map<string, number>>(new Map());

  // Tracks codes we've already enqueued during the current "session" so we
  // don't re-enqueue them on every polling tick. Cleared when a code drops
  // off the live faults list (so it can re-trigger if it comes back later).
  const seenCodesRef = useRef<Set<string>>(new Set());

  const [imageExtIndex, setImageExtIndex] = useState(0);
  const [imageVariantIndex, setImageVariantIndex] = useState(0);

  // Reset everything on disconnect.
  useEffect(() => {
    if (isConnected) return;
    setOpen(false);
    setQueueCodes([]);
    snoozedRef.current.clear();
    seenCodesRef.current.clear();
  }, [isConnected]);

  // Sync queue with incoming faults.
  useEffect(() => {
    if (!isConnected) return;

    // Expire any snoozes that have elapsed.
    const now = Date.now();
    for (const [code, expiry] of snoozedRef.current.entries()) {
      if (expiry <= now) snoozedRef.current.delete(code);
    }

    const liveCodes = new Set(dedupedFaults.map((f) => f.code));

    // Drop "seen" memory for codes that are no longer live so they can
    // re-trigger if they come back later.
    for (const code of seenCodesRef.current) {
      if (!liveCodes.has(code)) seenCodesRef.current.delete(code);
    }

    // NOTE: We intentionally do NOT seed an "already seen" snapshot on the
    // first connected poll. Doing so would suppress popups for faults that
    // were already active when the user connected (e.g. a persistent fan /
    // cooling fault), which is exactly the behaviour we don't want — those
    // are the faults the operator most needs to see.

    // Determine which codes are eligible to enqueue: live, not snoozed,
    // and not already in the queue or "seen" this session.
    const newlyEligible: string[] = [];
    for (const fault of dedupedFaults) {
      if (snoozedRef.current.has(fault.code)) continue;
      if (seenCodesRef.current.has(fault.code)) continue;
      newlyEligible.push(fault.code);
    }

    if (newlyEligible.length > 0) {
      for (const code of newlyEligible) seenCodesRef.current.add(code);
      setQueueCodes((prev) => {
        // Drop any queued codes no longer live, then append newly eligible.
        const filtered = prev.filter((c) => liveCodes.has(c));
        // Avoid duplicates inside the queue itself.
        const queueSet = new Set(filtered);
        for (const code of newlyEligible) {
          if (!queueSet.has(code)) {
            filtered.push(code);
            queueSet.add(code);
          }
        }
        return filtered;
      });
    } else {
      // Even with no new eligibility, drop queued codes that went away.
      setQueueCodes((prev) => {
        const filtered = prev.filter((c) => liveCodes.has(c));
        return filtered.length === prev.length ? prev : filtered;
      });
    }
  }, [dedupedFaults, isConnected]);

  // Open/close the dialog purely from queue contents — never from inside
  // another state updater.
  useEffect(() => {
    if (queueCodes.length > 0 && !open) {
      setOpen(true);
    } else if (queueCodes.length === 0 && open) {
      setOpen(false);
    }
  }, [queueCodes, open]);

  // Resolve the current fault from the head of the queue.
  const currentFault = useMemo(() => {
    const code = queueCodes[0];
    if (!code) return undefined;
    return dedupedFaults.find((f) => f.code === code);
  }, [queueCodes, dedupedFaults]);

  // Reset image fallback indices when the displayed fault changes.
  useEffect(() => {
    setImageExtIndex(0);
    setImageVariantIndex(0);
  }, [currentFault?.code]);

  const handleDismiss = useCallback(() => {
    if (!currentFault) return;
    const dismissedCode = currentFault.code;

    // Snooze so it doesn't re-pop immediately if the printer keeps reporting
    // it on the next ^LE cycle.
    snoozedRef.current.set(dismissedCode, Date.now() + SNOOZE_DURATION_MS);

    const remaining = queueCodes.filter((c) => c !== dismissedCode);

    // Pop the head of the queue. The open/close effect above will reopen
    // the dialog automatically if there's another queued fault.
    setQueueCodes(remaining);
  }, [currentFault, queueCodes]);

  // Allow snooze to expire so the fault can pop again later if still active.
  // We clear it lazily inside the sync effect above; nothing to do here.

  if (!currentFault) return null;

  // Build the fault image URL through authenticated asset serving
  const normalizedFaultCode = normalizeFaultCodeForAsset(currentFault.code ?? '');
  const qrImagePath = normalizedFaultCode
    ? (() => {
        const variant = FAULT_IMAGE_VARIANTS[imageVariantIndex];
        const ext = FAULT_IMAGE_EXTENSIONS[imageExtIndex];
        const suffix = variant ? `-${variant}` : '';
        return getAuthenticatedAssetUrl(`fault-codes/${normalizedFaultCode}${suffix}.${ext}`);
      })()
    : '';

  const isLastFault = queueCodes.length <= 1;

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(next) => {
      // Only honour "open=true" requests from us. If Radix tries to close
      // (e.g., ESC), treat it as a dismiss so the queue advances.
      if (!next && open) {
        handleDismiss();
      } else {
        setOpen(next);
      }
    }}>
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
                if (imageVariantIndex < FAULT_IMAGE_VARIANTS.length - 1) {
                  setImageVariantIndex((prev) => prev + 1);
                } else if (imageExtIndex < FAULT_IMAGE_EXTENSIONS.length - 1) {
                  setImageVariantIndex(0);
                  setImageExtIndex((prev) => prev + 1);
                }
              }}
            />
            {/* Invisible clickable hotspot over the OK button area in the image.
                NOTE: We intentionally use a plain <button> here, NOT
                AlertDialogPrimitive.Action — Action triggers Radix's internal
                close, which then re-fires onOpenChange(false) and would cause
                handleDismiss() to run twice (skipping the next queued fault,
                e.g. dismissing Makeup would also skip past Cooling). */}
            <button
              type="button"
              className="absolute cursor-pointer bg-transparent"
              style={{ right: '8%', bottom: '4%', width: '25%', height: '12%' }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDismiss();
              }}
            >
              <span className="sr-only">
                {!isLastFault ? 'Next Fault' : 'OK'}
              </span>
            </button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
