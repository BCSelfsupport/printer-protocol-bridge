DROP POLICY IF EXISTS "Service role reads proprietary assets" ON storage.objects;
CREATE POLICY "Service role reads proprietary assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'proprietary-assets' AND false);