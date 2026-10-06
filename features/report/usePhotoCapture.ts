import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { deleteReportPhotos } from '@/lib/photos';

import { persistWizardPhoto } from './reportWizardServices';
import { openAppSettings, type WizardStore } from './wizardTypes';

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  mediaTypes: ['images'],
  quality: 0.85,
};

/** Camera and library capture. Resolves true when a photo was stored. */
export function usePhotoCapture({ state, dispatch }: WizardStore) {
  const { draft } = state;

  async function storePhoto(asset: ImagePicker.ImagePickerAsset) {
    // A retaken photo that no saved draft points to can go now; saved ones are cleaned up by
    // the startup sweep once the draft has been re-saved with the new photo.
    const replacedPhotos = state.savedReportId ? [] : [draft.photoUri, draft.thumbnailUri];
    dispatch({ type: 'setBusy', busy: true });
    try {
      const persisted = await persistWizardPhoto(asset.uri);
      dispatch({
        type: 'photoStored',
        photoUri: persisted.photoUri,
        thumbnailUri: persisted.thumbnailUri,
      });
      void deleteReportPhotos(replacedPhotos);
      return true;
    } catch {
      Alert.alert('Photo not saved', 'The report can continue without a saved photo.');
      return false;
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera needed', 'Allow camera access in Settings, or choose a photo instead.', [
        { text: 'OK', style: 'cancel' },
        { text: 'Open Settings', onPress: openAppSettings },
      ]);
      return false;
    }

    const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    return result.canceled ? false : storePhoto(result.assets[0]);
  }

  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    return result.canceled ? false : storePhoto(result.assets[0]);
  }

  return { choosePhoto, takePhoto };
}
