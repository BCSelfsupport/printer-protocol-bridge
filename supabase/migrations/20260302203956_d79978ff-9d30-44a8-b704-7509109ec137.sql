
-- Create a private storage bucket for proprietary assets (fonts, templates, fault codes)
INSERT INTO storage.buckets (id, name, public)
VALUES ('proprietary-assets', 'proprietary-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Only the service role can manage files in this bucket (uploads/deletes)
CREATE POLICY "Service role manages proprietary assets"
ON storage.objects
FOR ALL
USING (bucket_id = 'proprietary-assets' AND false)
WITH CHECK (bucket_id = 'proprietary-assets' AND false);

-- Allow public SELECT so the edge function (using service role) can read files
-- The edge function itself handles license validation before returning data
CREATE POLICY "Service role reads proprietary assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'proprietary-assets');
