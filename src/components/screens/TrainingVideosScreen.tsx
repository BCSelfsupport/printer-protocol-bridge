import { useState, useEffect, useCallback } from 'react';
import { Play, Clock, Film, ChevronLeft, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SubPageHeader } from '@/components/layout/SubPageHeader';

interface TrainingVideo {
  id: string;
  title: string;
  description: string | null;
  category: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  video_url: string;
  thumbnail_url: string | null;
  created_at: string;
}

interface TrainingVideosScreenProps {
  onBack: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  setup: 'Setup',
  messages: 'Messages',
  maintenance: 'Maintenance',
  troubleshooting: 'Troubleshooting',
};

export function TrainingVideosScreen({ onBack }: TrainingVideosScreenProps) {
  const [videos, setVideos] = useState<TrainingVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<TrainingVideo | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const fetchVideos = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('training-videos', {
        method: 'GET',
      });
      if (error) throw error;
      setVideos(data || []);
    } catch (err) {
      console.error('Failed to fetch training videos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const formatTime = (s: number | null) => {
    if (!s) return '--:--';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const categories = ['all', ...new Set(videos.map(v => v.category))];
  const filteredVideos = filterCategory === 'all' ? videos : videos.filter(v => v.category === filterCategory);

  // Full-screen video player
  if (selectedVideo) {
    return (
      <div className="flex flex-col h-full bg-background">
        <SubPageHeader title={selectedVideo.title} onHome={() => setSelectedVideo(null)} />
        <div className="flex-1 flex flex-col items-center justify-center p-4 bg-black">
          <video
            src={selectedVideo.video_url}
            controls
            autoPlay
            className="w-full max-h-[70vh] rounded-lg"
          />
        </div>
        {selectedVideo.description && (
          <div className="p-4 border-t border-border">
            <p className="text-sm text-muted-foreground">{selectedVideo.description}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <SubPageHeader title="Training Videos" onHome={onBack} />

      {/* Category filter */}
      {categories.length > 2 && (
        <div className="px-4 py-2 flex gap-2 overflow-x-auto border-b border-border">
          {categories.map(cat => (
            <Button
              key={cat}
              size="sm"
              variant={filterCategory === cat ? 'default' : 'outline'}
              className="text-xs h-7 flex-shrink-0"
              onClick={() => setFilterCategory(cat)}
            >
              {cat === 'all' ? 'All' : CATEGORY_LABELS[cat] || cat}
            </Button>
          ))}
        </div>
      )}

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            Loading videos...
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Film className="w-8 h-8" />
            <p className="text-sm">No training videos available yet.</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVideos.map(video => (
              <button
                key={video.id}
                onClick={() => setSelectedVideo(video)}
                className="text-left border border-border rounded-lg overflow-hidden bg-card hover:bg-accent/50 transition-colors group"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-black">
                  {video.thumbnail_url ? (
                    <img
                      src={video.thumbnail_url}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-10 h-10 text-muted-foreground/50" />
                    </div>
                  )}
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="w-6 h-6 text-black ml-0.5" />
                    </div>
                  </div>
                  {/* Duration badge */}
                  {video.duration_seconds && (
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                      {formatTime(video.duration_seconds)}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <h3 className="font-medium text-sm text-foreground line-clamp-2">{video.title}</h3>
                  {video.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{video.description}</p>
                  )}
                  <div className="mt-2">
                    <Badge variant="outline" className="text-[10px]">
                      {CATEGORY_LABELS[video.category] || video.category}
                    </Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
