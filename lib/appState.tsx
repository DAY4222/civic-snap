import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  loadEmailPolishEnabled,
  loadPhotoAnalysisChoice,
  saveEmailPolishEnabled,
  savePhotoAnalysisEnabled,
  type PhotoAnalysisChoice,
} from './aiSettings';
import {
  EMPTY_PROFILE,
  completeOnboarding as saveOnboardingComplete,
  hasCompletedOnboarding,
  loadProfile,
  saveProfile as storeProfile,
} from './profile';
import type { Profile } from './types';

/** Everything the app keeps about the person and their choices, loaded once at launch. */
export type AppSettings = {
  profile: Profile;
  photoAnalysis: PhotoAnalysisChoice;
  /** The user agreed to send report text (never contact details) for AI email polish. */
  emailPolishEnabled: boolean;
  onboardingComplete: boolean;
};

export type AppStateValue = {
  settings: AppSettings;
  /** Each write saves to the device first, then updates every screen. Rejects if the save failed. */
  saveProfile: (profile: Profile) => Promise<void>;
  setPhotoAnalysisEnabled: (enabled: boolean) => Promise<void>;
  setEmailPolishEnabled: (enabled: boolean) => Promise<void>;
  completeOnboarding: () => Promise<void>;
};

const AppStateContext = createContext<AppStateValue | null>(null);

/**
 * Reads every setting at once. A setting that can't be read falls back to the safe choice:
 * no profile, AI features off, and onboarding shown again.
 */
export async function loadAppSettings(): Promise<AppSettings> {
  const [profile, photoAnalysis, emailPolishEnabled, onboardingComplete] = await Promise.all([
    loadProfile().catch(() => EMPTY_PROFILE),
    // Unreadable storage couldn't remember "Not now" either, so don't ask.
    loadPhotoAnalysisChoice().catch((): PhotoAnalysisChoice => 'off'),
    loadEmailPolishEnabled().catch(() => false),
    hasCompletedOnboarding().catch(() => false),
  ]);
  return { emailPolishEnabled, onboardingComplete, photoAnalysis, profile };
}

/** Loads the settings, then renders its children with them. Renders `fallback` until then. */
export function AppStateProvider({
  children,
  fallback = null,
  initialSettings,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  /** For tests: skip loading. */
  initialSettings?: AppSettings;
}) {
  const [settings, setSettings] = useState<AppSettings | null>(initialSettings ?? null);

  useEffect(() => {
    if (initialSettings) return;
    let active = true;
    void loadAppSettings().then((loaded) => {
      if (active) setSettings(loaded);
    });
    return () => {
      active = false;
    };
  }, [initialSettings]);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo<AppStateValue | null>(() => {
    if (!settings) return null;
    return {
      settings,
      saveProfile: async (profile) => {
        await storeProfile(profile);
        update({ profile });
      },
      setPhotoAnalysisEnabled: async (enabled) => {
        await savePhotoAnalysisEnabled(enabled);
        update({ photoAnalysis: enabled ? 'on' : 'off' });
      },
      setEmailPolishEnabled: async (enabled) => {
        await saveEmailPolishEnabled(enabled);
        update({ emailPolishEnabled: enabled });
      },
      completeOnboarding: async () => {
        await saveOnboardingComplete();
        update({ onboardingComplete: true });
      },
    };
  }, [settings, update]);

  if (!value) return <>{fallback}</>;
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside AppStateProvider');
  return value;
}
