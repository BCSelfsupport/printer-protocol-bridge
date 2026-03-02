import { Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RecordingOverlayProps {
  elapsed: number;
  onStop: () => void;
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export function RecordingOverlay({ elapsed, onStop }: RecordingOverlayProps) {
  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-destructive text-destructive-foreground px-4 py-2 rounded-full shadow-lg animate-pulse">
      <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
      <span className="text-sm font-mono font-medium">{formatTime(elapsed)}</span>
      <Button
        size="sm"
        variant="secondary"
        className="h-7 gap-1.5 rounded-full text-xs"
        onClick={onStop}
      >
        <Square className="w-3 h-3" />
        Stop
      </Button>
    </div>
  );
}
