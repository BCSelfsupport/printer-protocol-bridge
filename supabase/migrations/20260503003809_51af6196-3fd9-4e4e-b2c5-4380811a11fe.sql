-- Replace wide-open RLS policies with license-gated ones for shared data tables.
-- Reads and writes now require a valid, active license key in the
-- `x-license-key` request header. Anyone without a license is blocked.

CREATE OR REPLACE FUNCTION public.has_valid_license_header()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- data_sources
DROP POLICY IF EXISTS "Allow all access to data_sources" ON public.data_sources;
CREATE POLICY "License-gated read on data_sources"
  ON public.data_sources FOR SELECT
  USING (public.has_valid_license_header());
CREATE POLICY "License-gated insert on data_sources"
  ON public.data_sources FOR INSERT
  WITH CHECK (public.has_valid_license_header());
CREATE POLICY "License-gated update on data_sources"
  ON public.data_sources FOR UPDATE
  USING (public.has_valid_license_header())
  WITH CHECK (public.has_valid_license_header());
CREATE POLICY "License-gated delete on data_sources"
  ON public.data_sources FOR DELETE
  USING (public.has_valid_license_header());

-- data_source_rows
DROP POLICY IF EXISTS "Allow all access to data_source_rows" ON public.data_source_rows;
CREATE POLICY "License-gated read on data_source_rows"
  ON public.data_source_rows FOR SELECT
  USING (public.has_valid_license_header());
CREATE POLICY "License-gated insert on data_source_rows"
  ON public.data_source_rows FOR INSERT
  WITH CHECK (public.has_valid_license_header());
CREATE POLICY "License-gated update on data_source_rows"
  ON public.data_source_rows FOR UPDATE
  USING (public.has_valid_license_header())
  WITH CHECK (public.has_valid_license_header());
CREATE POLICY "License-gated delete on data_source_rows"
  ON public.data_source_rows FOR DELETE
  USING (public.has_valid_license_header());

-- print_jobs
DROP POLICY IF EXISTS "Allow all access to print_jobs" ON public.print_jobs;
CREATE POLICY "License-gated read on print_jobs"
  ON public.print_jobs FOR SELECT
  USING (public.has_valid_license_header());
CREATE POLICY "License-gated insert on print_jobs"
  ON public.print_jobs FOR INSERT
  WITH CHECK (public.has_valid_license_header());
CREATE POLICY "License-gated update on print_jobs"
  ON public.print_jobs FOR UPDATE
  USING (public.has_valid_license_header())
  WITH CHECK (public.has_valid_license_header());
CREATE POLICY "License-gated delete on print_jobs"
  ON public.print_jobs FOR DELETE
  USING (public.has_valid_license_header());