# Civic Snap

Expo React Native app for drafting local 311 reports with optional photos, map pins, local draft history, and editable email handoff.

## Setup

```sh
npm install
cp .env.example .env.local
```

The default `.env.example` keeps photo-label analysis disabled. If a Supabase photo-label endpoint is available, set `EXPO_PUBLIC_PHOTO_LABELS_ENABLED=true` and add `EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL`.

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
