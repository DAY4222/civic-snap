import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { openAppSettings } from './wizardTypes';

export type PickedPhoto = { uri: string };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  mediaTypes: ['images'],
  quality: 0.85,
};

/** Opens the camera or the photo library. Resolves null when the user cancels or declines. */
export async function pickReportPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera needed', 'Allow camera access in Settings, or choose a photo instead.', [
        { text: 'OK', style: 'cancel' },
        { text: 'Open Settings', onPress: openAppSettings },
      ]);
      return null;
    }
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
      : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);

  return result.canceled ? null : { uri: result.assets[0].uri };
}
