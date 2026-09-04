CREATE TABLE public.firmware_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  model text,
  notes text,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_bytes bigint NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_by_license_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version, model)
);

GRANT ALL ON public.firmware_packages TO service_role;

ALTER TABLE public.firmware_packages ENABLE ROW LEVEL SECURITY;

-- No client policies on purpose: firmware metadata and files are reachable
-- only through the license-gated firmware-library edge function (service role).