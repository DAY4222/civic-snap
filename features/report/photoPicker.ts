import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { gpsFromExif, type Coordinates } from '@/lib/address';

import { openAppSettings } from './wizardTypes';

export type PhotoSource = 'camera' | 'library';
export type PickedPhoto = {
  uri: string;
  /** Where the photo was taken, when the file says (library photos usually do). */
  gps: Coordinates | null;
  source: PhotoSource;
};

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  // Only read for the GPS position; the saved copy is re-encoded without metadata.
  exif: true,
  mediaTypes: ['images'],
  quality: 0.85,
};

/** Opens the camera or the photo library. Resolves null when the user cancels or declines. */
export async function pickReportPhoto(source: PhotoSource): Promise<PickedPhoto | null> {
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

  if (result.canceled) return null;

  const [asset] = result.assets;
  return { uri: asset.uri, gps: gpsFromExif(asset.exif), source };
}
