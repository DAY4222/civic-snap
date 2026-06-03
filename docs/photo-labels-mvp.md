# Photo Labels MVP

## Default app env

Fresh clones of `main` configure photo labels through the tracked `.env` file:

```sh
EXPO_PUBLIC_PHOTO_LABELS_ENABLED=true
EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL=https://sdlanaillklsdnkzkfri.supabase.co/functions/v1/analyze-photo-labels
EXPO_PUBLIC_SUPABASE_ANON_KEY=<shared public anon key>
```

These values are public Expo client config, not secrets. They point the app at the shared demo Supabase backend. Photo analysis defaults off, so users must opt in from Settings or from the report flow before the app sends a resized photo for labels and issue candidates. Once enabled, analysis starts in the background after a report photo is saved. For this direct `fetch` integration, use the legacy public `anon` key from Supabase as the bearer token. Do not use the `service_role` key in the app.

The app request includes a per-install ID, a resized JPEG analysis copy, image metadata, the allowed photo-label taxonomy, and the taxonomy version. The Edge Function validates the taxonomy version and uses its deployed issue catalog as the source of truth for allowed labels. The request does not include address, GPS, location notes, user-written descriptions, profile fields, or email text.

The function response is normalized in the app before use. It can include visible photo labels and up to three issue candidates. Local drafts can persist the normalized analysis result in `photo_vision_result_json` and the user-selected photo issue in `photo_issue_topic_json`.

To find the `anon` key for another backend:

1. Open the Supabase Dashboard.
2. Select the project.
3. Go to Project Settings > API Keys.
4. Open Legacy API Keys.
5. Copy the `anon` public key into `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

Use `.env.local` only when you need a local override. It is intentionally ignored by Git and can disable the feature or point to another backend:

```sh
EXPO_PUBLIC_PHOTO_LABELS_ENABLED=false
EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

If any value is missing or disabled, the app hides photo analysis and continues with the existing report flow.

## Supabase setup

The shared demo backend uses Supabase project `sdlanaillklsdnkzkfri`.

For a new backend, create a Supabase project, then apply the migrations in `supabase/migrations`.

Set Edge Function secrets:

```sh
npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
npx supabase secrets set MAX_ANALYSES_PER_INSTALL_PER_DAY=50
npx supabase secrets set MAX_ANALYSES_GLOBAL_PER_DAY=300
npx supabase secrets set MAX_IMAGE_BASE64_BYTES=2000000
npx supabase secrets set MAX_EMAIL_REWRITES_PER_INSTALL_PER_DAY=50
npx supabase secrets set MAX_EMAIL_REWRITES_GLOBAL_PER_DAY=300
```

Deploy the JWT-verified, rate-limited function:

```sh
npx supabase functions deploy analyze-photo-labels
npx supabase functions deploy rewrite-email
```

Do not commit Gemini API keys or Supabase service-role keys. They belong in Supabase Edge Function secrets only.

The public shared backend is protected by per-install and global daily rate limits. Server-side analysis logs keep the hashed install ID, image metadata, summarized labels, issue candidate IDs and confidence tiers, status, latency, and error summaries for rate limiting and diagnostics. They do not store the full user report context.

## Gemini setup

Use a Gemini API key from Google AI Studio. Keep Gemini billing disabled for v1 dev testing so quota exhaustion, not surprise spend, is the failure mode.

The Edge Function uses the fixed model `gemini-3.1-flash-lite` and does not enable Gemini tools, grounding, Search, or Maps. It receives only the image plus generated label and issue catalogs; address, GPS, location notes, user-written descriptions, profile fields, and email text stay in the app.

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
