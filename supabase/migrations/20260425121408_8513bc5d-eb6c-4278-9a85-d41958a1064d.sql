-- Developer-access tables
CREATE TABLE public.developer_licenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  license_id UUID NOT NULL UNIQUE REFERENCES public.licenses(id) ON DELETE CASCADE,
  totp_secret_encrypted TEXT,
  totp_enrolled_at TIMESTAMP WITH TIME ZONE,
  is_owner BOOLEAN NOT NULL DEFAULT false,
  created_by_license_id UUID REFERENCES public.licenses(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_signin_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.developer_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.developer_licenses
  FOR ALL USING (false) WITH CHECK (false);

CREATE TABLE public.developer_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  created_by_license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  consumed_at TIMESTAMP WITH TIME ZONE,
  consumed_by_license_id UUID REFERENCES public.licenses(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.developer_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.developer_invites
  FOR ALL USING (false) WITH CHECK (false);

CREATE INDEX idx_developer_invites_code ON public.developer_invites(code) WHERE consumed_at IS NULL;

-- Seed the owner key as the master developer
INSERT INTO public.developer_licenses (license_id, is_owner)
SELECT id, true FROM public.licenses WHERE product_key = '53F2G-K94HE-VK8DB-8RB4U'
ON CONFLICT (license_id) DO UPDATE SET is_owner = true;