import { Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RecordingOverlayProps {
  elapsed: number;
  onStop: () => void;
}

/**
 * Bottom edge of the recording overlay in CSS pixels.
 * The video editor uses this to work out how much of the top of the frame has
 * to be cropped away so the red stop pill never shows in the saved video.
 */
export const RECORDING_OVERLAY_BOTTOM_PX = 34;

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export function RecordingOverlay({ elapsed, onStop }: RecordingOverlayProps) {
  return (
    <div className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 h-[30px] bg-destructive text-destructive-foreground px-3 rounded-b-md shadow-lg">
      <div className="w-2 h-2 rounded-full bg-destructive-foreground animate-pulse" />
      <span className="text-[11px] font-mono font-medium leading-none">{formatTime(elapsed)}</span>
      <Button
        size="sm"
        variant="secondary"
        className="h-5 gap-1 rounded-sm px-1.5 text-[10px] leading-none"
        onClick={onStop}
      >
        <Square className="w-2.5 h-2.5" />
        Stop
      </Button>
    </div>
  );
}
