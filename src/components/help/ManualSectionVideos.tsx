import { useEffect, useState } from 'react';
import { Play, Film, Clock } from 'lucide-react';
import {
  fetchTrainingVideos,
  formatVideoTime,
  videosForSection,
  type TrainingVideoRecord,
} from '@/lib/trainingVideoLibrary';

let cache: TrainingVideoRecord[] | null = null;

/**
 * Training videos attached to the current manual section.
 * Renders nothing while loading or when no video is linked.
 */
export function ManualSectionVideos({
  chapterId,
  sectionId,
}: {
  chapterId: string;
  sectionId: string;
}) {
  const [videos, setVideos] = useState<TrainingVideoRecord[]>(cache ?? []);
  const [playing, setPlaying] = useState<TrainingVideoRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (cache) {
      setVideos(cache);
      return;
    }
    fetchTrainingVideos()
      .then(list => {
        cache = list;
        if (!cancelled) setVideos(list);
      })
      .catch(err => console.error('Manual video fetch failed:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => setPlaying(null), [chapterId, sectionId]);

  const matches = videosForSection(videos, chapterId, sectionId);
  if (matches.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Film className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Training videos for this topic</h3>
      </div>

      {playing && (
        <video src={playing.video_url} controls autoPlay className="w-full rounded-md bg-black" />
      )}

      <div className="space-y-2">
        {matches.map(video => (
          <button
            key={video.id}
            onClick={() => setPlaying(video)}
            className="w-full flex items-center gap-3 text-left rounded-md border border-border bg-card px-3 py-2 hover:bg-accent/50 transition-colors"
          >
            <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Play className="w-4 h-4 text-primary ml-0.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground truncate">{video.title}</span>
              {video.description && (
                <span className="block text-xs text-muted-foreground truncate">{video.description}</span>
              )}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground flex-shrink-0">
              <Clock className="w-3 h-3" />
              {formatVideoTime(video.duration_seconds)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
