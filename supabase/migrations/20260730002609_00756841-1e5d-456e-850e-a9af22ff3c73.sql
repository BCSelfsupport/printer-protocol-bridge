ALTER TABLE public.training_videos
  ADD COLUMN IF NOT EXISTS manual_chapter_id text,
  ADD COLUMN IF NOT EXISTS manual_section_id text;

CREATE INDEX IF NOT EXISTS training_videos_manual_idx
  ON public.training_videos (manual_chapter_id, manual_section_id);