CREATE TABLE public.companion_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  pairing_code text NOT NULL UNIQUE,
  companion_machine_id text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  paired_at timestamptz,
  expires_at timestamptz NOT NULL,
  last_seen timestamptz
);

ALTER TABLE public.companion_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.companion_sessions
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);