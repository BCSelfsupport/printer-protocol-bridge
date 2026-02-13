import { useState, useCallback, useEffect, useRef } from 'react';

export type CountdownType = 'starting' | 'stopping' | null;

interface PrinterCountdown {
  seconds: number;
  type: CountdownType;
}

interface UseJetCountdownReturn {
  /** Get countdown for a specific printer (null if none active) */
  getCountdown: (printerId: number) => { seconds: number | null; type: CountdownType };
  /** Start a countdown for a specific printer */
  startCountdown: (printerId: number, type: CountdownType, durationSeconds?: number) => void;
  /** Cancel countdown for a specific printer */
  cancelCountdown: (printerId: number) => void;
  /** Legacy: get countdown for connected printer */
  countdownSeconds: number | null;
  countdownType: CountdownType;
  isCountingDown: boolean;
}

// Default countdown duration: 1:06 = 66 seconds
const DEFAULT_COUNTDOWN_SECONDS = 66;

export function useJetCountdown(
  connectedPrinterId?: number | null,
  onComplete?: (printerId: number, type: CountdownType) => void,
): UseJetCountdownReturn {
  // Map of printerId -> countdown state
  const [countdowns, setCountdowns] = useState<Record<number, PrinterCountdown>>({});
  const intervalsRef = useRef<Record<number, number>>({});
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const cancelCountdown = useCallback((printerId: number) => {
    if (intervalsRef.current[printerId]) {
      clearInterval(intervalsRef.current[printerId]);
      delete intervalsRef.current[printerId];
    }
    setCountdowns(prev => {
      const next = { ...prev };
      delete next[printerId];
      return next;
    });
  }, []);

  const startCountdown = useCallback((printerId: number, type: CountdownType, durationSeconds: number = DEFAULT_COUNTDOWN_SECONDS) => {
    // Cancel any existing countdown for this printer
    if (intervalsRef.current[printerId]) {
      clearInterval(intervalsRef.current[printerId]);
      delete intervalsRef.current[printerId];
    }

    if (!type) return;

    setCountdowns(prev => ({
      ...prev,
      [printerId]: { seconds: durationSeconds, type },
    }));

    intervalsRef.current[printerId] = window.setInterval(() => {
      setCountdowns(prev => {
        const current = prev[printerId];
        if (!current || current.seconds <= 1) {
          // Countdown complete — clean up
          clearInterval(intervalsRef.current[printerId]);
          delete intervalsRef.current[printerId];
          const next = { ...prev };
          delete next[printerId];
          // Fire onComplete callback
          if (current?.type) {
            setTimeout(() => onCompleteRef.current?.(printerId, current.type), 0);
          }
          return next;
        }
        return {
          ...prev,
          [printerId]: { ...current, seconds: current.seconds - 1 },
        };
      });
    }, 1000);
  }, []);

  const getCountdown = useCallback((printerId: number) => {
    const cd = countdowns[printerId];
    return {
      seconds: cd?.seconds ?? null,
      type: cd?.type ?? null,
    };
  }, [countdowns]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(intervalsRef.current).forEach(id => clearInterval(id));
    };
  }, []);

  // Legacy: provide countdown for the currently connected printer
  const connectedCd = connectedPrinterId ? countdowns[connectedPrinterId] : undefined;

  return {
    getCountdown,
    startCountdown,
    cancelCountdown,
    // Legacy accessors for connected printer
    countdownSeconds: connectedCd?.seconds ?? null,
    countdownType: connectedCd?.type ?? null,
    isCountingDown: (connectedCd?.seconds ?? 0) > 0,
  };
}
