import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const memoryStore = new Map<string, string>();

export async function getDeviceItem(key: string) {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return memoryStore.get(key) ?? null;
  }

  return SecureStore.getItemAsync(key);
}

export async function setDeviceItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
    memoryStore.set(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}
