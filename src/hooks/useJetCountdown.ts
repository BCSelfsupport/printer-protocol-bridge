import { useState, useCallback, useEffect, useRef } from 'react';

export type CountdownType = 'starting' | 'stopping' | null;

interface UseJetCountdownReturn {
  countdownSeconds: number | null;
  countdownType: CountdownType;
  startCountdown: (type: CountdownType, durationSeconds?: number) => void;
  cancelCountdown: () => void;
  isCountingDown: boolean;
}

// Default countdown duration: 1:46 = 106 seconds
const DEFAULT_COUNTDOWN_SECONDS = 106;

export function useJetCountdown(): UseJetCountdownReturn {
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [countdownType, setCountdownType] = useState<CountdownType>(null);
  const intervalRef = useRef<number | null>(null);

  const cancelCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCountdownSeconds(null);
    setCountdownType(null);
  }, []);

  const startCountdown = useCallback((type: CountdownType, durationSeconds: number = DEFAULT_COUNTDOWN_SECONDS) => {
    // Cancel any existing countdown
    cancelCountdown();
    
    if (!type) return;
    
    setCountdownType(type);
    setCountdownSeconds(durationSeconds);
    
    intervalRef.current = window.setInterval(() => {
      setCountdownSeconds(prev => {
        if (prev === null || prev <= 1) {
          // Countdown complete
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setCountdownType(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [cancelCountdown]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    countdownSeconds,
    countdownType,
    startCountdown,
    cancelCountdown,
    isCountingDown: countdownSeconds !== null && countdownSeconds > 0,
  };
}
