
-- Create training_videos table
CREATE TABLE public.training_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  thumbnail_path TEXT,
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  category TEXT DEFAULT 'general',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.training_videos ENABLE ROW LEVEL SECURITY;

-- Everyone can view training videos (operators)
CREATE POLICY "Anyone can view training videos"
  ON public.training_videos FOR SELECT
  USING (true);

-- Only service role can manage (Dev Portal uses edge functions)
CREATE POLICY "Service role manages training videos"
  ON public.training_videos FOR ALL
  USING (false)
  WITH CHECK (false);

-- Trigger for updated_at
CREATE TRIGGER update_training_videos_updated_at
  BEFORE UPDATE ON public.training_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for training videos (public so operators can stream)
INSERT INTO storage.buckets (id, name, public) VALUES ('training-videos', 'training-videos', true);

-- Anyone can read training videos
CREATE POLICY "Public read access for training videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'training-videos');

-- Service role uploads only (via edge function)
CREATE POLICY "Service role upload training videos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'training-videos');

CREATE POLICY "Service role delete training videos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'training-videos');
