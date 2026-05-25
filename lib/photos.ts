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

  const stamp = Date.now();
  const destination = `${PHOTO_DIR}report-${stamp}.jpg`;
  const thumbnailDestination = `${PHOTO_DIR}report-${stamp}-thumb.jpg`;
  const thumbnail = await manipulateAsync(
    manipulated.uri,
    [{ resize: { width: 240 } }],
    { compress: 0.72, format: SaveFormat.JPEG }
  );

  await FileSystem.copyAsync({ from: manipulated.uri, to: destination });
  await FileSystem.copyAsync({ from: thumbnail.uri, to: thumbnailDestination });

  return {
    photoUri: destination,
    thumbnailUri: thumbnailDestination,
  };
}

export async function deleteReportPhotos(uris: (string | null | undefined)[]) {
  const uniqueUris = [...new Set(uris.filter((uri): uri is string => Boolean(uri)))];

  await Promise.all(
    uniqueUris.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined))
  );
}
