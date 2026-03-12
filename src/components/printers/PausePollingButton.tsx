import { useState, useEffect } from 'react';
import { Pause, Play } from 'lucide-react';
import { isPollingPaused, onPollingPauseChange, relaySetPollingPaused } from '@/lib/pollingPause';
import { isRelayMode } from '@/lib/printerTransport';
import { toast } from 'sonner';

/**
 * Floating button shown on mobile (relay mode) to pause/resume
 * TCP polling on the PC, so users can edit settings on the printer's
 * local HMI without commands interrupting their changes.
 */
export function PausePollingButton() {
  const [paused, setPaused] = useState(isPollingPaused);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return onPollingPauseChange(setPaused);
  }, []);

  // Only show in relay mode (mobile companion)
  if (!isRelayMode()) return null;

  const handleToggle = async () => {
    setLoading(true);
    const newState = !paused;
    const ok = await relaySetPollingPaused(newState);
    setLoading(false);
    if (ok) {
      toast.success(newState ? 'Polling paused — safe to edit printer HMI' : 'Polling resumed');
    } else {
      toast.error('Failed to reach PC — check relay connection');
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
        paused
          ? 'bg-warning text-warning-foreground animate-pulse'
          : 'industrial-button text-white'
      }`}
      title={paused ? 'Resume polling' : 'Pause polling (for HMI editing)'}
    >
      {paused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
    </button>
  );
}
