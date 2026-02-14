
-- License tiers enum
CREATE TYPE public.license_tier AS ENUM ('lite', 'full', 'database');

-- Customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Only service role can access customers (dev panel uses edge function)
CREATE POLICY "Service role only" ON public.customers
  FOR ALL USING (false) WITH CHECK (false);

-- Licenses table
CREATE TABLE public.licenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_key TEXT NOT NULL UNIQUE,
  tier public.license_tier NOT NULL DEFAULT 'lite',
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.licenses
  FOR ALL USING (false) WITH CHECK (false);

-- Activations table (tracks single active session)
CREATE TABLE public.license_activations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  machine_id TEXT NOT NULL,
  activated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_current BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.license_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.license_activations
  FOR ALL USING (false) WITH CHECK (false);

-- Index for fast key lookup
CREATE INDEX idx_licenses_product_key ON public.licenses(product_key);
CREATE INDEX idx_activations_license ON public.license_activations(license_id);
