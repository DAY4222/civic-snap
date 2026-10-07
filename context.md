# Civic Snap Context

## Current State

- Civic Snap is an Expo React Native app using Expo Router in `311-mobile/`.
- The main surfaces are the Report, History, and Map tabs, plus onboarding, settings, and report detail screens.
- The report flow supports photo or manual starts, issue search, location pin adjustment, details/checklist prompts, editable email preview with optional AI polish, handoff through Apple Mail or the share sheet, and a copy/mailto fallback on web.
- Deeper architecture diagrams live in `docs/diagrams.md`; photo-analysis setup details live in `docs/photo-labels-mvp.md`.

## Architecture Decisions

- Keep saved reports, drafts, profile fields, saved report photos, and email handoff local-first.
- Use SQLite for report history, SecureStore/device storage for profile/onboarding/settings, and local file storage for report photos.
- Save drafts as the user goes: the row is created once the draft has content and autosaved after each change and when the app backgrounds.
- Store report status as codes: `draft`, `handed_off` (Mail or share sheet opened, not confirmed), `sent` (user confirmed or Mail reported sent), `case_added`. The app never claims Toronto received the report.
- Hand off through Apple Mail when it is set up (its result maps to sent/handed off/cancelled), otherwise the share sheet; web uses copy/mailto and "I've sent it".
- Make email preview editable before handoff; the email is tracked as generated, user-edited, or AI-polished, and user edits are never overwritten.
- Store report photo paths relative to the document directory, because iOS can move the app container.
- Keep draft reports resumable from History, report detail and the home screen's "Continue your draft" card.
- The report wizard is its own full-screen route (`/report/new`) above the tabs; Back steps through it and leaves from the first step, and the swipe-back gesture is off so leaving always saves.
- A photo report starts with "What's the issue?" (photo suggestions) when they are on, otherwise with the issue search; a report without a photo starts with the search.
- Use a fixed center pin for report location adjustment; users move the map under the pin for better mobile precision. The pin starts at the photo's GPS position, then the phone's location; only the user's own map moves set it.
- Issue search ranks by word-prefix matches over titles, curated everyday words (`data/search-synonyms.json`, read at runtime), category paths and checklist questions; things 311 doesn't handle (streetlights) point to who does.
- Checklist questions 311's form marks required come first; the app fills the exact-location and Toronto Island answers from the location and never overwrites the user's answers.
- Profile, AI choices and the onboarding flag load once into `lib/appState.tsx`; onboarding is gated with `Stack.Protected`.
- Everything Toronto-specific outside the issue catalog lives in `lib/city.ts`.
- Use `react-native-maps` for native map surfaces; reports without coordinates show in History but not on Map.
- Keep report creation in `features/report/` with a reducer for pure draft state and a hook for async device/app side effects.
- Share only small, repeated UI primitives in `components/ui/`; avoid a broad design system until the prototype stabilizes.
- Evolve local SQLite with ordered migrations in `lib/reportMigrations.ts`, run once per session inside transactions and tracked with `PRAGMA user_version`; never edit a shipped migration.
- Use the generated Toronto 311 catalog as the source for 97 target issue types and 99 photo-label definitions.
- Keep app and Edge Function photo-analysis contracts deploy-safe in their own runtimes, with contract tests proving response compatibility.
- Verify refactors with typecheck, Jest, web export, and an iOS Expo Go/simulator smoke pass for native-only behavior.

## Photo Analysis Boundary

- Photo analysis is optional and assistive. It runs only when public Expo env config is present and the user enables Photo analysis in Settings or inline during a report.
- When enabled, photo analysis starts in the background after a report photo is saved so location confirmation can continue while suggestions load.
- The app sends a resized photo copy to the shared Supabase Edge Function for Gemini-backed photo labels and top issue candidates.
- Address, GPS, location notes, user-written descriptions, profile fields, and email body stay out of photo-analysis requests.
- Saved report photos stay on-device; only the analysis copy is sent for photo analysis.
- Public Expo env vars configure the demo backend. Gemini API keys and Supabase service-role keys stay in Edge Function secrets, never in the app.
- Server-side analysis logs are used for rate limiting and diagnostics; retention policy is still an open operations decision.
- Photo suggestions are a three-way setting: on, off ("Not now" or Settings), or never asked (the first photo report asks inline).
- Daily limits reserve a row before calling Gemini, so parallel requests can't pass a cap. A caller is the install's anonymous Supabase Auth user when anonymous sign-ins are on, otherwise the install id; `REQUIRE_SIGNED_IN_USER=true` makes the user required (for launch).

## AI Email Polish Boundary

- AI email polish is opt-in: the first use shows a consent sheet, and Settings has a switch. It never runs automatically.
- It sends the issue type, description, address and location note, and checklist answers. Name, email, phone, exact GPS, and the photo are never sent; the app adds contact details and GPS back to the polished email on the device.
- Polished text is marked "AI-polished, check the facts" with Undo. The prompt forbids adding hazards, consequences, or severity the reporter didn't state.

## Placeholders And Out Of Scope

- Face redaction/anonymization is not active yet.
- Accounts, cloud sync, direct 311 submission/status APIs, councillor routing, overdue follow-up automation, and analytics dashboards are out of scope. (Anonymous sign-in exists only to count AI requests per install; it holds no data.)
- Councillor lookup, service targets, and direct backend-backed follow-up should not be implied by MVP UI copy.
- The app still hands off an email draft to the user's mail client; it does not submit directly to Toronto 311.

## Open Debates

- Whether photo analysis should stay opt-in or become default-on after more privacy and reliability testing.
- When to add native iOS face redaction and whether that moves the app from Expo Go to an EAS development build.
- Whether true 311 submission/status tracking should replace or supplement the Mail handoff.
- Whether `Civic Snap` should stay Toronto-specific or become city-configurable later.
- What retention and monitoring policy should govern server-side photo-analysis logs.
