import * as Haptics from 'expo-haptics';

export function selectionHaptic() {
  Haptics.selectionAsync().catch(() => {});
}

export function successHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
