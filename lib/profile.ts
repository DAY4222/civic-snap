import { getDeviceItem, setDeviceItem } from './deviceStore';
import { Profile } from './types';

const PROFILE_KEY = 'civic-snap-profile';
const ONBOARDING_COMPLETE_KEY = 'civic-snap-onboarding-complete';

export const EMPTY_PROFILE: Profile = {
  name: '',
  email: '',
  phone: '',
};

export async function loadProfile(): Promise<Profile> {
  const raw = await getDeviceItem(PROFILE_KEY);
  if (!raw) return EMPTY_PROFILE;

  try {
    return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch {
    return EMPTY_PROFILE;
  }
}

export async function saveProfile(profile: Profile) {
  await setDeviceItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function hasCompletedOnboarding() {
  return (await getDeviceItem(ONBOARDING_COMPLETE_KEY)) === 'true';
}

export async function completeOnboarding() {
  await setDeviceItem(ONBOARDING_COMPLETE_KEY, 'true');
}
