# Current App Diagrams

These diagrams describe the app as implemented now. The current MVP is local-first for saved reports, profile data, saved report photos, and Mail handoff. If photo analysis is configured and the user opts in, the app can also send a resized analysis copy of the current report photo to the Supabase Edge Function before Mail handoff.

## Data Flow

```mermaid
flowchart TD
  User["User"]

  subgraph ReportTab["Report tab: app/(tabs)/index.tsx"]
    Start["Start report"]
    Category["Choose issue type"]
    Photo["Take or choose photo"]
    Location["Confirm location"]
    InlineOptIn["Inline Photo analysis enable"]
    PhotoSuggestions["Photo suggestions panel"]
    Details["Add description and guided answers"]
    Preview["Preview and edit email"]
    MailHandoff["Open Mail"]
    Fallback["Copy text or open mailto fallback"]
    HydrateDraft["Hydrate draft into report state"]
    IssueCandidates["AI issue candidates\nUser taps final issue"]
  end

  subgraph Inputs["Device and app inputs"]
    Categories["lib/categories.ts\nIssue questions and observations"]
    Catalog["Generated 311 catalog\nLabels, issue rules, checklist questions"]
    Profile["lib/profile.ts\nProfile and onboarding helpers"]
    Settings["app/settings.tsx\nPhoto analysis opt-in"]
    Camera["expo-image-picker\nCamera or photo library"]
    Geo["expo-location\nGPS and reverse geocode"]
    MapAdjust["components/CivicMap\nMove map under center pin"]
  end

  subgraph Processing["Local processing"]
    PersistPhoto["lib/photos.ts\nResize and save photo"]
    WizardState["features/report/reportWizardState.ts\nPure report state"]
    WizardEffects["features/report/useReportWizard.ts\nAsync report side effects"]
    PhotoSetting["lib/photoAnalysisSettings.ts\nLoad and save opt-in"]
    DeviceStore["lib/deviceStore.ts\nSecureStore or web localStorage adapter"]
    EmailBuilder["lib/email.ts\nBuild recipient, subject, body"]
    ReportStore["lib/reports.ts\nSQLite report API"]
    Vision["lib/vision.ts\nResize analysis copy and fetch labels"]
    Contract["lib/photoAnalysisContract.ts\nNormalize analysis response"]
    IssueSuggestions["lib/issueSuggestions.ts\nExpose candidates and answer hints"]
  end

  subgraph Backend["Supabase Edge Function"]
    EdgeFunction["analyze-photo-labels\nGemini labels + hybrid issue rerank"]
    Gemini["Gemini photo-only analysis"]
    AnalysisRuns["ai_photo_analysis_runs\nRate-limit and diagnostic summaries"]
  end

  subgraph Storage["On-device storage"]
    FileStorage["FileSystem documentDirectory\nreports/*.jpg"]
    SQLite["SQLite civic-snap.db\nreports with category_id,\nphoto_vision_result_json,\nphoto_issue_topic_json"]
    DeviceStorage["SecureStore or localStorage\nprofile, onboarding,\nphoto-analysis setting, install id"]
  end

  subgraph Review["History, map, and detail views"]
    History["History tab\nlistReports"]
    Map["Map tab\nlistReports with coordinates"]
    Detail["Report detail\ngetReport and updateCaseNumber"]
    Resume["Resume draft\nroute param resumeId"]
  end

  subgraph Outside["Outside the app"]
    NativeMail["Native Mail composer"]
    Toronto311["311@toronto.ca"]
  end

  User --> Start
  Start --> Category
  Start --> Photo
  Camera --> Photo
  Photo --> PersistPhoto
  PersistPhoto --> FileStorage
  FileStorage --> Photo
  PersistPhoto --> WizardState
  Category --> Categories
  Category --> Location
  Geo --> Location
  MapAdjust --> Location
  Location --> InlineOptIn
  InlineOptIn --> PhotoSetting
  Settings --> PhotoSetting
  PhotoSetting <--> DeviceStore
  DeviceStore <--> DeviceStorage
  WizardState --> WizardEffects
  PhotoSetting --> WizardEffects
  WizardEffects --> Vision
  Location --> Details
  Categories --> Details
  Catalog --> Categories
  Catalog --> Vision
  Vision --> EdgeFunction
  EdgeFunction --> Gemini
  EdgeFunction --> AnalysisRuns
  EdgeFunction --> Contract
  Contract --> WizardState
  WizardState --> IssueSuggestions
  IssueSuggestions --> PhotoSuggestions
  EdgeFunction --> IssueCandidates
  IssueCandidates --> PhotoSuggestions
  PhotoSuggestions --> Details
  Profile --> DeviceStore
  DeviceStore --> Profile
  Profile --> EmailBuilder
  Details --> EmailBuilder
  EmailBuilder --> Preview
  Preview --> ReportStore
  ReportStore <--> SQLite
  Preview --> MailHandoff
  MailHandoff --> ReportStore
  MailHandoff --> NativeMail
  NativeMail --> Toronto311
  MailHandoff --> Fallback
  Fallback --> NativeMail
  ReportStore --> History
  ReportStore --> Map
  ReportStore --> Detail
  History --> Resume
  Detail --> Resume
  Resume --> ReportStore
  ReportStore --> HydrateDraft
  HydrateDraft --> Details
```

## App Architecture

```mermaid
flowchart LR
  subgraph Runtime["Expo React Native runtime"]
    ExpoRouter["expo-router entry"]
    RootLayout["app/_layout.tsx\nFonts, splash screen, onboarding guard"]
    Stack["Root stack\nonboarding, tabs, settings, report detail"]
    Tabs["app/(tabs)/_layout.tsx\nReport, History, Map"]
  end

  subgraph Screens["Screens"]
    Onboarding["app/onboarding.tsx"]
    Report["app/(tabs)/index.tsx"]
    History["app/(tabs)/history.tsx"]
    MapScreen["app/(tabs)/map.tsx"]
    Settings["app/settings.tsx"]
    ReportDetail["app/report/[id].tsx"]
    NotFound["app/+not-found.tsx"]
  end

  subgraph Components["Shared components"]
    CivicMapNative["components/CivicMap.tsx\nNative react-native-maps export"]
    CivicMapWeb["components/CivicMap.web.tsx\nWeb fallback map preview"]
  end

  subgraph ReportFeature["Report feature"]
    ReportWizard["features/report/ReportWizard.tsx\nWizard UI and step rendering"]
    ReportHook["features/report/useReportWizard.ts\nAsync side effects and derived data"]
    ReportState["features/report/reportWizardState.ts\nReducer and pure state helpers"]
  end

  subgraph Domain["Domain and data helpers"]
    Types["lib/types.ts"]
    Categories["lib/categories.ts"]
    Email["lib/email.ts"]
    Photos["lib/photos.ts"]
    Profile["lib/profile.ts"]
    Reports["lib/reports.ts"]
    ReportPersistence["lib/reportPersistence.ts"]
    VisionHelper["lib/vision.ts"]
    PhotoSettings["lib/photoAnalysisSettings.ts"]
    PhotoContract["lib/photoAnalysisContract.ts"]
    IssueSuggestionsHelper["lib/issueSuggestions.ts"]
    DeviceStoreHelper["lib/deviceStore.ts"]
  end

  subgraph AnalysisBackend["Photo analysis backend"]
    EdgeFunctionArch["supabase/functions/analyze-photo-labels"]
    GeminiArch["Gemini generateContent"]
    AnalysisRunsArch["public.ai_photo_analysis_runs"]
  end

  subgraph ExpoServices["Expo and native services"]
    ImagePicker["expo-image-picker"]
    Location["expo-location"]
    MailComposer["expo-mail-composer"]
    ClipboardLinking["expo-clipboard and Linking"]
    FileImage["expo-file-system and expo-image-manipulator"]
    SQLiteService["expo-sqlite"]
    DeviceKeyValue["expo-secure-store or web localStorage"]
    NativeMaps["react-native-maps"]
  end

  subgraph Stores["Local stores"]
    PhotoFiles["Photo files\nDocument directory"]
    ReportDb["Report history\nSQLite civic-snap.db"]
    DeviceStoreData["Profile, onboarding,\nphoto-analysis setting,\ninstall id"]
  end

  ExpoRouter --> RootLayout --> Stack --> Tabs
  Stack --> Onboarding
  Stack --> Settings
  Stack --> ReportDetail
  Tabs --> Report
  Tabs --> History
  Tabs --> MapScreen
  ExpoRouter --> NotFound

  Report --> ReportWizard
  ReportWizard --> ReportHook
  ReportHook --> ReportState
  ReportHook --> Categories
  ReportHook --> Email
  ReportHook --> Photos
  ReportHook --> Profile
  ReportHook --> Reports
  ReportHook --> VisionHelper
  ReportHook --> PhotoSettings
  ReportHook --> IssueSuggestionsHelper
  History --> Reports
  MapScreen --> Reports
  Settings --> PhotoSettings
  Settings --> Profile
  Onboarding --> Profile
  ReportDetail --> Reports

  Report --> CivicMapNative
  Report --> CivicMapWeb
  MapScreen --> CivicMapNative
  MapScreen --> CivicMapWeb
  ReportState --> Categories
  ReportState --> Types
  Categories --> Types
  Email --> Types
  Profile --> Types
  Reports --> Types
  Reports --> ReportPersistence
  ReportPersistence --> PhotoContract
  VisionHelper --> PhotoContract
  VisionHelper --> DeviceStoreHelper
  PhotoSettings --> DeviceStoreHelper
  Profile --> DeviceStoreHelper
  IssueSuggestionsHelper --> Types

  Photos --> FileImage --> PhotoFiles
  Reports --> SQLiteService --> ReportDb
  DeviceStoreHelper --> DeviceKeyValue --> DeviceStoreData
  Report --> ImagePicker
  Report --> Location
  Report --> MailComposer
  Report --> ClipboardLinking
  CivicMapNative --> NativeMaps
  VisionHelper --> EdgeFunctionArch --> GeminiArch
  EdgeFunctionArch --> AnalysisRunsArch
```

## Current Boundaries

- Photo analysis is opt-in and sends a resized analysis copy of the report photo only to the Supabase Edge Function.
- Saved report photos, report history, profile data, and email drafts stay on device unless the user hands the draft to Mail.
- Address, GPS, location notes, user-written descriptions, profile fields, email text, and full reasoning are not sent to Gemini.
- Sending is a handoff to the user's mail client. The app records `Mail opened`; it does not confirm receipt by 311.
