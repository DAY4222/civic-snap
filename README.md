# Civic Snap

Expo React Native app for drafting local 311 reports with optional photos, map pins, local draft history, and editable email handoff.

## Setup

```sh
npm install
cp .env.example .env.local
```

The tracked `.env` and `.env.example` configure photo-label analysis and email rewriting against the shared demo backend. Users still need to enable Photo analysis in Settings before the app sends a resized photo for topic suggestions. Email drafts are rewritten automatically when the rewrite function is configured. Use `.env.local` for local overrides.

`EXPO_PUBLIC_SUPABASE_REWRITE_EMAIL_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are public client configuration. Gemini API keys and Supabase service-role keys must stay in Supabase Edge Function secrets only.

## Run

```sh
npm run start
npm run ios
npm run android
npm run web
```

## Checks

```sh
npm run typecheck
npm run test
npm run build:web
npm run check
```

`npm run check` runs the typecheck, Jest tests, and a web export. Supabase Edge Function checks are intentionally separate because they require a Deno/Supabase CLI environment.

## Supabase deploys

```sh
npm run supabase:deploy:photo-labels
npm run supabase:deploy:rewrite-email
```

Configure function secrets from `supabase/.env.example` before deploying a new backend.
