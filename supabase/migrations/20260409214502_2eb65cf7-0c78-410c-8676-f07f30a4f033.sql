
-- Add category column to fleet_events for native log tab classification
ALTER TABLE public.fleet_events 
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'event';

-- Backfill existing events with correct categories
UPDATE public.fleet_events SET category = 'viscosity' WHERE event_type IN ('viscosity_drift', 'viscosity_add');
UPDATE public.fleet_events SET category = 'phase' WHERE event_type IN ('phase_quality_low', 'phase_quality_change');
UPDATE public.fleet_events SET category = 'smartfill' WHERE event_type IN ('ink_level_change', 'makeup_level_change');
UPDATE public.fleet_events SET category = 'filter' WHERE event_type IN ('filter_warning', 'filter_expired', 'filter_replaced');
-- Everything else stays as 'event' (jet_start, jet_stop, hv_on, hv_off, pressure_drift, modulation_drift, etc.)
