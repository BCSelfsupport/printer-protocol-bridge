
-- Data Sources: represents a CSV/table uploaded or created by the user
CREATE TABLE public.data_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  columns TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Data Source Rows: individual records in a data source
CREATE TABLE public.data_source_rows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_source_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  values JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_source_rows_source ON public.data_source_rows(data_source_id, row_index);

-- Print Jobs: links a data source to a message for one-to-one printing
CREATE TABLE public.print_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_source_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  message_name TEXT NOT NULL,
  printer_id INTEGER NOT NULL,
  field_mappings JSONB NOT NULL DEFAULT '{}',
  current_row_index INTEGER NOT NULL DEFAULT 0,
  total_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idle',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_source_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- Public access policies (this is a local/desktop app without user auth)
CREATE POLICY "Allow all access to data_sources" ON public.data_sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to data_source_rows" ON public.data_source_rows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to print_jobs" ON public.print_jobs FOR ALL USING (true) WITH CHECK (true);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_data_sources_updated_at
  BEFORE UPDATE ON public.data_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_print_jobs_updated_at
  BEFORE UPDATE ON public.print_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
