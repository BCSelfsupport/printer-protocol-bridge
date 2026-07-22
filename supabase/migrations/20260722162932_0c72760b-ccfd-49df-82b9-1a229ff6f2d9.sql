
-- 1. Private schema for SECURITY DEFINER helpers so PostgREST does not expose them
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- 2. Move license helpers to private schema (still callable inside RLS policies via schema-qualified name)
CREATE OR REPLACE FUNCTION private.current_license_id()
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

CREATE OR REPLACE FUNCTION private.has_valid_license_header()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.licenses l
    WHERE l.product_key = COALESCE(
      NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-license-key',
      ''
    )
    AND l.is_active
    AND (l.expires_at IS NULL OR l.expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION private.set_license_id_from_header()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.license_id IS NULL THEN
    NEW.license_id := private.current_license_id();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. Lock down private-schema execution — only Postgres/service_role can call directly.
--    RLS policies and triggers execute functions as the table owner (postgres), so
--    they continue to work without needing EXECUTE for anon/authenticated.
REVOKE ALL ON FUNCTION private.current_license_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_valid_license_header() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.set_license_id_from_header() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.update_updated_at_column() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_license_id() TO service_role;
GRANT EXECUTE ON FUNCTION private.has_valid_license_header() TO service_role;

-- 4. Repoint every trigger to the private-schema function
DROP TRIGGER IF EXISTS trg_data_sources_set_license ON public.data_sources;
CREATE TRIGGER trg_data_sources_set_license
BEFORE INSERT ON public.data_sources
FOR EACH ROW EXECUTE FUNCTION private.set_license_id_from_header();

DROP TRIGGER IF EXISTS trg_print_jobs_set_license ON public.print_jobs;
CREATE TRIGGER trg_print_jobs_set_license
BEFORE INSERT ON public.print_jobs
FOR EACH ROW EXECUTE FUNCTION private.set_license_id_from_header();

DROP TRIGGER IF EXISTS update_fleet_sites_updated_at ON public.fleet_sites;
CREATE TRIGGER update_fleet_sites_updated_at
BEFORE UPDATE ON public.fleet_sites
FOR EACH ROW EXECUTE FUNCTION private.update_updated_at_column();

DROP TRIGGER IF EXISTS update_training_videos_updated_at ON public.training_videos;
CREATE TRIGGER update_training_videos_updated_at
BEFORE UPDATE ON public.training_videos
FOR EACH ROW EXECUTE FUNCTION private.update_updated_at_column();

DROP TRIGGER IF EXISTS update_data_sources_updated_at ON public.data_sources;
CREATE TRIGGER update_data_sources_updated_at
BEFORE UPDATE ON public.data_sources
FOR EACH ROW EXECUTE FUNCTION private.update_updated_at_column();

DROP TRIGGER IF EXISTS update_print_jobs_updated_at ON public.print_jobs;
CREATE TRIGGER update_print_jobs_updated_at
BEFORE UPDATE ON public.print_jobs
FOR EACH ROW EXECUTE FUNCTION private.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_twin_code_runs_updated_at ON public.twin_code_runs;
CREATE TRIGGER trg_twin_code_runs_updated_at
BEFORE UPDATE ON public.twin_code_runs
FOR EACH ROW EXECUTE FUNCTION private.update_updated_at_column();

-- 5. Rewrite RLS policies that referenced public.current_license_id()
--    (drop + recreate pointing at private schema)
DROP POLICY IF EXISTS "Owner license read on data_sources"   ON public.data_sources;
DROP POLICY IF EXISTS "Owner license insert on data_sources" ON public.data_sources;
DROP POLICY IF EXISTS "Owner license update on data_sources" ON public.data_sources;
DROP POLICY IF EXISTS "Owner license delete on data_sources" ON public.data_sources;

CREATE POLICY "Owner license read on data_sources"
ON public.data_sources FOR SELECT
USING (license_id IS NOT NULL AND license_id = private.current_license_id());

CREATE POLICY "Owner license insert on data_sources"
ON public.data_sources FOR INSERT
WITH CHECK (private.current_license_id() IS NOT NULL);

CREATE POLICY "Owner license update on data_sources"
ON public.data_sources FOR UPDATE
USING (license_id IS NOT NULL AND license_id = private.current_license_id())
WITH CHECK (license_id = private.current_license_id());

CREATE POLICY "Owner license delete on data_sources"
ON public.data_sources FOR DELETE
USING (license_id IS NOT NULL AND license_id = private.current_license_id());

DROP POLICY IF EXISTS "Owner license read on print_jobs"   ON public.print_jobs;
DROP POLICY IF EXISTS "Owner license insert on print_jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Owner license update on print_jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Owner license delete on print_jobs" ON public.print_jobs;

CREATE POLICY "Owner license read on print_jobs"
ON public.print_jobs FOR SELECT
USING (license_id IS NOT NULL AND license_id = private.current_license_id());

CREATE POLICY "Owner license insert on print_jobs"
ON public.print_jobs FOR INSERT
WITH CHECK (private.current_license_id() IS NOT NULL);

CREATE POLICY "Owner license update on print_jobs"
ON public.print_jobs FOR UPDATE
USING (license_id IS NOT NULL AND license_id = private.current_license_id())
WITH CHECK (license_id = private.current_license_id());

CREATE POLICY "Owner license delete on print_jobs"
ON public.print_jobs FOR DELETE
USING (license_id IS NOT NULL AND license_id = private.current_license_id());

DROP POLICY IF EXISTS "Owner license read on data_source_rows"   ON public.data_source_rows;
DROP POLICY IF EXISTS "Owner license insert on data_source_rows" ON public.data_source_rows;
DROP POLICY IF EXISTS "Owner license update on data_source_rows" ON public.data_source_rows;
DROP POLICY IF EXISTS "Owner license delete on data_source_rows" ON public.data_source_rows;

CREATE POLICY "Owner license read on data_source_rows"
ON public.data_source_rows FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.data_sources ds
  WHERE ds.id = data_source_rows.data_source_id
    AND ds.license_id = private.current_license_id()
));

CREATE POLICY "Owner license insert on data_source_rows"
ON public.data_source_rows FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.data_sources ds
  WHERE ds.id = data_source_rows.data_source_id
    AND ds.license_id = private.current_license_id()
));

CREATE POLICY "Owner license update on data_source_rows"
ON public.data_source_rows FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.data_sources ds
  WHERE ds.id = data_source_rows.data_source_id
    AND ds.license_id = private.current_license_id()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.data_sources ds
  WHERE ds.id = data_source_rows.data_source_id
    AND ds.license_id = private.current_license_id()
));

CREATE POLICY "Owner license delete on data_source_rows"
ON public.data_source_rows FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.data_sources ds
  WHERE ds.id = data_source_rows.data_source_id
    AND ds.license_id = private.current_license_id()
));

-- 6. Drop the now-unused public copies (nothing else references them)
DROP FUNCTION IF EXISTS public.current_license_id();
DROP FUNCTION IF EXISTS public.has_valid_license_header();
DROP FUNCTION IF EXISTS public.set_license_id_from_header();
DROP FUNCTION IF EXISTS public.update_updated_at_column();

-- 7. Storage: stop clients from listing the public training-videos bucket.
--    Direct playback via /object/public/training-videos/<file> keeps working
--    because public buckets bypass RLS for object downloads. Only enumeration
--    (LIST) via storage.objects SELECT is removed.
DROP POLICY IF EXISTS "Public read access for training videos" ON storage.objects;

CREATE POLICY "Service role reads training videos"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'training-videos');
