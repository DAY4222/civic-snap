# Civic Snap: user flows (current app)

A map of every screen and path in the app as it works today, for the redesign. It was built from the code in `app/` and `features/`, and checked by clicking through the web build at iPhone size. The screenshots are in [`screens/`](screens/), and [`overview.png`](overview.png) shows all of them on one sheet.

> The screenshots come from the **web build**. On web, maps show a placeholder, a photo can't be saved, and sending uses a copy/mailto screen instead of Apple Mail. Run the app in the iOS Simulator (below) to see those parts as users do.

---

## 1. Run it in the iOS Simulator (on your Mac)

You need a Mac with **Xcode** installed from the App Store. Open Xcode once so it installs the simulator, and install **Node.js 20.19 or newer** (Expo SDK 54 needs it). Then:

```bash
git clone https://github.com/DAY4222/civic-snap.git
cd civic-snap
npm install
npm run ios
```

`npm run ios` starts Expo and opens the app in the simulator through **Expo Go**, which installs itself the first time. Press `i` in the terminal to reopen it, and `r` to reload after code changes.

Simulator tips for testing:
- **Location:** Simulator menu → Features → Location → Custom Location. Use `43.6526, -79.3839` (Toronto City Hall). A spot outside Toronto shows the "outside the city" warning.
- **Photos:** drag an image from Finder onto the simulator to add it to Photos, then use "Choose from library". The simulator has no camera, so "Take photo" won't work. Sample images are in `docs/toronto-311-spot-checks/`.
- **Start over** (see onboarding again, clear history): long-press Expo Go → Remove App, or Device → Erase All Content and Settings.
- **Mail:** the simulator has no Apple Mail account, so "Open Mail" becomes **"Choose email app"** and opens the share sheet. That is the "Mail not set up" path below.

---

## 2. Screen inventory

| # | Screen | Route | How you get there |
|---|---|---|---|
| S1 | Onboarding | `/onboarding` | First launch only, until "Get started" is tapped |
| S2 | Report tab (Home) | `/` (tab 1) | After onboarding; the default tab |
| S3 | History tab | `/history` (tab 2) | Tab bar |
| S4 | Map tab | `/map` (tab 3) | Tab bar |
| S5 | Settings | `/settings` (modal) | Gear icon on Home; "Edit profile" on Email preview |
| S6 | Report wizard | `/report/new` (full screen, no tab bar) | Home, History, Map, Report detail |
| S7 | Report detail | `/report/[id]` | Tapping a sent report in History or Map; "View report" on Done |

The wizard (S6) holds 8 internal steps: **Suggest**, **Search**, **Location**, **Details**, **Preview**, **Fallback**, **Done**, plus a brief loading state. A 4-step tracker runs across the top: **1 Issue → 2 Location → 3 Details → 4 Email**.

---

## 3. App-level map

```
                        ┌──────────────────────┐
     first launch ────▶ │ S1 Onboarding        │
                        │ [Get started]        │
                        └──────────┬───────────┘
                                   ▼
 ┌─────────────────────────────── TAB BAR ───────────────────────────────┐
 │                                                                       │
 │  ┌────────────────────┐   ┌────────────────────┐   ┌────────────────┐ │
 │  │ S2 Report (Home)   │   │ S3 History         │   │ S4 Map         │ │
 │  │  ⚙ → S5 Settings   │   │  Drafts / Sent /   │   │  pins by status│ │
 │  │  Take photo ───────┼─┐ │  Case number saved │   │  Draft·Sent·   │ │
 │  │  Choose library ───┼─┤ │  tap draft ────────┼─┐ │  Case saved    │ │
 │  │  No photo ─────────┼─┤ │  tap sent ─────────┼─┼─┼─▶ S7 Detail    │ │
 │  │  Continue draft ───┼─┤ │  swipe ← Delete    │ │ │  tap draft ──┐ │ │
 │  └────────────────────┘ │ │  empty: Start ─▶S2 │ │ │  empty ▶ S2  │ │ │
 │                         │ └────────────────────┘ │ └──────────────┼─┘ │
 └─────────────────────────┼────────────────────────┼────────────────┼───┘
                           ▼                        ▼                ▼
                  ┌───────────────────────────────────────────────────────┐
                  │ S6 Report wizard (full screen)  → see section 4       │
                  └───────────────────────┬───────────────────────────────┘
                                          │ Done → "View report"
                                          ▼
                  ┌───────────────────────────────────────────────────────┐
                  │ S7 Report detail                                      │
                  │  Draft → [Resume draft] → S6                          │
                  │  Not confirmed → [Yes, it's sent]                     │
                  │  Sent → enter case number → [Save case number]        │
                  │  [Delete local report] → confirm → back               │
                  └───────────────────────────────────────────────────────┘
```

Rule of thumb: **drafts always open in the wizard, and anything already sent opens in Report detail.** This holds in History, Map and the Home draft card. A resumed draft that turns out to be sent redirects to Detail.

---

## 4. The report wizard (S6)

### 4a. How a report starts

```
 Home: Take photo ─────┐
 Home: Choose library ─┤─▶ OS camera / photo picker
                       │     ├─ cancelled ─────────────────▶ stay on Home
                       │     ├─ camera permission denied ──▶ alert "Camera needed"
                       │     │                                [OK] [Open Settings]
                       │     └─ photo picked (+ GPS from the photo if it has one)
                       │            │
                       │            ▼
                       │     photo saved? ── no ──▶ alert "Photo not saved" ─▶ SEARCH
                       │            │ yes
                       │            ▼
                       │     photo suggestions setting
                       │       ├─ on, or never asked ─▶ SUGGEST
                       │       └─ off (or AI disabled in build) ─▶ SEARCH
                       │
 Home: Report without a photo ───────────────────────────▶ SEARCH
 Continue your draft / History draft / Map draft / Detail "Resume draft"
                                                          ▶ DETAILS (step 3)
```

### 4b. The main path

```
 ┌──────────────── 1 ISSUE ────────────────┐
 │                                         │
 │  SUGGEST  "What's the issue?"           │   (photo reports only)
 │   mode = opt-in                         │
 │     "Get a suggestion from your photo"  │
 │     [Turn on photo suggestions] ─▶ mode = loading
 │     [Not now] ─────────────────────────────────────▶ SEARCH (setting → off)
 │   mode = loading  "Checking the photo…" │
 │     [Skip, I'll choose] ───────────────────────────▶ SEARCH
 │     after a delay: [Continue without waiting] ─────▶ LOCATION
 │   mode = ready  "Looks like <issue>"    │
 │     [That's it] ───────────────────────────────────▶ LOCATION
 │     "Or maybe" alternatives (tap one) ─────────────▶ LOCATION
 │     [Something else] ──────────────────────────────▶ SEARCH
 │     "Choose later" ────────────────────────────────▶ LOCATION (no issue yet)
 │   mode = failed  "No suggestion this time"
 │     [Try again] (when retryable) ─▶ mode = loading
 │     [Search issue types] ──────────────────────────▶ SEARCH (shows why it failed)
 │     "Choose later" ────────────────────────────────▶ LOCATION
 │                                         │
 │  SEARCH  "Search issue types"           │
 │   empty query → "General 311 report" + 6 Common issues
 │   typed query → "Best matches" + General 311 report
 │   not a 311 issue (e.g. streetlight) → redirect card [Report it there] ─▶ external site
 │   tap any issue ───────────────────────────────────▶ LOCATION
 └─────────────────────────────────────────┘
 ┌──────────────── 2 LOCATION ─────────────┐
 │  "Confirm location"                     │
 │   map with a fixed centre pin (move the map under it)
 │   pin starts at the photo's GPS, else the phone's location
 │   ◎ button = use current location       │
 │   location off → notice, tap → iOS Settings
 │   outside Toronto → warning notice      │
 │   Address or nearest landmark (text)    │
 │   Location note (text)                  │
 │   [Use this spot] (needs pin or address) ─────────▶ DETAILS
 └─────────────────────────────────────────┘
 ┌──────────────── 3 DETAILS ──────────────┐
 │  "Add details"                          │
 │   Issue type card + [Search all issue types] ──▶ SEARCH, returns here
 │   Photo suggestions (if photo + AI on): chips, Retry
 │   Short description (required) + "Suggested sentence" → Insert
 │   "311 needs to know" checklist (required questions first,
 │      some pre-filled from location, marked "Filled in from your location")
 │   "More questions" (optional)           │
 │   sticky [Preview email] (needs description + location) ─▶ PREVIEW
 └─────────────────────────────────────────┘
 ┌──────────────── 4 EMAIL ────────────────┐
 │  PREVIEW  "Email preview"               │
 │   To: 311@toronto.ca, editable Subject + Body
 │   [Rebuild email] (when details changed after edits)
 │   [Polish with AI]                      │
 │      first time → consent sheet "Polish your email with AI?"
 │         Sent / Never sent lists, [Allow and polish] [Not now]
 │      loading → [Cancel]                 │
 │      result → "AI version ready" [Use AI version] [Keep mine]
 │      applied → "AI-polished, check the facts" [Undo]
 │      error → message + [Try AI polish again]
 │   no phone in profile → card "Add a phone number?" [Edit profile] ─▶ S5, or ✕ dismiss
 │   sticky send button:                   │
 │     iOS, Mail set up    [Open Mail] ───▶ Apple Mail composer
 │        ├─ sent ─────────────────────────────────────▶ DONE (Sent)
 │        ├─ saved/closed ─────────────────────────────▶ DONE (Not confirmed)
 │        └─ cancelled ────────────────────────────────▶ stay on PREVIEW
 │     iOS, no Mail     [Choose email app] ─▶ share sheet (recipient copied)
 │        ├─ app picked ───────────────────────────────▶ DONE (Not confirmed)
 │        └─ dismissed ────────────────────────────────▶ stay on PREVIEW
 │     web              [Send by email] ─────────────────▶ FALLBACK
 │     any error ─▶ alert "Couldn't open your email" ───▶ FALLBACK
 │                                         │
 │  FALLBACK  "Send by email"              │
 │   [Open in email app] (mailto) [Copy email text] [Copy 311@toronto.ca]
 │   [I've sent it] ──────────────────────────────────▶ DONE (Sent)
 └─────────────────────────────────────────┘
 ┌──────────────── DONE ───────────────────┐
 │  Sent:          "Sent to 311"           │
 │     [New report] → Home     [View report] → S7
 │  Not confirmed: "Ready in <app>"        │
 │     [I've sent it] → becomes Sent    [New report] → Home
 │  "What happens next": replies, case number, privacy
 └─────────────────────────────────────────┘
```

### 4c. Back, close and saving

| From | Back (‹ or Android back) goes to |
|---|---|
| Suggest | leaves the wizard |
| Search (first step) | leaves the wizard |
| Search, opened from Suggest | Suggest |
| Search, opened from Details | Details |
| Location | Suggest or Search, whichever was the issue step |
| Details | Location |
| Preview | Details |
| Fallback | Preview |

- **✕ (close)** on any step: if the draft has content, an alert asks "Leave this report? Your draft is saved in History" with [Keep editing] [Leave]. An empty draft closes straight away.
- The **iOS swipe-back gesture is off** in the wizard, so leaving always goes through the save.
- **Autosave:** the draft is saved once it has content, after every change, and when the app goes to the background. Nothing is lost by leaving.

---

## 5. Report statuses (what History, Map and Detail show)

```
 draft ──(Mail reports "sent", or "I've sent it")──────────────▶ sent ──(case number saved)──▶ case_added
   │                                                               ▲
   └──(Mail saved/closed, or share sheet)──▶ handed_off ──("I've sent it" / "Yes, it's sent")──┘
```

| Status | History section | Chip | Map pin | Detail screen shows |
|---|---|---|---|---|
| `draft` | Drafts | Draft | grey | [Resume draft] |
| `handed_off` | Sent | Not confirmed (warning) | blue | "Confirm when it's sent" [Yes, it's sent] |
| `sent` | Sent | Sent | blue | Case number field [Save case number] |
| `case_added` | Case number saved | Case SR-… | green | Saved case number [Update case number] |

Reports without a location show in History but not on the Map.

---

## 6. Settings (S5)

- **Profile:** Name, Email, Phone → [Save profile]. These go into the email draft, and are stored on the device only.
- **Photo analysis** switch: the same setting as "Turn on photo suggestions" / "Not now" in the wizard.
- **AI email polish** switch: the same as agreeing on the consent sheet.
- [Done] closes the modal. Edits made here while a report is open carry back into the report.
- If a build has AI turned off, each switch is replaced by "…is unavailable in this build".

---

## 7. Edge and error states worth designing for

| Where | State | Current treatment |
|---|---|---|
| Home | Camera permission denied | Alert with [Open Settings] |
| Wizard start | Photo couldn't be saved | Alert, continues to Search without the photo |
| Wizard start | Resumed draft was deleted | Alert "Draft not found", goes back |
| Suggest | Offline, rate-limited, image too large, no match | "No suggestion this time" with the reason; Search shows a notice |
| Location | Location permission off | Tappable notice → iOS Settings |
| Location | Pin outside Toronto | Warning notice; you can still continue |
| Details → Preview | Draft failed to save | Alert "Draft not saved" |
| Preview | AI polish limit, offline, timeout | Inline message; the email stays as it was |
| Preview | Can't open email | Alert → Fallback screen |
| History / Map | Load failed | Inline "could not be loaded" text |
| History | Swipe to delete | Confirm alert; wording differs for drafts and sent reports |

---

## 8. Things that differ on web (the screenshots)

- **Maps** show "Map preview unavailable on web" with the coordinates (screens 05, 09, 10, 20).
- **Photo reports** can't save the photo, so they fall back to Search. The Suggest step and photo suggestions **only appear on iOS/Android**.
- **Send** always goes to the Fallback screen (15), never Apple Mail or the share sheet.
- **Alerts** (leave confirmation, delete confirmation, errors) don't appear on web.
- The Settings profile notes it is stored in browser storage.

## 9. Screenshot index

| File | Screen |
|---|---|
| `01-onboarding.png` | S1 Onboarding |
| `02-home.png` | S2 Home, no draft |
| `03-settings.png` | S5 Settings |
| `04-history-empty.png` | S3 History, empty state |
| `05-map-empty.png` | S4 Map, empty state |
| `06-wizard-search-common.png` | Search, common issues |
| `07-wizard-search-redirect.png` | Search, "streetlight" redirect to Toronto Hydro |
| `08-wizard-search-results.png` | Search, "pothole" results |
| `09-wizard-location.png` | Location, empty |
| `10-wizard-location-filled.png` | Location, address and note filled in |
| `11-wizard-details.png` | Details, top (Preview disabled until a description is entered) |
| `12-wizard-details-checklist.png` | Details, checklist with pre-filled answers |
| `13-wizard-email-preview.png` | Email preview with the "Add your name and phone" prompt |
| `14-wizard-ai-polish-consent.png` | AI polish consent sheet |
| `15-wizard-send-fallback-web.png` | Fallback "Send by email" (web) |
| `16-wizard-done.png` | Done, "Sent to 311" |
| `17-report-detail.png` | S7 Report detail, sent, needs case number |
| `18-home-continue-draft.png` | Home with the "Continue your draft" card |
| `19-history.png` | History with Drafts and Sent |
| `20-map.png` | Map with legend (web placeholder) |

Not captured (native-only, see section 8): Suggest step (opt-in, checking, ready, failed), the real map with the pin, Apple Mail and the share sheet, the "Ready in Mail" Done state, and alerts.
