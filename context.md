# Civic Snap Context

## Architecture Decisions

- Build the MVP as an Expo React Native app in `311-mobile/`.
- Use Expo Go first; do not require EAS, TestFlight, or an Apple Developer account for the initial loop.
- Keep `prototype/index.html` as a historical UX reference, not a source of truth for implementation.
- Keep the app local-first: no backend, auth, cloud sync, OpenAI calls, or server storage in this MVP.
- Use SQLite for report history and SecureStore for optional profile fields.
- Save a report as `Draft` when email preview opens so the user's work is not lost.
- Treat `Mail opened` as the app's successful handoff state; the app does not claim Toronto received the report.
- Use Apple Maps through `react-native-maps`; reports without coordinates show in History but not on Map.
- Use local typed category config for the five MVP issue types and max three questions per category.
- Use a shared email skeleton with category-specific detail sections.
- Make email preview editable before Mail handoff; user edits are saved back into the local draft.
- Keep draft reports resumable from History and report detail.
- Use a fixed center pin for report location adjustment; users move the map under the pin for better mobile precision.

## MVP Placeholders

- AI is not active. MVP screens say "guided questions" rather than AI.
- Face anonymization is not active. MVP copy must say it is coming soon.
- Councillor lookup, service targets, overdue follow-up, and backend analytics are out of scope.
- Photos are stored locally and never uploaded, but they are not anonymized in the MVP.

## Open Debates

- When to replace deterministic templates with real AI drafting.
- When to add native iOS face redaction and whether that moves the app from Expo Go to an EAS development build.
- Whether profile setup should stay optional or become a first-run onboarding step.
- Whether follow-up and councillor routing should become part of the core loop or remain secondary.
- Whether `Civic Snap` should stay Toronto-specific or become city-configurable later.
- Whether the wizard CTA should become fully sticky across all steps after more physical-device testing.
