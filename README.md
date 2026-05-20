# Civic Snap

Expo React Native app for drafting local 311 reports with optional photos, map pins, local draft history, and editable email handoff.

## Setup

```sh
npm install
cp .env.example .env.local
```

The default `.env.example` configures the shared demo photo-label endpoint. Users still need to enable Photo analysis in Settings before the app sends a resized photo for topic suggestions. For another Supabase endpoint, set `EXPO_PUBLIC_PHOTO_LABELS_ENABLED=true`, `EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL`, and the public `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

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
