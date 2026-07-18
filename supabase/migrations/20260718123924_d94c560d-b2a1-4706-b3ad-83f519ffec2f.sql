
-- Helper: resolve the current license id from the x-license-key request header
CREATE OR REPLACE FUNCTION public.current_license_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id
  FROM public.licenses l
  WHERE l.product_key = COALESCE(
      NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-license-key',
      ''
    )
    AND l.is_active
    AND (l.expires_at IS NULL OR l.expires_at > now())
  LIMIT 1
$$;

-- Add license_id ownership columns
ALTER TABLE public.data_sources ADD COLUMN IF NOT EXISTS license_id uuid REFERENCES public.licenses(id) ON DELETE CASCADE;
ALTER TABLE public.print_jobs   ADD COLUMN IF NOT EXISTS license_id uuid REFERENCES public.licenses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_data_sources_license_id ON public.data_sources(license_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_license_id   ON public.print_jobs(license_id);
CREATE INDEX IF NOT EXISTS idx_data_source_rows_ds     ON public.data_source_rows(data_source_id);

-- Auto-stamp license_id from the caller's license header on insert
CREATE OR REPLACE FUNCTION public.set_license_id_from_header()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.license_id IS NULL THEN
    NEW.license_id := public.current_license_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_data_sources_set_license ON public.data_sources;
CREATE TRIGGER trg_data_sources_set_license
  BEFORE INSERT ON public.data_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_license_id_from_header();

DROP TRIGGER IF EXISTS trg_print_jobs_set_license ON public.print_jobs;
CREATE TRIGGER trg_print_jobs_set_license
  BEFORE INSERT ON public.print_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_license_id_from_header();

-- Replace policies with license-scoped variants
DROP POLICY IF EXISTS "License-gated read on data_sources"   ON public.data_sources;
DROP POLICY IF EXISTS "License-gated insert on data_sources" ON public.data_sources;
DROP POLICY IF EXISTS "License-gated update on data_sources" ON public.data_sources;
DROP POLICY IF EXISTS "License-gated delete on data_sources" ON public.data_sources;

CREATE POLICY "Owner license read on data_sources"   ON public.data_sources FOR SELECT USING (license_id IS NOT NULL AND license_id = public.current_license_id());
CREATE POLICY "Owner license insert on data_sources" ON public.data_sources FOR INSERT WITH CHECK (public.current_license_id() IS NOT NULL);
CREATE POLICY "Owner license update on data_sources" ON public.data_sources FOR UPDATE USING (license_id IS NOT NULL AND license_id = public.current_license_id()) WITH CHECK (license_id = public.current_license_id());
CREATE POLICY "Owner license delete on data_sources" ON public.data_sources FOR DELETE USING (license_id IS NOT NULL AND license_id = public.current_license_id());

DROP POLICY IF EXISTS "License-gated read on print_jobs"   ON public.print_jobs;
DROP POLICY IF EXISTS "License-gated insert on print_jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "License-gated update on print_jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "License-gated delete on print_jobs" ON public.print_jobs;

CREATE POLICY "Owner license read on print_jobs"   ON public.print_jobs FOR SELECT USING (license_id IS NOT NULL AND license_id = public.current_license_id());
CREATE POLICY "Owner license insert on print_jobs" ON public.print_jobs FOR INSERT WITH CHECK (public.current_license_id() IS NOT NULL);
CREATE POLICY "Owner license update on print_jobs" ON public.print_jobs FOR UPDATE USING (license_id IS NOT NULL AND license_id = public.current_license_id()) WITH CHECK (license_id = public.current_license_id());
CREATE POLICY "Owner license delete on print_jobs" ON public.print_jobs FOR DELETE USING (license_id IS NOT NULL AND license_id = public.current_license_id());

-- data_source_rows inherit ownership from parent data_source
DROP POLICY IF EXISTS "License-gated read on data_source_rows"   ON public.data_source_rows;
DROP POLICY IF EXISTS "License-gated insert on data_source_rows" ON public.data_source_rows;
DROP POLICY IF EXISTS "License-gated update on data_source_rows" ON public.data_source_rows;
DROP POLICY IF EXISTS "License-gated delete on data_source_rows" ON public.data_source_rows;

CREATE POLICY "Owner license read on data_source_rows" ON public.data_source_rows FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.data_sources ds WHERE ds.id = data_source_rows.data_source_id AND ds.license_id = public.current_license_id()));
CREATE POLICY "Owner license insert on data_source_rows" ON public.data_source_rows FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.data_sources ds WHERE ds.id = data_source_rows.data_source_id AND ds.license_id = public.current_license_id()));
CREATE POLICY "Owner license update on data_source_rows" ON public.data_source_rows FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.data_sources ds WHERE ds.id = data_source_rows.data_source_id AND ds.license_id = public.current_license_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.data_sources ds WHERE ds.id = data_source_rows.data_source_id AND ds.license_id = public.current_license_id()));
CREATE POLICY "Owner license delete on data_source_rows" ON public.data_source_rows FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.data_sources ds WHERE ds.id = data_source_rows.data_source_id AND ds.license_id = public.current_license_id()));
