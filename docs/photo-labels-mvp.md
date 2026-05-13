# Photo Labels MVP

## Local app env

Copy `.env.example` to `.env.local` and set:

```sh
EXPO_PUBLIC_PHOTO_LABELS_ENABLED=true
EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL=https://YOUR_PROJECT_REF.functions.supabase.co/analyze-photo-labels
```

If either value is missing, the app hides photo analysis and continues with the existing report flow.

## Supabase setup

Create a Supabase project, then apply the migration in `supabase/migrations`.

Set Edge Function secrets:

```sh
npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
npx supabase secrets set MAX_ANALYSES_PER_INSTALL_PER_DAY=50
npx supabase secrets set MAX_ANALYSES_GLOBAL_PER_DAY=300
npx supabase secrets set MAX_IMAGE_BASE64_BYTES=2000000
```

Deploy the public, rate-limited function:

```sh
npx supabase functions deploy analyze-photo-labels --no-verify-jwt
```

## Gemini setup

Use a Gemini API key from Google AI Studio. Keep Gemini billing disabled for v1 dev testing so quota exhaustion, not surprise spend, is the failure mode.

The Edge Function uses the fixed model `gemini-2.5-flash-lite` and does not enable Gemini tools, grounding, Search, or Maps.

## Retention cleanup

For beta, manually remove server-side analysis results older than 30 days:

```sql
DELETE FROM public.ai_photo_analysis_runs
WHERE created_at < NOW() - INTERVAL '30 days';
```

## Rollback

- Immediate rollback: set `EXPO_PUBLIC_PHOTO_LABELS_ENABLED=false`.
- Code rollback: revert the photo-label feature PR.
- Backend rollback: unset the app function URL or disable the Supabase function.
- Database rollback: leave the additive table in place.
