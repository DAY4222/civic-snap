import { Alert } from 'react-native';

import { deleteReportPhotos } from '@/lib/photos';

import type { PickedPhoto } from './photoPicker';
import { persistWizardPhoto } from './reportWizardServices';
import type { WizardStore } from './wizardTypes';

/** Saves a picked photo into the report. Resolves true when it was stored. */
export function usePhotoCapture({ state, dispatch }: WizardStore) {
  const { draft } = state;

  async function storePhoto(photo: Pick<PickedPhoto, 'uri'>) {
    // A retaken photo that no saved draft points to can go now; saved ones are cleaned up by
    // the startup sweep once the draft has been re-saved with the new photo.
    const replacedPhotos = state.savedReportId ? [] : [draft.photoUri, draft.thumbnailUri];
    dispatch({ type: 'setBusy', busy: true });
    try {
      const persisted = await persistWizardPhoto(photo.uri);
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

  return { storePhoto };
}
