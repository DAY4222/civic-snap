import * as SecureStore from 'expo-secure-store';

import { Profile } from './types';

const PROFILE_KEY = 'civic-snap-profile';

export const EMPTY_PROFILE: Profile = {
  name: '',
  email: '',
  phone: '',
};

export async function loadProfile(): Promise<Profile> {
  const raw = await SecureStore.getItemAsync(PROFILE_KEY);
  if (!raw) return EMPTY_PROFILE;

  try {
    return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch {
    return EMPTY_PROFILE;
  }
}

export async function saveProfile(profile: Profile) {
  await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
}
