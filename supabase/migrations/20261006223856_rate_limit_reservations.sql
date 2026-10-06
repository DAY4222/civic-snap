-- The Edge Functions now hold a place in the daily limits before calling Gemini: they insert a
-- 'pending' row, count it with the day's other rows, and update it to 'ok' or 'error' when the
-- call ends (or delete it when a limit is reached). Allow that status.
--
-- Apply this before deploying those functions: the old check rejects every reservation, and
-- the functions answer 503 rate_limit_unavailable until it is replaced. Safe to run twice.

ALTER TABLE public.ai_photo_analysis_runs
  DROP CONSTRAINT IF EXISTS ai_photo_analysis_runs_status_check,
  ADD CONSTRAINT ai_photo_analysis_runs_status_check
    CHECK (status IN ('pending', 'ok', 'error'));

ALTER TABLE public.ai_email_rewrite_runs
  DROP CONSTRAINT IF EXISTS ai_email_rewrite_runs_status_check,
  ADD CONSTRAINT ai_email_rewrite_runs_status_check
    CHECK (status IN ('pending', 'ok', 'error'));
