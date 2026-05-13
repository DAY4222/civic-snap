CREATE TABLE IF NOT EXISTS public.ai_photo_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  install_id_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  image_mime_type TEXT,
  image_bytes INTEGER,
  image_width INTEGER,
  image_height INTEGER,
  latency_ms INTEGER,
  suggested_labels JSONB NOT NULL DEFAULT '[]'::JSONB,
  unknown_observations JSONB NOT NULL DEFAULT '[]'::JSONB,
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS ai_photo_analysis_runs_created_at_idx
  ON public.ai_photo_analysis_runs (created_at);

CREATE INDEX IF NOT EXISTS ai_photo_analysis_runs_install_day_idx
  ON public.ai_photo_analysis_runs (install_id_hash, created_at);

ALTER TABLE public.ai_photo_analysis_runs ENABLE ROW LEVEL SECURITY;
