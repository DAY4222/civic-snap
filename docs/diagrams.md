# Current App Diagrams

These diagrams describe the app as implemented now. The current MVP is local-first: report history, profile data, and photos stay on the device until the user chooses to hand an email draft to Mail.

## Data Flow

```mermaid
flowchart TD
  User["User"]

  subgraph ReportTab["Report tab: app/(tabs)/index.tsx"]
    Start["Start report"]
    Category["Choose issue type"]
    Photo["Take or choose photo"]
    Location["Confirm location"]
    Details["Add description and guided answers"]
    Preview["Preview and edit email"]
    MailHandoff["Open Mail"]
    Fallback["Copy text or open mailto fallback"]
    HydrateDraft["Hydrate draft into report state"]
  end

  subgraph Inputs["Device and app inputs"]
    Categories["lib/categories.ts\nIssue questions and observations"]
    Profile["lib/profile.ts\nSecureStore profile"]
    Camera["expo-image-picker\nCamera or photo library"]
    Geo["expo-location\nGPS and reverse geocode"]
    MapAdjust["components/CivicMap\nMove map under center pin"]
  end

  subgraph Processing["Local processing"]
    PersistPhoto["lib/photos.ts\nResize and save photo"]
    EmailBuilder["lib/email.ts\nBuild recipient, subject, body"]
    ReportStore["lib/reports.ts\nSQLite report API"]
  end

  subgraph Storage["On-device storage"]
    FileStorage["FileSystem documentDirectory\nreports/*.jpg"]
    SQLite["SQLite civic-snap.db\nreports table with category_id"]
    SecureStore["SecureStore\nprofile and onboarding keys"]
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
  Category --> Categories
  Category --> Location
  Geo --> Location
  MapAdjust --> Location
  Location --> Details
  Categories --> Details
  Profile --> SecureStore
  SecureStore --> Profile
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

  subgraph Domain["Domain and data helpers"]
    Types["lib/types.ts"]
    Categories["lib/categories.ts"]
    Email["lib/email.ts"]
    Photos["lib/photos.ts"]
    Profile["lib/profile.ts"]
    Reports["lib/reports.ts"]
  end

  subgraph ExpoServices["Expo and native services"]
    ImagePicker["expo-image-picker"]
    Location["expo-location"]
    MailComposer["expo-mail-composer"]
    ClipboardLinking["expo-clipboard and Linking"]
    FileImage["expo-file-system and expo-image-manipulator"]
    SQLiteService["expo-sqlite"]
    SecureStoreService["expo-secure-store"]
    NativeMaps["react-native-maps"]
  end

  subgraph Stores["Local stores"]
    PhotoFiles["Photo files\nDocument directory"]
    ReportDb["Report history\nSQLite civic-snap.db"]
    ProfileStore["Profile and onboarding\nSecureStore"]
  end

  ExpoRouter --> RootLayout --> Stack --> Tabs
  Stack --> Onboarding
  Stack --> Settings
  Stack --> ReportDetail
  Tabs --> Report
  Tabs --> History
  Tabs --> MapScreen
  ExpoRouter --> NotFound

  Report --> Categories
  Report --> Email
  Report --> Photos
  Report --> Profile
  Report --> Reports
  History --> Reports
  MapScreen --> Reports
  Settings --> Profile
  Onboarding --> Profile
  ReportDetail --> Reports

  Report --> CivicMapNative
  Report --> CivicMapWeb
  MapScreen --> CivicMapNative
  MapScreen --> CivicMapWeb
  Categories --> Types
  Email --> Types
  Profile --> Types
  Reports --> Types

  Photos --> FileImage --> PhotoFiles
  Reports --> SQLiteService --> ReportDb
  Profile --> SecureStoreService --> ProfileStore
  Report --> ImagePicker
  Report --> Location
  Report --> MailComposer
  Report --> ClipboardLinking
  CivicMapNative --> NativeMaps
```

## Current Boundaries

- No backend, auth, cloud sync, server storage, or OpenAI calls are wired into the app.
- The `supabase/` directory currently contains only local CLI temp metadata and is not referenced by app code.
- Sending is a handoff to the user's mail client. The app records `Mail opened`; it does not confirm receipt by 311.
