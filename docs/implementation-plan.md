# Civic Snap — Implementation Plan

Written 2026-10-05 from two reviews done against `main` at `e747143`: an architecture review of the code (findings `A1`–`A21`) and a product/design review of the running app in the iPhone simulator (findings `P1`–`P16`). Nothing in this plan has been implemented yet.

## Progress

Last updated 2026-10-05. Decisions taken: AI polish opt-in per device; Apple Mail when set up, share sheet otherwise; free-tier keep-alive. Phase 0 skipped for now.

| Item | Status | Notes |
|---|---|---|
| 1.1–1.7 | Done (branch `phase-1/stabilize`) | 1.4 and 3.4 deployed both Edge Functions. 1.4 also pulled the label descriptions forward from 5.2. |
| 1.8 | Not started | Needs your OK before deleting branches and worktrees. |
| 2.1–2.5 | Done (branch `phase-2/report-model`) | Migrations 2–4. |
| 3.1–3.7 | Done (branch `phase-3/send-path`) | Migrations 5–6. 3.4 also retries Gemini 500/503 once. |
| 4–7 | Not started | |

Not verified locally: the Deno type-check job in CI (Deno isn't installed here), and Apple Mail's own composer path (the simulator has no Mail account; the share-sheet and web paths were tested).

## How to use this document

- Work the phases top to bottom. Each phase is a set of small PRs that merge independently; a phase is done when its verification list passes.
- `A#` = architecture finding, `P#` = product finding. The index at the end maps every finding to the plan item that covers it.
- Sizes: **S** = under half a day, **M** = 1–2 days, **L** = 3+ days of focused work.
- Every PR runs `npm run check` (typecheck, Jest, web export). Anything that touches native behaviour also gets a simulator smoke pass (script at the end).

## Why this order

1. Fix what is confirmed broken before changing what is merely imperfect.
2. Change the data model (status codes, autosave, email state) *before* the features that sit on it, so each feature is written once.
3. The app stays usable at the end of every phase. No long-lived rewrite branch.
4. Backend work runs in parallel with UI work. The only coupling is the taxonomy/version contract, which is sequenced explicitly (5.2 after 4.4).
5. Validate the riskiest product assumption (email → 311 case) in the background from day one, because the answer could reorder Phases 3–7.

Compared with the order given in the architecture review (1–5, then 6–8, then 13–15, then the rest): that order holds. The product findings slot in as follows. The two confirmed bugs (`P3`) are the same as `A2`/`A3` and stay in Phase 1. The send-path problems (`P1`, `P2`, `P5`) become their own phase straight after the data model, because they are the biggest user-facing blocker and depend on the status and email-state changes. CI (`A19`) moves up to Phase 1 because it is cheap and protects everything after it.

## Phase overview

| Phase | Theme | Covers | Size |
|---|---|---|---|
| 0 | Validate the core assumption (runs in parallel) | product questions | S effort, weeks elapsed |
| 1 | Stop the bleeding | A2 A3 A4 A5 A1(stopgap) A19 A21 P3 P4 | M total |
| 2 | One report model + autosave | A6 A7 A8 A17 A20(part) | L |
| 3 | The send path | P1 P2 P5 P11 P12 A10 A1(full) A12 | L |
| 4 | Report flow restructure | A18 A9 P6 P7 P8 P9 P10 | L |
| 5 | Backend hardening (parallel with 4) | A13 A14 A15 A16 | M–L |
| 6 | Surfaces | A11 P13 P14 P15 P16 | M–L |
| 7 | Release readiness | A20 A21(rest) measurement | M |

---

## Phase 0 — Validate the core assumption (parallel track)

**0.1 Send real reports.** Send 3–5 genuine reports from the current app to 311@toronto.ca and log, per report: time to any acknowledgement, whether a case number arrives and when, whether the photo attachment survives, and whether 311 staff ask follow-up questions the checklist should have covered.

**0.2 Check the direct route.** Toronto has advertised an Open311 (GeoReport v2) interface for service requests. Confirm whether it is live and whether it accepts new requests with an API key. Do not build on it yet; just find out.

**Outcome.** If email intake is slow or unreliable, "direct submission" becomes a new Phase 3.5 and the share-sheet work in 3.6 shrinks to a fallback. Record the result in `context.md` under Open Debates.

---

## Phase 1 — Stop the bleeding

All items are **S**, independent, and one PR each. Order within the phase does not matter.

### 1.1 Resumed draft reloads after "Return to start" (A2, P3) — confirmed in the simulator

- **Where:** `features/report/useReportWizard.ts` (resume effect, around line 225), `features/report/ReportWizard.tsx` (reads `resumeId`).
- **Why it happens:** the `resumeId` route param is never cleared. `resetReport` sets `resumedReportId` back to `null`, so the effect's `resumeId !== state.resumedReportId` check passes again and reloads the same draft. The same loop fires after a successful Mail handoff, reopening the just-sent report for editing.
- **How:** keep a `consumedResumeId` ref; when a report is loaded, record it and call `router.setParams({ resumeId: undefined })`. Only resume reports whose status is draft.
- **Verify:** History → Resume draft → ✕ → Return to start → stays on the start screen. Preview → Open Mail → success → start screen, not the draft.

### 1.2 Photos stored as absolute paths (A3, P3) — confirmed: four old drafts show blank photos

- **Where:** `lib/photos.ts` (`PHOTO_DIR`), `lib/reportPersistence.ts` (`rowToReport`), `lib/reports.ts`.
- **Why:** iOS moves the app container on update/restore (the simulator's old drafts point at a container that no longer exists, while the files live under the new one).
- **How:** the database stores `reports/report-<stamp>.jpg` (relative). `rowToReport` resolves it to an absolute URI with the current document directory, so `Report.photoUri` stays absolute and History, Detail, and Mail code are untouched. The persistence layer converts to relative on write (`toStoredPhotoPath`). Migration to schema version 2: `UPDATE reports SET photo_uri = substr(photo_uri, instr(photo_uri, 'reports/')) WHERE photo_uri LIKE '%reports/%'`, same for `thumbnail_uri`.
- **Verify:** unit tests in `reportPersistence.test.ts` for both directions; the simulator's old drafts show their photos again.

### 1.3 Unknown issue silently becomes "Residential Bin Lid Damaged" (A4)

- **Where:** `lib/categories.ts` (`getCategory` falls back to `ISSUE_CATEGORIES[0]`), `features/report/reportWizardState.ts` (`GENERAL_CATEGORY`).
- **How:** move `GENERAL_CATEGORY` into `lib/categories.ts` (it is domain, not UI). `getCategory` returns `IssueCategory | undefined`; add `getCategoryOrGeneral`. Update `getWizardCategory` and `getCategoryByTitle`.
- **Verify:** `categories.test.ts` covers the unknown-id case.

### 1.4 Gemini API key in the request URL (A5)

- **Where:** `supabase/functions/analyze-photo-labels/index.ts` and `supabase/functions/rewrite-email/index.ts` (`?key=` on the `generateContent` URL).
- **Why:** fetch errors can include the URL, and `error_message` is written to the database.
- **How:** send the key as the `x-goog-api-key` header. Log `error.message` rather than `String(error)`. Redeploy both functions (`npm run supabase:deploy:*`).
- **Verify:** `curl` the function with `{}` (400 `missing_install_id`, no model call) and run one real photo analysis from the app.

### 1.5 Rewrite payload: stop sending contact details and GPS (A1, stopgap)

- **Where:** `lib/emailRewrite.ts` (`buildContactDetails`, `buildLocationSummary`), `lib/email.ts`.
- **How:** send `contact_details: ''` and drop the GPS line from `location`. After a successful rewrite the app appends the Contact block locally: add `appendContactBlock(body, profile)` to `lib/email.ts` (inserts before the closing "Thank you."), used in `buildPreviewEmail`. Address and description still go to the model; the full consent flow lands in 3.3.
- **Verify:** `emailRewrite.test.ts` asserts no name/phone/email/GPS in the payload; `reportWizardServices.test.ts` asserts the Contact block is present after rewrite.

### 1.6 CI (A19, moved up)

- **How:** `.github/workflows/check.yml` with two jobs. `app`: Node 22, `npm ci`, `npm run check`. `functions`: `denoland/setup-deno`, `deno check supabase/functions/analyze-photo-labels/index.ts supabase/functions/rewrite-email/index.ts`. Add a step `npm run generate:ai-catalogs && git diff --exit-code` so stale generated files fail the build. If the remote is not GitHub, the equivalent on whatever hosts it.
- **Verify:** a PR with a deliberate type error goes red.

### 1.7 Backend goes to sleep; app shows a Retry that cannot work (P4)

- **Why:** the free Supabase tier pauses projects after about a week without traffic. That is what took both AI features down before this review (restored 2026-10-05).
- **How, uptime:** scheduled workflow (`.github/workflows/keepalive.yml`, every 3 days) that calls the REST endpoint `GET $SUPABASE_URL/rest/v1/ai_photo_analysis_runs?select=id&limit=1` with the anon key, so the database itself sees traffic (RLS returns an empty list; no model cost). Check the dashboard after 8 days to confirm it counts. Add a free external uptime monitor on the function's OPTIONS endpoint. When there are real users, the honest answer is the paid plan (see Decisions).
- **How, app:** in `lib/vision.ts` and `lib/emailRewriteClient.ts`, distinguish "fetch threw" (offline/DNS) and `503` from other errors. New `PhotoVisionStatus` value `offline` with copy "Photo suggestions are offline right now. You can still pick an issue type." and no Retry button.
- **Verify:** point `EXPO_PUBLIC_SUPABASE_ANALYZE_PHOTO_URL` at a dead host in `.env.local`; the details step shows the offline copy and the report still completes.

### 1.8 Branch and worktree cleanup (A21, part)

- `codex/ai-issue-workflow`, `codex/ai-suggested-topics-polish`, `codex/coordinated-civic-snap-refactor`, `feature/ai-suggested-topics` are fully contained in `main`. `codex/ui-polish`, `feature/photo-label-suggestions`, `feature/raccoon-sprite-report-start` each have 2 commits not in `main` that look squash-merged; confirm with `git diff main...<branch> --stat` before deleting.
- Remove the three worktrees (`~/Documents/311-mobile-ui-polish`, `~/Documents/311-mobile-raccoon-sprite`, `~/.codex/worktrees/352c/311-mobile`) with `git worktree remove`, then delete local and remote branches. **Ask before deleting.**

### Phase 1 verification

- `npm run check` green; CI green on the PR.
- Simulator: 1.1 and 1.2 checks above; AI suggestion works on the pothole test photo; offline copy appears with a dead URL.
- Both functions redeployed and answering.

---

## Phase 2 — One report model + autosave

Do these as one branch with a PR per item, merged in order. They all touch the same files.

### 2.1 `Report` becomes the single draft shape (A6) — M

- **Where:** `lib/types.ts`, `lib/reportPersistence.ts`, `lib/email.ts`, `lib/emailRewrite.ts`, `features/report/reportWizardState.ts`, `features/report/reportWizardServices.ts`.
- **Now:** a report is hand-copied between `ReportWizardState`, `DraftReportInput`, `CreateReportInput`, `Report` and `ReportRow`. `locationNote` is lost on resume (`reportWizardState.ts` resume sets it to `''`; the DB has no column). Checklist answers are stored as display labels joined with `", "`.
- **How:**
  - `Report` gains `locationNote: string`. `answers` becomes `Record<string, string | string[]>`: text answers as strings, picklist/radio as the option **value**, multipicklist as an array of values. The email builder maps values back to labels through the question's options.
  - Delete `DraftReportInput`. `buildEmail({ report, category, profile })` takes a `Pick<Report, …>`.
  - `CreateReportInput = Omit<Report, 'id' | 'createdAt' | 'updatedAt'>` (already so; keep).
  - `ReportWizardState` keeps UI-only fields and embeds `draft: DraftFields`. `resumeReport` becomes one spread; `buildReportDraftInput` disappears.
  - Migration v3 adds `location_note`. Legacy answers: on read, if a stored value equals an option label, convert it to the value; otherwise keep it as text.
- **Verify:** `reportPersistence.test.ts` (legacy answers, location note round trip), `email.test.ts` (labels rendered from values), reducer tests.

### 2.2 Status codes instead of UI strings (A17) — S

- `ReportStatus = 'draft' | 'handed_off' | 'sent' | 'case_added'`. `handed_off` means the share sheet or mail composer opened but the user has not confirmed; `sent` means they confirmed (Phase 3 uses this).
- Migration v3 rewrites existing rows (`Draft → draft`, `Mail opened → handed_off`, `Case added → case_added`). `parseReportStatus` accepts both old and new values.
- Labels move to `lib/reportTracking.ts`: draft "Resume draft", handed_off "Did you send it?", sent "Needs case number", case_added "Case number saved". History sections become Drafts / Sent.

### 2.3 Migrations run once, in order (A8) — S

- New `lib/db.ts`: `openDatabase()` memoises a promise that opens `civic-snap.db`, reads `PRAGMA user_version`, runs the pending entries of an ordered `MIGRATIONS` list inside `withExclusiveTransactionAsync`, and sets the version. Version 1 = the existing table plus column backfills; 2 = relative photo paths (1.2); 3 = status codes + `location_note`.
- `lib/reports.ts` calls `openDatabase()` and never migrates on its own.
- **Verify:** a test over the migration list (versions strictly increasing, SQL parses); simulator upgrade from a pre-change build keeps drafts.

### 2.4 Autosave and photo cleanup (A7) — M

- New hook `useDraftPersistence(draft, savedReportId)`: create the row when the draft first becomes non-empty (photo stored, category chosen, address or description typed); afterwards debounce-save 600 ms after changes and on every step change. `previewEmail` no longer saves; it only builds the email.
- "Return to start" keeps a saved draft (that is already the promise in the alert copy). If nothing was saved, delete the photo files.
- Startup sweep `sweepOrphanPhotos()` after the database opens: list the `reports/` directory, delete files not referenced by any row and older than 24 hours.
- **Verify:** kill the app mid-report; relaunch; the draft is in History with its photo. Retake a photo; the old file is gone.

### 2.5 Replace `expo-file-system/legacy` (A20, part) — S

- `lib/photos.ts` moves to the current API (`Paths.document`, `Directory`, `File`). Done here because the file is already open for 2.4.

### Phase 2 verification

- All existing tests updated and green; new tests for migrations, legacy answers, location note.
- Simulator: upgrade path from the Phase 1 build (drafts, photos, statuses intact); autosave check above.

---

## Phase 3 — The send path

This is the product-critical phase. It fixes the two things that stop real users from succeeding: sending from non-Apple-Mail phones, and the AI rewrite that never arrives.

### 3.1 One backend client (A12) — S

- `lib/backend/config.ts` reads the env vars once and exposes `features.photoLabels` and `features.emailRewrite` (new flag `EXPO_PUBLIC_EMAIL_REWRITE_ENABLED`; add to `.env`, `.env.example`, README).
- `lib/backend/client.ts`: `postJson(url, body, { timeoutMs, signal })` with shared headers, the timeout signal, and one `BackendError` with codes `disabled | offline | timeout | rate-limited | server | invalid-response`. `vision.ts` and `emailRewriteClient.ts` shrink to payload building and response normalising.

### 3.2 Email draft state: generated, user-edited, AI (A10) — M

- **Now:** `useReportWizard` detects user edits by rebuilding the email and comparing strings; re-previewing re-runs the rewrite and discards edits.
- **How:** `email: { generated: Email; edited: Partial<Email> | null; ai: { body; model; promptVersion } | null; source: 'generated' | 'user' | 'ai' }` with a derived `currentEmail`. A profile change regenerates `generated` and, only when `source === 'generated'`, what is shown. Persist `email_source` (migration v4) so a resumed draft knows the text was user-edited.
- **Verify:** reducer tests for each transition; edit → leave preview → come back → edits intact.

### 3.3 "Polish with AI" as a button, with consent (P2, A1 full) — M

- **Now:** every "Preview email" blocks for up to 8 s on the rewrite; the function takes 8.6–9.8 s, so the result is always discarded.
- **How:** the preview shows the generated email immediately. Under it, a "Polish with AI" button (hidden when the feature flag is off or the backend is offline). First tap opens a consent sheet that lists exactly what is sent (issue, description, address and location note, checklist answers) and what is not (name, phone, email, GPS, photo), with "Allow" (stored as a setting, also a toggle in Settings) and "Not now". The call is non-blocking: the button shows a spinner and a Cancel, client timeout 25 s (server timeout is 20 s). On success, if the user has not edited meanwhile, apply it and show a banner "AI-polished — check the facts · Undo"; if they have edited, offer "AI version ready — Replace?".
- Remove the rewrite call from `saveReportDraft`.
- **Verify:** consent persists; cancel works; the simulator shows the generated email instantly.

### 3.4 Keep the user's facts (P5) — S

- **Now:** "cyclists are swerving around it" became "causing cyclists to swerve into traffic".
- **How:** add rules to `supabase/functions/rewrite-email/logic.ts` prompt: do not add causes, consequences, hazards or severity that are not explicitly stated; do not change measurements or directions; prefer the reporter's own wording in the Details section. Keep temperature at 0.2. The 3.3 banner and Undo cover the rest.
- **Verify:** `emailRewriteFunction.test.ts` asserts the rules are in the prompt; manual check with the same input.

### 3.5 Preview screen puts the email first (P11) — S

- Order: email card (To, Subject that wraps, Body) → attachment line → one combined notice ("Saved as a draft. You send it from your own email app.") → contact nudge only when the phone number is missing ("Add a phone number so 311 can follow up?" → Settings), shown once per draft.
- Body: drop the "Category path:" line; add a map link under the GPS line when coordinates exist (`https://maps.google.com/?q=<lat>,<lng>`, works on any desktop for 311 staff).

### 3.6 Share-sheet handoff and "Did you send it?" (P1) — M

- **Now:** `MailComposer.isAvailableAsync()` is false on any iPhone without Apple Mail set up (Gmail, Outlook), so those users land on "Mail unavailable" and the fallback loses the photo. The result of `composeAsync` is ignored; everything is marked "Mail opened".
- **How:** `openSavedReportMail` becomes `handOffReport` with three paths:
  1. Apple Mail available → `MailComposer.composeAsync` as now, but map its result: `sent → sent`, `saved → handed_off`, `cancelled → stays draft`.
  2. Otherwise → React Native `Share.share({ message: "To: 311@toronto.ca\n\n" + body, url: photoUri, title: subject }, { subject })`. On iOS this returns `{ action, activityType }`; `sharedAction → handed_off` (store the activity type so History can say "Handed off to Gmail"), `dismissedAction → draft`. Then ask "Did you send it?" → Yes marks `sent`.
  3. No share available (web) → existing copy + `mailto:` fallback → `handed_off`. Add a one-tap "Copy 311@toronto.ca" button to the fallback.
- Record `handoff_method` and `handed_off_at` (migration v4).
- **Verify:** the simulator has no Mail account, so it exercises path 2. Web exercises path 3. Tests for the status mapping.

### 3.7 Success screen (P12) — S

- A `done` step after a successful handoff: raccoon, "Sent to 311" or "Handed off to <app>", what happens next (311 replies by email; add the case number here when it arrives; no promised timelines), buttons "New report" and "Add case number later". Replaces the 5-second banner.
- Optional later: a local reminder after a few days to add the case number (needs `expo-notifications` and a permission prompt; not in this phase).

### Phase 3 verification

- Simulator: photo report → preview appears instantly → Polish with AI (consent → result → Undo) → share sheet → "Did you send it?" → success screen → History shows Sent / Needs case number.
- Web: mailto path still works.
- Function redeployed with the new prompt rules.

---

## Phase 4 — Report flow restructure

Start with 4.1 (tiny) because 4.5 and 4.6 read from it. 4.2 and 4.3 are the structural work; 4.4–4.7 are the step-by-step improvements and can be separate PRs.

### 4.1 City config (A18) — S

- `lib/city.ts`: `{ id, name, recipient, greeting, defaultRegion, bounds, islandBounds, notHandled: [{ match, title, body, url }], aiCityName }` for Toronto. The email builder, map defaults, prompts and search redirects read from it. The issue catalog stays Toronto-specific for now; a per-city catalog is a later decision.

### 4.2 Split the wizard hook (A9) — M

- `useReportWizard` (573 lines) becomes a thin composer of `usePhotoCapture`, `usePhotoAnalysis` (abort controller, status), `useLocationPin` (GPS, reverse-geocode debounce, address edit versioning), `useEmailDraft` (3.2), `useDraftPersistence` (2.4). `reportWizardReducer` stays pure and tested.
- The raccoon animation moves into a `RaccoonSprite` component with its own interval, so the start screen stops re-rendering the whole wizard every 67 ms.

### 4.3 Wizard as a full-screen route; step tracker; scroll (P10) — M

- **Now:** the wizard lives inside the Report tab, so the tab bar, the tab header, the step tracker and the sticky button leave about half a small screen for content. The tracker marks "Issue" done before an issue is chosen and jumps to step 1 when searching from Details. Each step opens at the previous step's scroll position.
- **How:** new stack route `app/report/new.tsx` (`headerShown: false`, swipe-back disabled; the wizard's own Back/✕ handle navigation). The Report tab becomes the home screen (6.3). Tracker steps derive from the path: photo path Photo → Location → Details → Email, manual path Issue → Location → Details → Email; opening the category search from Details keeps the tracker at Details. Reset scroll on step change (`key={step}` on the `Screen` scroll view).

### 4.4 AI-first photo path (P6) — M

- **Now:** the suggestion appears late, on Details, often after the user picked an issue by hand; choosing a suggestion wipes checklist answers (`togglePhotoIssueTopic` resets `answers`).
- **How:** new `suggest` step straight after the photo when photo analysis is on. Loading: skeleton with "Checking the photo…" and a "Skip, I'll choose" button; if it takes more than ~6 s, continue to Location and surface suggestions on Details when they arrive. Ready: the top candidate big ("Looks like: Road Pothole / Road Damage — Strong match") with "That's it", smaller alternatives, "Something else" (opens search), "Skip". Empty or offline: go to the category search. When analysis is available but off, show "Turn on photo suggestions" inline, which finally wires `enablePhotoAnalysisForCurrentReport` (today it is exported but unused). Reducer: keep `answers` when the selected issue id does not change.
- **Verify:** reducer tests; simulator with the pothole test photo.

### 4.5 Location step (P7) — M

- Pass `exif: true` to the image picker and use the photo's GPS as the initial pin with a "From photo" chip; fall back to device location, then the city default. Show the map immediately instead of after "Use current location".
- `showsPointsOfInterest={false}` so restaurant icons do not compete with the pin.
- `formatAddress` in `reportWizardServices.ts`: iOS returns `name` "439 Queen St W" and `street` "Queen St W"; use `name` when it contains `street`, and drop the region when the city is present → "439 Queen St W, Toronto".
- Outside-city notice from `city.bounds` (non-blocking): "This spot looks outside Toronto. 311 Toronto only handles locations in the city."

### 4.6 Search that understands everyday words (P8) — M

- **Now:** "streetlight", "trash", "abandoned" return nothing; results are unranked ("ice" lists "Injured – Wildlife" first because of substring matches inside question text).
- **How:** the generator emits a `searchText` per issue from title, category path and a hand-curated `data/search-synonyms.json`. A small scorer (no dependency): word-prefix matching, weights title 3 / synonyms 2 / path 1 / question text 0.5, sorted by score then title. Redirect cards for `city.notHandled` (streetlights → Toronto Hydro, transit → TTC) show as a distinct card instead of zero results. Empty state offers "General 311 report" and "Describe it in your own words".
- **Verify:** the query table from the review becomes a test: `streetlight` → redirect, `trash` → garbage issues first, `ice` → icy sidewalk first, `pothole` → Road Pothole first.

### 4.7 Checklist (P9) — M

- Sentence-case question labels (keep uppercase only for short field labels); a "Required" tag from `isRequired`; prefill "exact location" text questions from address + location note; auto-answer the Toronto Island question from `city.islandBounds` (editable); collapse optional questions behind "More questions (n)". Rules live in `lib/checklistRules.ts` until 5.3 moves them into the data file.

### Phase 4 verification

- Smoke script steps 2–4 end to end on the new route; tracker and scroll behave; no tab bar inside the wizard.
- Search test table green.

---

## Phase 5 — Backend hardening (parallel with Phase 4)

Separate codebase (`supabase/`), so this can run alongside Phase 4. 5.2 ships after 4.4 so the app and server change the taxonomy contract together.

### 5.1 Shared function code and a burst-safe rate limit (A13) — M

- `supabase/functions/_shared/{cors,gemini,rateLimit,log,hash}.ts`; both functions become thin handlers.
- Rate limit: insert a `pending` row first, count including pending, delete the row and return 429 if over the cap, otherwise call Gemini and update the row. Migration: allow `pending` in the status CHECK; ignore pending rows older than 5 minutes in counts. Run the global and per-install counts with `Promise.all`. Count regardless of `prompt_version` so a prompt bump does not reset everyone's quota.
- Pin `@supabase/supabase-js` to an exact version in the import.
- **Verify:** `photoLabelsFunction.test.ts` / `emailRewriteFunction.test.ts` for the shared helpers; a burst of 10 parallel curl calls yields at most the cap.

### 5.2 Taxonomy versioning and server-side label descriptions (A15) — M

- App: stop sending `allowedLabels` (about 12 KB per request that the server ignores); send `taxonomyVersion` only. Server: keep accepting `allowedLabels` for old app builds; accept a `SUPPORTED_TAXONOMY_VERSIONS` set so an older app keeps working after a taxonomy change; the generator emits label descriptions into the edge catalog so Gemini sees them (today `buildServerAllowedLabels` humanises ids and drops the descriptions).
- **Verify:** contract tests in `photoAnalysisContract.test.ts` updated; an app build on the previous taxonomy version still gets suggestions.

### 5.3 Rules as data (A16) — S

- Move labels, discoverability rules, suppression groups, synonyms (4.6) and checklist hints (4.7) out of `scripts/generate-ai-issue-catalogs.cjs` into `data/issue-rules.json`. The generator emits `versions.ts` for both app and edge so the version string is written once. CI's diff check (1.6) proves the generated files are fresh.

### 5.4 Anonymous auth (A14) — M, launch gate

- Today the install id is any string the app makes up, so one person can exhaust the shared daily cap. When the app goes public: `supabase.auth.signInAnonymously()` on first launch, functions keep `verify_jwt` and use the token's `sub` as the identity, drop `installId` from the body. Decide at launch time (see Decisions); not needed for a private beta.

### 5.5 Latency experiment — S

- Measure p50/p95 from `ai_email_rewrite_runs.latency_ms` and `ai_photo_analysis_runs.latency_ms`. Try a lower thinking level and a `maxOutputTokens` cap on the rewrite; stop sending the default email *and* all its fields separately (the prompt currently carries both). Target under 5 s for the rewrite.

---

## Phase 6 — Surfaces

### 6.1 One app-state store and `Stack.Protected` (A11) — M

- `lib/appState.tsx`: a provider at the root loads profile, photo-analysis setting, AI consent and the onboarding flag once; `useAppState()` everywhere. Settings writes update the store. Replace the manual onboarding redirect in `app/_layout.tsx` (which calls `hasCompletedOnboarding` twice) with `Stack.Protected`. The wizard stops reloading the profile on every focus.

### 6.2 Onboarding (P15) — S

- One screen: what the app does in three lines (photo → draft → you send it), the privacy line (stays on your phone; AI help is optional), "Get started". Contact details leave onboarding; the preview nudge (3.5) and Settings cover them. Removes the two buttons that do the same thing when the fields are empty.

### 6.3 Home screen (P16) — S

- Hero text and raccoon at the top; a "Continue your draft" card for the most recent draft (thumbnail, title, time); action block bottom-aligned in thumb reach: "Take photo" primary, "Choose from library" secondary, "Report without a photo" as a text link (this is the manual path; drop the separate "Choose issue type"). Emergency notice as one small line at the bottom.

### 6.4 History (P13) — S

- Relative dates ("2 hours ago", "25 May"), a status chip, swipe-to-delete with confirmation (`ReanimatedSwipeable` from `react-native-gesture-handler`; add the dependency explicitly) instead of a red ✕ on every row. Sections: Drafts, Sent, Closed (case added).

### 6.5 Map (P14) — S

- `fitToCoordinates` over all pins on load (today it centres on the first pin, so "5 pins" shows one, half off-screen). Colour markers by status. Keep the tab for now; revisit folding it into History once there is usage data (see Decisions).

---

## Phase 7 — Release readiness

### 7.1 Build and store configuration (A20) — M

- `eas.json` with development, preview and production profiles; `app.config.ts` so the Android Google Maps key comes from an env var (standalone Android builds need it for maps); runtime version policy and EAS Update. App Store privacy answers: photo and text are sent to Google through your backend only when the user opts in. Web: keep the build in CI as a dev preview, but do not ship it (see Decisions).

### 7.2 Measurement — M

- A setting "Share anonymous usage" and an `app_events` table (hashed install, event name, non-PII props, app version, timestamp) with an insert-only RLS policy for the anon key, written through the shared client (3.1) with a small queue. Events: `report_started`, `photo_added`, `ai_suggestion_shown`, `ai_suggestion_accepted`, `preview_opened`, `ai_polish_used`, `handed_off`, `sent_confirmed`, `case_added`. One SQL view for the funnel. Without this there is no way to tell whether the app works.

### 7.3 Docs and cleanup (A21, rest) — S

- Rewrite the decisions in `context.md` (status codes, autosave, share handoff, AI consent, city config), regenerate `docs/diagrams.md`, update the README env section. Move duplicated helpers (`stringValue`, `createTimeoutSignal`, `normalizeConfidenceTier`) into `lib/utils/`.

---

## Decisions needed

Recommendation first in each case.

1. **Handoff path (3.6):** Apple Mail composer when available, share sheet otherwise *(recommended; best experience for each group)* — or share sheet for everyone (one code path, but Apple Mail users lose the prefilled recipient).
2. **AI rewrite consent (3.3):** opt-in per device with a consent sheet *(recommended; matches the "stays on your phone" promise)* — or on by default with a notice.
3. **Backend uptime (1.7):** keep-alive job on the free tier for now *(recommended until there are real users)* — then the paid Supabase plan, which also removes the pause risk entirely.
4. **Anonymous auth (5.4):** do it before public launch *(recommended)* — or keep install ids for a private beta.
5. **Web build:** keep as a dev preview only *(recommended; useful for quick checks, and dropping it removes several workarounds later if wanted)* — or support it — or drop it.
6. **Map tab (6.5):** keep and fix fitting *(recommended)* — or fold into History as a toggle.
7. **Direct submission:** depends on the Phase 0 result.
8. **Measurement default (7.2):** off by default, asked once at first send *(recommended)* — or on by default.

---

## Index: finding → plan item

| Finding | Where it lands |
|---|---|
| A1 rewrite sends PII without opt-in | 1.5 (stopgap), 3.3 (full) |
| A2 resumed draft reloads | 1.1 |
| A3 absolute photo paths | 1.2 |
| A4 unknown issue → first catalog entry | 1.3 |
| A5 Gemini key in URL | 1.4 |
| A6 four report shapes; locationNote lost; answers as labels | 2.1 |
| A7 save as you go; orphan photos | 2.4 |
| A8 migrations on every query | 2.3 |
| A9 split `useReportWizard`; raccoon re-renders | 4.2 |
| A10 email edits tracked by string compare; blocking rewrite | 3.2, 3.3 |
| A11 shared store; `Stack.Protected` | 6.1 |
| A12 shared backend client and config | 3.1 |
| A13 shared function code; rate-limit race | 5.1 |
| A14 install id easy to dodge | 5.4 |
| A15 taxonomy version brittle; 12 KB payload; descriptions dropped | 5.2 |
| A16 catalog rules into a data file | 5.3 |
| A17 status as UI text | 2.2 |
| A18 Toronto details scattered | 4.1 |
| A19 no CI | 1.6 |
| A20 legacy file system; eas.json; Android maps key; web | 2.5, 7.1 |
| A21 branches; docs mismatch; duplicated helpers | 1.8, 7.3 |
| P1 sending fails without Apple Mail | 3.6 |
| P2 AI rewrite never reaches users | 3.3 |
| P3 two confirmed bugs | 1.1, 1.2 |
| P4 backend sleeps; Retry that cannot work | 1.7 |
| P5 AI changed a fact | 3.4 |
| P6 AI guess first; answers wiped | 4.4 |
| P7 photo GPS; map immediately; address dedupe; POIs; outside-city | 4.5 |
| P8 search synonyms, ranking, redirects | 4.6 |
| P9 checklist trim | 4.7 |
| P10 full-screen flow; tracker; scroll | 4.3 |
| P11 preview layout; contact prompt; subject; category path; map link | 3.5 |
| P12 success screen; case-number reminder | 3.7 |
| P13 history dates, swipe-to-delete, continue-draft card | 6.4, 6.3 |
| P14 map fit; tab question | 6.5 |
| P15 onboarding | 6.2 |
| P16 start screen hierarchy | 6.3 |
| Riskiest assumption; measurement | 0.1–0.2, 7.2 |

---

## Working agreements

- One PR per numbered item; the PR title starts with the item id (`1.2 Store photo paths relative`).
- CI green before merge; for native items, note the smoke-script steps you ran in the PR description.
- When a decision above is made, record it in `context.md` under Architecture Decisions in the same PR.
- Keep `docs/diagrams.md` and this plan in step: tick items off here as they merge.

## Verification setup (simulator)

- Start the dev server: `npx expo start` (or the `civic-snap-web` entry in `~/.claude/launch.json`).
- Boot iPhone 17 Pro, open Expo Go at `exp://127.0.0.1:8081`. Expo Go 54.0.7 is cached at `~/.expo/ios-simulator-app-cache/` and installs with `xcrun simctl install booted <path>`.
- Test photo: `xcrun simctl addmedia booted docs/toronto-311-spot-checks/02-road-pothole.png`.
- Test location: `xcrun simctl location booted set 43.6487,-79.3960` (Queen St W & Spadina Ave).
- The simulator has no Mail account, which is exactly the non-Apple-Mail path from 3.6.

## Smoke script

1. Fresh install → onboarding → home.
2. Photo report with AI on: choose the pothole photo → suggestion → location (map, address) → details → preview → handoff → "Did you send it?" → success → History shows it under Sent.
3. Manual report without a photo, through to preview.
4. Resume a draft → ✕ → Return to start → home stays.
5. Kill the app mid-report → relaunch → draft in History with its photo.
6. Point the backend env at a dead host → AI states show the offline copy; the report still completes.
7. Settings: profile and toggles persist across relaunch.
8. `npm run build:web` succeeds and the web preview loads.
