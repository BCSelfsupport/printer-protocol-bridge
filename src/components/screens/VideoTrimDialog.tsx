import { useCallback, useEffect, useRef, useState } from 'react';
import { Scissors, Loader2, SkipBack, SkipForward, Crop } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { editVideo, probeVideo } from '@/lib/videoEditor';
import type { TrainingVideoRecord } from '@/lib/trainingVideoLibrary';

interface Props {
  video: TrainingVideoRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const clock = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
};

/** Trim / crop an already-published training video and replace it in the library. */
export function VideoTrimDialog({ video, open, onOpenChange, onSaved }: Props) {
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [cropTopPx, setCropTopPx] = useState(0);
  const [addSplash, setAddSplash] = useState(true);

  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  // Load the published file into memory so it can be re-encoded locally
  useEffect(() => {
    if (!open || !video) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(video.video_url);
        if (!res.ok) throw new Error('Could not download the video');
        const blob = await res.blob();
        const meta = await probeVideo(blob);
        if (cancelled) return;
        // Some recorded webm files report no duration; fall back to the stored value.
        const dur = meta.duration > 0.3 ? meta.duration : (video.duration_seconds ?? 0);
        if (!(dur > 0.3)) {
          throw new Error('Could not read this video’s length, so trimming is disabled for it');
        }
        objectUrl = URL.createObjectURL(blob);
        setSourceBlob(blob);
        setSourceUrl(objectUrl);
        setDuration(dur);
        setNaturalHeight(meta.height);
        setTrimStart(0);
        setTrimEnd(dur);
        setCropTopPx(0);
      } catch (err: any) {
        toast.error('Load failed: ' + err.message);
        onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setSourceBlob(null);
      setSourceUrl(null);
    };
  }, [open, video?.id]);

  const seek = useCallback((t: number) => {
    if (previewRef.current) previewRef.current.currentTime = Math.max(0, t);
  }, []);

  const trimmed = trimStart > 0.05 || (duration > 0 && trimEnd < duration - 0.05);
  const hasEdit = trimmed || cropTopPx > 0;

  const applyAndSave = async () => {
    if (!video || !sourceBlob) return;
    setWorking(true);
    setProgress(0);
    try {
      const edited = await editVideo(
        sourceBlob,
        {
          cropTopPx,
          startSec: trimStart,
          endSec: trimEnd,
          introTitle: addSplash ? video.title : undefined,
          introSubtitle: addSplash ? (video.description?.trim() || undefined) : undefined,
          outro: addSplash,
        },
        pct => setProgress(pct),
      );


      // Safety: never replace the published file with a short/unplayable clip.
      const expected = Math.max(0.5, trimEnd - trimStart);
      const check = await probeVideo(edited);
      if (!edited.size || !(check.duration > 0.3)) {
        throw new Error('The trimmed clip came out empty — nothing was replaced. Try again.');
      }
      if (check.duration < expected * 0.7) {
        throw new Error(
          `Only ${check.duration.toFixed(1)}s of the expected ${expected.toFixed(1)}s was captured — nothing was replaced. Keep this tab visible while trimming and try again.`,
        );
      }

      const filePath = `videos/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('training-videos')
        .upload(filePath, edited, { contentType: 'video/webm', upsert: false });
      if (uploadError) throw uploadError;

      const { error } = await supabase.functions.invoke('training-videos', {
        method: 'PATCH',
        body: {
          id: video.id,
          file_path: filePath,
          duration_seconds: Math.max(1, Math.round(check.duration)),
          file_size_bytes: edited.size,
        },
      });
      if (error) throw error;

      toast.success('Video updated');
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error('Edit failed: ' + err.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !working && onOpenChange(o)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="w-4 h-4" />
            Trim “{video?.title}”
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading video…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative bg-black rounded-md overflow-hidden">
              <video
                ref={previewRef}
                src={sourceUrl ?? undefined}
                controls
                onLoadedMetadata={e => setNaturalHeight((e.target as HTMLVideoElement).videoHeight)}
                className="w-full max-h-[420px] block mx-auto"
              />
              {cropTopPx > 0 && naturalHeight > 0 && (
                <div
                  className="pointer-events-none absolute top-0 left-0 right-0 bg-destructive/60 border-b-4 border-destructive"
                  style={{ height: `${(cropTopPx / naturalHeight) * 100}%` }}
                />
              )}
            </div>

            {/* Trim */}
            <div className="space-y-3 border border-dashed border-border rounded-md p-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <Scissors className="w-3 h-3" /> Trim start / end
                </Label>
                <span className="text-xs font-mono font-semibold">
                  {clock(trimStart)} → {clock(trimEnd)}
                  <span className="text-muted-foreground ml-1">
                    ({Math.max(0, trimEnd - trimStart).toFixed(1)}s)
                  </span>
                </span>
              </div>
              <Slider
                value={[trimStart, trimEnd]}
                onValueChange={v => {
                  const [a, b] = v;
                  if (a !== trimStart) { setTrimStart(Math.min(a, trimEnd - 0.2)); seek(a); }
                  if (b !== trimEnd) { setTrimEnd(Math.max(b, trimStart + 0.2)); seek(b); }
                }}
                min={0}
                max={duration || 1}
                step={0.1}
                disabled={working || duration <= 0}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" disabled={working}
                  onClick={() => setTrimStart(Math.min(previewRef.current?.currentTime ?? 0, trimEnd - 0.2))}
                >
                  <SkipBack className="w-3 h-3" /> Set start here
                </Button>
                <Button
                  size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" disabled={working}
                  onClick={() => setTrimEnd(Math.max(previewRef.current?.currentTime ?? duration, trimStart + 0.2))}
                >
                  <SkipForward className="w-3 h-3" /> Set end here
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={working}
                  onClick={() => { setTrimStart(0); setTrimEnd(duration); seek(0); }}
                >
                  Reset
                </Button>
              </div>
            </div>

            {/* Crop top */}
            <div className="space-y-2 border border-dashed border-border rounded-md p-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <Crop className="w-3 h-3" /> Crop top
                </Label>
                <span className="text-xs font-mono font-semibold">{cropTopPx}px</span>
              </div>
              <Slider
                value={[cropTopPx]}
                onValueChange={v => setCropTopPx(v[0])}
                min={0}
                max={Math.max(300, Math.floor((naturalHeight || 1080) / 2))}
                step={1}
                disabled={working}
              />
            </div>

            {/* Branded cards */}
            <label className="flex items-start gap-2 text-xs border border-dashed border-border rounded-md p-3 bg-muted/20">
              <input
                type="checkbox"
                checked={addSplash}
                onChange={e => setAddSplash(e.target.checked)}
                disabled={working}
                className="mt-0.5 accent-primary"
              />
              <span>
                Add branded opening card (“{video?.title}”) and a BestCode CodeSync closing card
                <span className="block text-[10px] text-muted-foreground">
                  Adds about 9 seconds total around the trimmed clip, held long enough to read.
                </span>
              </span>
            </label>

            <div className="flex items-center gap-2">
              <Button onClick={applyAndSave} disabled={working || (!hasEdit && !addSplash)} className="gap-2">
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
                {working ? `Processing ${progress.toFixed(0)}%` : 'Apply & Replace Video'}
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={working}>
                Cancel
              </Button>
              <p className="text-[10px] text-muted-foreground flex-1">
                Re-encodes in the browser and replaces the published file.
              </p>
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
