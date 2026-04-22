import { useState, useCallback, useEffect } from 'react';
import { Video, Upload, Loader2, Trash2, Play, Clock, AlertCircle, Download, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ScreenRecorderState, ScreenRecorderActions } from '@/hooks/useScreenRecorder';

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

interface TrainingVideoRecorderProps {
  recorderState: ScreenRecorderState;
  recorderActions: ScreenRecorderActions;
}

export function TrainingVideoRecorder({ recorderState, recorderActions }: TrainingVideoRecorderProps) {
  const { isRecording, elapsed, recordedBlob, recordedUrl, isMicEnabled } = recorderState;
  const { startRecording, stopRecording, discardRecording: discardRaw, toggleMic } = recorderActions;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [uploading, setUploading] = useState(false);
  const [videos, setVideos] = useState<TrainingVideo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVideos = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('training-videos', {
        method: 'GET',
      });
      if (error) throw error;
      setVideos(data || []);
    } catch (err) {
      console.error('Failed to fetch videos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const discardRecording = () => {
    discardRaw();
    setTitle('');
    setDescription('');
  };

  const handleStartRecording = async () => {
    try {
      await startRecording();
    } catch (err: any) {
      toast.error('Failed to start recording: ' + err.message);
    }
  };

  const captureThumbnail = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!recordedUrl) return resolve(null);
      const video = document.createElement('video');
      video.src = recordedUrl;
      video.currentTime = 1;
      video.muted = true;
      video.onloadeddata = () => { video.currentTime = 1; };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, 320, 180);
          canvas.toBlob(blob => resolve(blob), 'image/png');
        } else { resolve(null); }
      };
      video.onerror = () => resolve(null);
    });
  };

  const uploadVideo = async () => {
    if (!recordedBlob || !title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    setUploading(true);
    try {
      const timestamp = Date.now();
      const filePath = `videos/${timestamp}.webm`;

      // Upload video directly to storage (bypasses edge function payload limits)
      const { error: uploadError } = await supabase.storage
        .from('training-videos')
        .upload(filePath, recordedBlob, {
          contentType: 'video/webm',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      // Upload thumbnail directly
      const thumbnail = await captureThumbnail();
      let thumbnailPath: string | null = null;
      if (thumbnail) {
        thumbnailPath = `thumbnails/${timestamp}.png`;
        const { error: thumbError } = await supabase.storage
          .from('training-videos')
          .upload(thumbnailPath, thumbnail, {
            contentType: 'image/png',
            upsert: false,
          });
        if (thumbError) {
          console.warn('Thumbnail upload failed:', thumbError);
          thumbnailPath = null;
        }
      }

      // Register metadata via edge function
      const { error } = await supabase.functions.invoke('training-videos', {
        method: 'POST',
        body: {
          title: title.trim(),
          description: description.trim() || null,
          category,
          duration_seconds: elapsed,
          file_path: filePath,
          thumbnail_path: thumbnailPath,
          file_size_bytes: recordedBlob.size,
        },
      });
      if (error) throw error;
      toast.success(`Video uploaded (${(recordedBlob.size / (1024 * 1024)).toFixed(1)} MB)`);
      discardRecording();
      fetchVideos();
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteVideo = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke('training-videos', {
        method: 'DELETE',
        body: { id },
      });
      if (error) throw error;
      toast.success('Video deleted');
      fetchVideos();
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '--';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <ScrollArea className="h-full p-4">
      <div className="space-y-4">
        {/* Recorder Section */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Screen Recorder
          </h3>

          {!recordedBlob && !isRecording && (
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleStartRecording} className="gap-2">
                <Video className="w-4 h-4" />
                Start Recording
              </Button>
              <Button
                size="sm"
                variant={isMicEnabled ? "default" : "outline"}
                onClick={toggleMic}
                className="gap-1.5"
                title={isMicEnabled ? "Microphone ON — click to mute" : "Microphone OFF — click to enable"}
              >
                {isMicEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                {isMicEnabled ? 'Mic On' : 'Mic Off'}
              </Button>
            </div>
          )}

          {isRecording && (
            <p className="text-xs text-muted-foreground">
              <AlertCircle className="w-3 h-3 inline mr-1" />
              Recording in progress — close the Dev Panel to capture the screen. Use the floating stop button to finish.
            </p>
          )}

          {/* Preview & Upload */}
          {recordedBlob && recordedUrl && (
            <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/30">
              <video
                src={recordedUrl}
                controls
                className="w-full rounded-md max-h-[200px] bg-black"
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatTime(elapsed)} • {formatFileSize(recordedBlob.size)}
              </div>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Title *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How to Create a Message" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-8 text-sm rounded-md border border-input bg-background px-2">
                    <option value="general">General</option>
                    <option value="setup">Setup</option>
                    <option value="messages">Messages</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="troubleshooting">Troubleshooting</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={uploadVideo} disabled={uploading || !title.trim()} className="gap-2">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? 'Uploading...' : 'Save Video'}
                </Button>
                <Button size="sm" variant="ghost" onClick={discardRecording}>Discard</Button>
              </div>
            </div>
          )}

          {!isRecording && !recordedBlob && (
            <p className="text-xs text-muted-foreground">
              <AlertCircle className="w-3 h-3 inline mr-1" />
              Click "Start Recording" to capture your screen. Max 5 minutes, no audio. A floating stop button will appear so you can close this panel during recording.
            </p>
          )}
        </div>

        {/* Video Library Management */}
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Video Library ({videos.length}/10)
          </h3>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading...
            </div>
          ) : videos.length === 0 ? (
            <p className="text-xs text-muted-foreground">No videos recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {videos.map((v) => (
                <div key={v.id} className="flex items-center gap-3 p-2 rounded-md border border-border bg-muted/20">
                  <div className="w-16 h-9 bg-black rounded overflow-hidden flex-shrink-0">
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Play className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{v.title}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{v.category}</Badge>
                      {v.duration_seconds && <span>{formatTime(v.duration_seconds)}</span>}
                      <span>{formatFileSize(v.file_size_bytes)}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      try {
                        const res = await fetch(v.video_url);
                        if (!res.ok) throw new Error('Download failed');
                        const blob = await res.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = blobUrl;
                        a.download = `${v.title}.webm`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(blobUrl);
                      } catch (err) {
                        console.error('Download failed:', err);
                        window.open(v.video_url, '_blank');
                      }
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteVideo(v.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
