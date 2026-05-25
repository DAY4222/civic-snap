CREATE TABLE IF NOT EXISTS public.ai_email_rewrite_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  install_id_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  client_prompt_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  latency_ms INTEGER,
  input_chars INTEGER NOT NULL DEFAULT 0,
  output_chars INTEGER NOT NULL DEFAULT 0,
  default_email_chars INTEGER NOT NULL DEFAULT 0,
  guided_answer_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS ai_email_rewrite_runs_created_at_idx
  ON public.ai_email_rewrite_runs (created_at);

CREATE INDEX IF NOT EXISTS ai_email_rewrite_runs_install_day_idx
  ON public.ai_email_rewrite_runs (install_id_hash, created_at);

ALTER TABLE public.ai_email_rewrite_runs ENABLE ROW LEVEL SECURITY;
