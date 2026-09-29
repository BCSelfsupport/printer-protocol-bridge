DROP POLICY IF EXISTS "Anyone can submit valid feedback" ON public.feedback;
CREATE POLICY "Anyone can submit valid feedback" ON public.feedback FOR INSERT TO anon, authenticated
WITH CHECK (
  type IN ('bug','feature','feedback','general','other')
  AND char_length(btrim(message)) BETWEEN 1 AND 2000
  AND (app_version IS NULL OR char_length(app_version) <= 50)
  AND (screenshot_urls IS NULL OR coalesce(array_length(screenshot_urls,1),0) <= 3)
);