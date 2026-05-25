# Civic Snap Context

## Current State

- Civic Snap is an Expo React Native app using Expo Router in `311-mobile/`.
- The main surfaces are the Report, History, and Map tabs, plus onboarding, settings, and report detail screens.
- The report flow supports photo or manual starts, issue search, location pin adjustment, details/checklist prompts, editable email preview, native Mail handoff, and copy/mailto fallback.
- Deeper architecture diagrams live in `docs/diagrams.md`; photo-analysis setup details live in `docs/photo-labels-mvp.md`.

## Architecture Decisions

- Keep saved reports, drafts, profile fields, saved report photos, and email handoff local-first.
- Use SQLite for report history, SecureStore/device storage for profile/onboarding/settings, and local file storage for report photos.
- Save a report as `Draft` when email preview opens so the user's work is not lost.
- Treat `Mail opened` as the app's successful handoff state; the app does not claim Toronto received the report.
- Make email preview editable before Mail handoff; user edits are saved back into the local draft.
- Keep draft reports resumable from History and report detail.
- Use a fixed center pin for report location adjustment; users move the map under the pin for better mobile precision.
- Use `react-native-maps` for native map surfaces; reports without coordinates show in History but not on Map.
- Keep report creation in `features/report/` with a reducer for pure draft state and a hook for async device/app side effects.
- Share only small, repeated UI primitives in `components/ui/`; avoid a broad design system until the prototype stabilizes.
- Evolve local SQLite with explicit `PRAGMA user_version` migrations/backfills and preserve existing drafts/reports during prototype schema changes.
- Use the generated Toronto 311 catalog as the source for 97 target issue types and 99 photo-label definitions.
- Keep app and Edge Function photo-analysis contracts deploy-safe in their own runtimes, with contract tests proving response compatibility.
- Verify refactors with typecheck, Jest, web export, and an iOS Expo Go/simulator smoke pass for native-only behavior.

## Photo Analysis Boundary

- Photo analysis is optional and assistive. It runs only when public Expo env config is present and the user enables Photo analysis in Settings or inline during a report.
- When enabled, photo analysis starts in the background after a report photo is saved so location confirmation can continue while suggestions load.
- The app sends a resized photo copy to the shared Supabase Edge Function for Gemini-backed photo labels and top issue candidates.
- Address, GPS, location notes, user-written descriptions, profile fields, and email body stay out of Gemini requests.
- Saved report photos stay on-device; only the analysis copy is sent for photo analysis.
- Public Expo env vars configure the demo backend. Gemini API keys and Supabase service-role keys stay in Edge Function secrets, never in the app.
- Server-side analysis logs are used for rate limiting and diagnostics; retention policy is still an open operations decision.

## Placeholders And Out Of Scope

- Face redaction/anonymization is not active yet.
- Auth, cloud sync, direct 311 submission/status APIs, councillor routing, overdue follow-up automation, and analytics dashboards are out of scope.
- Councillor lookup, service targets, and direct backend-backed follow-up should not be implied by MVP UI copy.
- The app still hands off an email draft to the user's mail client; it does not submit directly to Toronto 311.

## Open Debates

- Whether photo analysis should stay opt-in or become default-on after more privacy and reliability testing.
- When to add native iOS face redaction and whether that moves the app from Expo Go to an EAS development build.
- Whether true 311 submission/status tracking should replace or supplement the Mail handoff.
- Whether `Civic Snap` should stay Toronto-specific or become city-configurable later.
- What retention and monitoring policy should govern server-side photo-analysis logs.
