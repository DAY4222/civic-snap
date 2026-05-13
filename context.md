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
- Add AI photo labels as a feature-flagged Supabase + Gemini dev experiment, not as part of the default local-only report flow.

## MVP Placeholders

- AI drafting is not active. MVP screens say "guided questions" rather than AI-generated drafts.
- Face anonymization is not active. MVP copy must say it is coming soon.
- Councillor lookup, service targets, overdue follow-up, and backend analytics are out of scope.
- Photos are stored locally and never uploaded unless the photo-label feature flag is enabled and the user taps Analyze photo.

## Photo Label AI Decisions

- Use Supabase as the long-term AI backend foundation for photo labels now and possible AI drafting, issue classification, and 311 knowledge-base search later.
- Use Gemini Flash-Lite for v1 image analysis, with Gemini billing disabled during dev testing.
- Keep the feature behind `EXPO_PUBLIC_PHOTO_LABELS_ENABLED`; when disabled or unconfigured, the app behaves as before.
- Require the user to tap Analyze photo; do not upload photos automatically after capture or selection.
- Keep the allowed photo-label taxonomy in app code for v1, starting with 20 broad 311 labels.
- Show all matched labels above 0.70 confidence, capped at 5 visible chips.
- Tapping a label chip shows confidence and evidence; labels do not change the selected issue type or generated email in v1.
- Ask Gemini for bounding boxes and store them, but do not display image overlays in v1.
- Store unmatched/unknown observations server-side only for taxonomy discovery.
- Store full analysis results locally with drafts and server-side for 30 days, but do not store photos on Supabase.
- Cap image payloads at `MAX_IMAGE_BASE64_BYTES=2000000`; cap evidence and unknown-observation text before storing results.
- Enforce `MAX_ANALYSES_PER_INSTALL_PER_DAY=50` and `MAX_ANALYSES_GLOBAL_PER_DAY=300` during dev.
- Do not enable Gemini tools, grounding, Search, or Maps for the photo-label endpoint.
- Keep disclosure for cloud photo analysis in settings/legal only for v1.

## Open Debates

- When to replace deterministic templates with real AI drafting.
- When to add native iOS face redaction and whether that moves the app from Expo Go to an EAS development build.
- Whether profile setup should stay optional or become a first-run onboarding step.
- Whether follow-up and councillor routing should become part of the core loop or remain secondary.
- Whether `Civic Snap` should stay Toronto-specific or become city-configurable later.
- Whether the wizard CTA should become fully sticky across all steps after more physical-device testing.
