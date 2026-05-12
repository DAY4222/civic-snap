import * as FileSystem from 'expo-file-system/legacy';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

const PHOTO_DIR = `${FileSystem.documentDirectory}reports/`;

export async function persistReportPhoto(uri: string) {
  await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true }).catch(() => undefined);

  const manipulated = await manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.78, format: SaveFormat.JPEG }
  );

  const destination = `${PHOTO_DIR}report-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: manipulated.uri, to: destination });
  return destination;
}
