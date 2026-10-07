/** Files younger than this may belong to a report that is still being saved. */
export const ORPHAN_PHOTO_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export type StoredPhotoFile = {
  name: string;
  modificationTime: number | null;
};

/** Names of report photo files that no saved report references and that are old enough to delete. */
export function selectOrphanPhotoNames(
  files: StoredPhotoFile[],
  referencedPaths: (string | null)[],
  now: number
) {
  const referencedNames = new Set(
    referencedPaths
      .map((path) => path?.split('/').pop())
      .filter((name): name is string => Boolean(name))
  );
  const cutoff = now - ORPHAN_PHOTO_MIN_AGE_MS;

  return files
    .filter(
      (file) =>
        !referencedNames.has(file.name) &&
        file.modificationTime != null &&
        file.modificationTime < cutoff
    )
    .map((file) => file.name);
}
