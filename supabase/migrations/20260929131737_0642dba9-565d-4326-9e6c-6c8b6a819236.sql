ALTER TYPE public.license_tier ADD VALUE IF NOT EXISTS 'wirecable';

CREATE TABLE public.cable_job_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid REFERENCES public.licenses(id) ON DELETE CASCADE,
  job_code text NOT NULL,
  message_name text NOT NULL,
  printer_id integer NOT NULL,
  printer_name text,
  operator text,
  data_source_id uuid,
  field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  unit text NOT NULL DEFAULT 'm',
  length_printed numeric NOT NULL DEFAULT 0,
  print_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cable_job_log TO anon, authenticated;
GRANT ALL ON public.cable_job_log TO service_role;

ALTER TABLE public.cable_job_log ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_cable_job_log_set_license BEFORE INSERT ON public.cable_job_log
  FOR EACH ROW EXECUTE FUNCTION private.set_license_id_from_header();

CREATE POLICY "Owner license read on cable_job_log" ON public.cable_job_log FOR SELECT
  USING (license_id IS NOT NULL AND license_id = private.current_license_id());
CREATE POLICY "Owner license insert on cable_job_log" ON public.cable_job_log FOR INSERT
  WITH CHECK (private.current_license_id() IS NOT NULL);
CREATE POLICY "Owner license update on cable_job_log" ON public.cable_job_log FOR UPDATE
  USING (license_id IS NOT NULL AND license_id = private.current_license_id())
  WITH CHECK (license_id = private.current_license_id());
CREATE POLICY "Owner license delete on cable_job_log" ON public.cable_job_log FOR DELETE
  USING (license_id IS NOT NULL AND license_id = private.current_license_id());

CREATE INDEX idx_cable_job_log_license_started ON public.cable_job_log(license_id, started_at DESC);