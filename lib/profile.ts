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
    return normalizeProfile(JSON.parse(raw));
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

function normalizeProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_PROFILE;

  const item = value as Partial<Record<keyof Profile, unknown>>;
  return {
    email: stringValue(item.email),
    name: stringValue(item.name),
    phone: stringValue(item.phone),
  };
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
