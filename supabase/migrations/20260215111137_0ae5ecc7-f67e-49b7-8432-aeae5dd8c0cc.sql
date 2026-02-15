
-- Fleet monitoring: customer sites
CREATE TABLE public.fleet_sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  location TEXT,
  contact_email TEXT,
  license_id UUID REFERENCES public.licenses(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_sites ENABLE ROW LEVEL SECURITY;

-- Service role only (dev portal access)
CREATE POLICY "Service role only" ON public.fleet_sites FOR ALL USING (false) WITH CHECK (false);

-- Fleet monitoring: printers at each site
CREATE TABLE public.fleet_printers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.fleet_sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 23,
  firmware_version TEXT,
  serial_number TEXT,
  last_seen TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'offline',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_printers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.fleet_printers FOR ALL USING (false) WITH CHECK (false);

-- Fleet telemetry snapshots
CREATE TABLE public.fleet_telemetry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  printer_id UUID NOT NULL REFERENCES public.fleet_printers(id) ON DELETE CASCADE,
  pressure NUMERIC,
  viscosity NUMERIC,
  modulation NUMERIC,
  charge NUMERIC,
  rps NUMERIC,
  phase_qual NUMERIC,
  ink_level TEXT,
  makeup_level TEXT,
  printhead_temp NUMERIC,
  electronics_temp NUMERIC,
  power_hours TEXT,
  stream_hours TEXT,
  hv_on BOOLEAN DEFAULT false,
  jet_running BOOLEAN DEFAULT false,
  print_count INTEGER DEFAULT 0,
  current_message TEXT,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.fleet_telemetry FOR ALL USING (false) WITH CHECK (false);

-- Fleet event logs (faults, consumable scans, etc.)
CREATE TABLE public.fleet_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  printer_id UUID NOT NULL REFERENCES public.fleet_printers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.fleet_events FOR ALL USING (false) WITH CHECK (false);

-- Fleet firmware records
CREATE TABLE public.fleet_firmware (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL,
  release_notes TEXT,
  file_size INTEGER,
  is_latest BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_firmware ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.fleet_firmware FOR ALL USING (false) WITH CHECK (false);

-- Firmware update jobs
CREATE TABLE public.fleet_firmware_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  printer_id UUID NOT NULL REFERENCES public.fleet_printers(id) ON DELETE CASCADE,
  firmware_id UUID NOT NULL REFERENCES public.fleet_firmware(id),
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_firmware_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.fleet_firmware_updates FOR ALL USING (false) WITH CHECK (false);

-- Indexes for performance
CREATE INDEX idx_fleet_telemetry_printer ON public.fleet_telemetry(printer_id, recorded_at DESC);
CREATE INDEX idx_fleet_events_printer ON public.fleet_events(printer_id, occurred_at DESC);
CREATE INDEX idx_fleet_printers_site ON public.fleet_printers(site_id);

-- Trigger for updated_at
CREATE TRIGGER update_fleet_sites_updated_at
BEFORE UPDATE ON public.fleet_sites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
