-- Brokers a single scanned value from a paired mobile companion to the PC.
-- One row per "select message that needs a scan" event. Mobile fulfils it; PC consumes it via realtime.
CREATE TABLE public.scan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  pc_machine_id TEXT NOT NULL,
  message_name TEXT NOT NULL,
  prompt_label TEXT NOT NULL,
  max_length INTEGER NOT NULL DEFAULT 24,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | fulfilled | cancelled | expired
  scanned_value TEXT,
  fulfilled_by_machine_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes')
);

CREATE INDEX idx_scan_requests_license_status ON public.scan_requests (license_id, status, created_at DESC);

ALTER TABLE public.scan_requests ENABLE ROW LEVEL SECURITY;

-- Service role only; clients (PC + mobile) reach this table via the scan-request edge function.
CREATE POLICY "Service role only" ON public.scan_requests
  FOR ALL TO public USING (false) WITH CHECK (false);

-- Realtime so the PC can subscribe to its own pending row and react the moment mobile fulfils it.
ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_requests;
ALTER TABLE public.scan_requests REPLICA IDENTITY FULL;