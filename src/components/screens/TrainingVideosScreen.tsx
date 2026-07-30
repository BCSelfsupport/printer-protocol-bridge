import { useState, useEffect, useCallback, useMemo } from 'react';
import { Play, Film, Download, Link2, Video, Search, BookOpen, LayoutGrid, Scissors, Undo2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { TrainingVideoRecorder } from '@/components/dev/TrainingVideoRecorder';
import { VideoTrimDialog } from './VideoTrimDialog';
import type { ScreenRecorderState, ScreenRecorderActions } from '@/hooks/useScreenRecorder';
import {
  CATEGORY_LABELS,
  fetchTrainingVideos,
  formatVideoTime,
  groupVideosByChapter,
  manualSectionTitle,
  type TrainingVideoRecord,
} from '@/lib/trainingVideoLibrary';

interface TrainingVideosScreenProps {
  onBack: () => void;
  recorderState?: ScreenRecorderState;
  recorderActions?: ScreenRecorderActions;
}

export function TrainingVideosScreen({ onBack, recorderState, recorderActions }: TrainingVideosScreenProps) {
  const [videos, setVideos] = useState<TrainingVideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<TrainingVideoRecord | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [groupByManual, setGroupByManual] = useState(true);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [trimOpen, setTrimOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);


  // Auto-close the dialog as soon as countdown begins or recording starts
  // (so screen capture doesn't show this dialog), and reopen once a blob is ready.
  useEffect(() => {
    if (!recorderState) return;
    if (recorderState.countdown > 0 || recorderState.isRecording) {
      setRecordDialogOpen(false);
    } else if (recorderState.recordedBlob) {
      setRecordDialogOpen(true);
    }
  }, [recorderState?.countdown, recorderState?.isRecording, recorderState?.recordedBlob]);

  const loadVideos = useCallback(async () => {
    try {
      setVideos(await fetchTrainingVideos());
    } catch (err) {
      console.error('Failed to fetch training videos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  const categories = ['all', ...Array.from(new Set(videos.map(v => v.category).filter(Boolean)))];

  const filteredVideos = useMemo(() => {
    const q = search.trim().toLowerCase();
    return videos.filter(v => {
      if (filterCategory !== 'all' && v.category !== filterCategory) return false;
      if (!q) return true;
      const topic = manualSectionTitle(v.manual_chapter_id, v.manual_section_id) ?? '';
      return (
        v.title.toLowerCase().includes(q) ||
        (v.description ?? '').toLowerCase().includes(q) ||
        topic.toLowerCase().includes(q)
      );
    });
  }, [videos, filterCategory, search]);

  const groups = useMemo(() => groupVideosByChapter(filteredVideos), [filteredVideos]);

  // Full-screen video player
  if (selectedVideo) {
    const topic = manualSectionTitle(selectedVideo.manual_chapter_id, selectedVideo.manual_section_id);
    return (
      <div className="flex flex-col h-full bg-background">
        <SubPageHeader title={selectedVideo.title} onHome={() => setSelectedVideo(null)} />
        <div className="flex-1 flex flex-col items-center justify-center p-4 bg-black">
          <video src={selectedVideo.video_url} controls autoPlay className="w-full max-h-[70vh] rounded-lg" />
        </div>
        <div className="p-4 border-t border-border flex items-start justify-between gap-4">
          <div className="space-y-1">
            {topic && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BookOpen className="w-3.5 h-3.5" />
                {topic}
              </div>
            )}
            {selectedVideo.description && (
              <p className="text-sm text-muted-foreground">{selectedVideo.description}</p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {selectedVideo.previous_file_path && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={async () => {
                  try {
                    const { error } = await supabase.functions.invoke('training-videos', {
                      method: 'PATCH',
                      body: {
                        id: selectedVideo.id,
                        file_path: selectedVideo.previous_file_path,
                        previous_file_path: null,
                      },
                    });
                    if (error) throw error;
                    toast.success('Restored the version before the last trim');
                    setSelectedVideo(null);
                    setLoading(true);
                    await loadVideos();
                  } catch (err: any) {
                    toast.error('Restore failed: ' + err.message);
                  }
                }}
              >
                <Undo2 className="w-4 h-4" />
                Undo Trim
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setTrimOpen(true)}>
              <Scissors className="w-4 h-4" />
              Trim / Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => {
                navigator.clipboard.writeText(selectedVideo.video_url);
                toast.success('Link copied to clipboard');
              }}
            >
              <Link2 className="w-4 h-4" />
              Copy Link
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={async () => {
                try {
                  const res = await fetch(selectedVideo.video_url);
                  if (!res.ok) throw new Error('Download failed');
                  const blob = await res.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = `${selectedVideo.title}.webm`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(blobUrl);
                } catch (err) {
                  console.error('Download failed:', err);
                  toast.error('Download failed, opening in new tab');
                  window.open(selectedVideo.video_url, '_blank');
                }
              }}
            >
              <Download className="w-4 h-4" />
              Download
            </Button>
          </div>
        </div>

        <VideoTrimDialog
          video={selectedVideo}
          open={trimOpen}
          onOpenChange={setTrimOpen}
          onSaved={async () => {
            setSelectedVideo(null);
            setLoading(true);
            await loadVideos();
          }}
        />
      </div>
    );
  }

  const renderGrid = (items: TrainingVideoRecord[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map(video => (
        <VideoCard key={video.id} video={video} onPlay={() => setSelectedVideo(video)} />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-background">
      <SubPageHeader title="Training Library" onHome={onBack} />

      {/* Action bar */}
      <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-border bg-muted/20">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search videos or manual topics…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-2 h-8 text-xs"
          onClick={() => setGroupByManual(v => !v)}
        >
          {groupByManual ? <BookOpen className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
          {groupByManual ? 'By manual topic' : 'All videos'}
        </Button>
        {recorderState && recorderActions && (
          <Button size="sm" onClick={() => setRecordDialogOpen(true)} className="gap-2 h-8">
            <Video className="w-4 h-4" />
            Record Video
          </Button>
        )}
      </div>

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
          <div className="flex items-center justify-center h-40 text-muted-foreground">Loading videos...</div>
        ) : filteredVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Film className="w-8 h-8" />
            <p className="text-sm">
              {videos.length === 0 ? 'No training videos available yet.' : 'No videos match your search.'}
            </p>
          </div>
        ) : groupByManual ? (
          <div className="p-4 space-y-6">
            {groups.map(group => (
              <section key={group.key}>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">{group.title}</h2>
                  <span className="text-xs text-muted-foreground">({group.videos.length})</span>
                </div>
                {renderGrid(group.videos)}
              </section>
            ))}
          </div>
        ) : (
          <div className="p-4">{renderGrid(filteredVideos)}</div>
        )}
      </ScrollArea>

      {/* Record-your-own dialog */}
      {recorderState && recorderActions && (
        <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
            <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
              <DialogTitle className="flex items-center gap-2">
                <Video className="w-4 h-4" />
                Record Training Video
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-[400px] overflow-y-auto">
              <TrainingVideoRecorder recorderState={recorderState} recorderActions={recorderActions} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function VideoCard({ video, onPlay }: { video: TrainingVideoRecord; onPlay: () => void }) {
  const topic = manualSectionTitle(video.manual_chapter_id, video.manual_section_id);
  return (
    <button
      onClick={onPlay}
      className="text-left border border-border rounded-lg overflow-hidden bg-card hover:bg-accent/50 transition-colors group"
    >
      <div className="relative aspect-video bg-black">
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-10 h-10 text-muted-foreground/50" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="w-6 h-6 text-black ml-0.5" />
          </div>
        </div>
        {video.duration_seconds ? (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
            {formatVideoTime(video.duration_seconds)}
          </div>
        ) : null}
      </div>
      <div className="p-3">
        <h3 className="font-medium text-sm text-foreground line-clamp-2">{video.title}</h3>
        {video.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{video.description}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {CATEGORY_LABELS[video.category] || video.category}
          </Badge>
          {topic && (
            <Badge variant="secondary" className="text-[10px] max-w-full truncate">
              {topic}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}
