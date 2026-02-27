
-- Add screenshot URLs column to feedback
ALTER TABLE public.feedback ADD COLUMN screenshot_urls TEXT[] DEFAULT '{}';

-- Create storage bucket for feedback screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('feedback-screenshots', 'feedback-screenshots', false);

-- Anyone can upload screenshots (no auth for beta)
CREATE POLICY "Anyone can upload feedback screenshots"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'feedback-screenshots');

-- Only service role can read screenshots (for dev panel via edge function)
CREATE POLICY "Service role only read feedback screenshots"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'feedback-screenshots' AND false);
