DROP POLICY IF EXISTS "Anyone can view training videos" ON public.training_videos;
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback;
CREATE POLICY "Anyone can submit valid feedback" ON public.feedback FOR INSERT TO anon, authenticated
WITH CHECK (
  type IN ('bug','feature','general','other','question','improvement')
  AND char_length(btrim(message)) BETWEEN 1 AND 2000
  AND (app_version IS NULL OR char_length(app_version) <= 50)
  AND (screenshot_urls IS NULL OR coalesce(array_length(screenshot_urls,1),0) <= 3)
);
DROP POLICY IF EXISTS "Service role only read feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Service role reads proprietary assets" ON storage.objects;
DROP POLICY IF EXISTS "Service role manages proprietary assets" ON storage.objects;
DROP POLICY IF EXISTS "Service role delete training videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload feedback screenshots" ON storage.objects;
CREATE POLICY "Anyone can upload feedback screenshot images" ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'feedback-screenshots' AND lower(storage.extension(name)) IN ('png','jpg','jpeg','webp','gif') AND position('/' in name) = 0);
DROP POLICY IF EXISTS "Service role upload training videos" ON storage.objects;
CREATE POLICY "Upload training video files" ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'training-videos' AND (
  ((storage.foldername(name))[1] = 'videos' AND lower(storage.extension(name)) = 'webm')
  OR ((storage.foldername(name))[1] = 'thumbnails' AND lower(storage.extension(name)) = 'png')
));