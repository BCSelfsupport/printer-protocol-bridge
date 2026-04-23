-- Twin Code cloud-backed ledger
-- Enables cross-PC duplicate prevention and run resumption on backup hardware.

CREATE TABLE public.twin_code_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  license_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
  lot_number text NOT NULL,
  operator text NOT NULL,
  note text,
  catalog_fingerprint text,
  catalog_total_at_start integer NOT NULL DEFAULT 0,
  live_at_start boolean NOT NULL DEFAULT false,
  pc_machine_id text NOT NULL,
  status text NOT NULL DEFAULT 'active', -- 'active' | 'completed' | 'cancelled'
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  printed_count integer NOT NULL DEFAULT 0,
  missed_count integer NOT NULL DEFAULT 0,
  last_heartbeat_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_twin_code_runs_lot ON public.twin_code_runs(lot_number);
CREATE INDEX idx_twin_code_runs_fingerprint ON public.twin_code_runs(catalog_fingerprint);
CREATE INDEX idx_twin_code_runs_status ON public.twin_code_runs(status);
CREATE INDEX idx_twin_code_runs_license ON public.twin_code_runs(license_id);

CREATE TABLE public.twin_code_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  catalog_fingerprint text NOT NULL,
  serial text NOT NULL,
  outcome text NOT NULL, -- 'printed' | 'missed' | 'claimed'
  bottle_index integer NOT NULL,
  run_id uuid REFERENCES public.twin_code_runs(id) ON DELETE SET NULL,
  pc_machine_id text NOT NULL,
  license_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
  wall_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Hard guarantee: same serial cannot be printed twice within the same catalog
-- (a "lot"). This is the cloud-side enforcement of the anti-duplicate rule.
CREATE UNIQUE INDEX uniq_ledger_serial_per_catalog
  ON public.twin_code_ledger(catalog_fingerprint, serial)
  WHERE outcome = 'printed';

CREATE INDEX idx_ledger_fingerprint ON public.twin_code_ledger(catalog_fingerprint);
CREATE INDEX idx_ledger_run ON public.twin_code_ledger(run_id);
CREATE INDEX idx_ledger_wall_at ON public.twin_code_ledger(wall_at DESC);

-- RLS: clients NEVER touch these tables directly. Edge function uses service role.
ALTER TABLE public.twin_code_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twin_code_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.twin_code_runs
  FOR ALL USING (false) WITH CHECK (false);

CREATE POLICY "Service role only" ON public.twin_code_ledger
  FOR ALL USING (false) WITH CHECK (false);

-- Auto-update updated_at on twin_code_runs
CREATE TRIGGER trg_twin_code_runs_updated_at
  BEFORE UPDATE ON public.twin_code_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();