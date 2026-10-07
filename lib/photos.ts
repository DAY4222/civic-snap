import { Directory, File, Paths } from 'expo-file-system';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

import { selectOrphanPhotoNames } from './photoCleanup';

const REPORT_PHOTO_FOLDER = 'reports';

/** Base directory that stored (relative) report photo paths resolve against. */
export function getReportPhotoBaseDirectory() {
  try {
    return Paths.document.uri;
  } catch {
    // Web has no document directory; photos there are not persisted.
    return null;
  }
}

export async function persistReportPhoto(uri: string) {
  const directory = new Directory(Paths.document, REPORT_PHOTO_FOLDER);
  directory.create({ intermediates: true, idempotent: true });

  const manipulated = await manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.78, format: SaveFormat.JPEG }
  );
  const thumbnail = await manipulateAsync(
    manipulated.uri,
    [{ resize: { width: 240 } }],
    { compress: 0.72, format: SaveFormat.JPEG }
  );

  const stamp = Date.now();
  const photo = new File(directory, `report-${stamp}.jpg`);
  const thumbnailPhoto = new File(directory, `report-${stamp}-thumb.jpg`);
  // Move rather than copy so the resized temporary files don't pile up in the cache.
  new File(manipulated.uri).move(photo);
  new File(thumbnail.uri).move(thumbnailPhoto);

  return {
    photoUri: photo.uri,
    thumbnailUri: thumbnailPhoto.uri,
  };
}

export async function deleteReportPhotos(uris: (string | null | undefined)[]) {
  const uniqueUris = [...new Set(uris.filter((uri): uri is string => Boolean(uri)))];

  for (const uri of uniqueUris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // A photo that is already gone, or can't be removed, shouldn't block deleting the report.
    }
  }
}

export function deleteOrphanReportPhotos(referencedPaths: (string | null)[], now = Date.now()) {
  const directory = new Directory(Paths.document, REPORT_PHOTO_FOLDER);
  if (!directory.exists) return 0;

  const files = directory.list().filter((entry): entry is File => entry instanceof File);
  const orphanNames = selectOrphanPhotoNames(
    files.map((file) => ({ name: file.name, modificationTime: file.modificationTime })),
    referencedPaths,
    now
  );

  for (const name of orphanNames) {
    try {
      new File(directory, name).delete();
    } catch {
      // Leave it for the next sweep.
    }
  }

  return orphanNames.length;
}
