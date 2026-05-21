ALTER TABLE public.ai_photo_analysis_runs
  ADD COLUMN IF NOT EXISTS issue_candidates JSONB NOT NULL DEFAULT '[]'::JSONB;
