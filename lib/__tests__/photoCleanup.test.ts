import { ORPHAN_PHOTO_MIN_AGE_MS, selectOrphanPhotoNames } from '../photoCleanup';

const NOW = Date.parse('2026-10-05T12:00:00.000Z');
const OLD = NOW - ORPHAN_PHOTO_MIN_AGE_MS - 1;
const RECENT = NOW - 60_000;

describe('orphan photo cleanup', () => {
  it('selects only old files that no saved report references', () => {
    const files = [
      { name: 'report-1.jpg', modificationTime: OLD },
      { name: 'report-1-thumb.jpg', modificationTime: OLD },
      { name: 'report-2.jpg', modificationTime: OLD },
      { name: 'report-3.jpg', modificationTime: RECENT },
      { name: 'report-4.jpg', modificationTime: null },
    ];

    expect(
      selectOrphanPhotoNames(
        files,
        [
          'reports/report-1.jpg',
          'file:///var/Application/OLD/Documents/reports/report-1-thumb.jpg',
          null,
        ],
        NOW
      )
    ).toEqual(['report-2.jpg']);
  });
});
