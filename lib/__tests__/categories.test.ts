import {
  ISSUE_CATEGORIES,
  TORONTO_311_TARGET_ISSUE_TITLES,
  findCategoryByTitle,
  getCategory,
  getCategoryByTitle,
} from '../categories';
import { PHOTO_LABELS } from '../photoLabels';

describe('category lookup', () => {
  it('uses the scraped Toronto 311 target list in supplied order', () => {
    expect(ISSUE_CATEGORIES.map((category) => category.title)).toEqual([
      ...TORONTO_311_TARGET_ISSUE_TITLES,
    ]);
    expect(ISSUE_CATEGORIES[0].title).toBe('Residential Bin Lid Damaged');
    expect(ISSUE_CATEGORIES[96].title).toBe('Clean up Needles or Syringes');
  });

  it('keeps stable ids unique and derived from target titles', () => {
    const ids = ISSUE_CATEGORIES.map((category) => category.id);

    expect(getCategory('residential-bin-lid-damaged').title).toBe('Residential Bin Lid Damaged');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('generates catalog metadata, checklist questions, and discoverability flags', () => {
    const binLid = getCategory('residential-bin-lid-damaged');
    const sidewalkSnow = getCategory('sidewalk-snow-clearing-required');

    expect(binLid.categoryPath).toEqual([
      'Waste Collection, Bins, Litter and Needle Cleanup',
      'Residential',
      'Collection Bin',
      'Residential Bin Lid Damaged',
    ]);
    expect(binLid.discoverability).toBe('photo');
    expect(binLid.questions[0]).toMatchObject({
      answerType: 'picklist',
      label: 'What is this request about?',
    });
    expect(binLid.emailGuidanceChecklist).toBe(binLid.questions);
    expect(sidewalkSnow.questions).toEqual([]);
  });

  it('keeps issue visual cues inside the generated label taxonomy', () => {
    const labelIds = new Set(PHOTO_LABELS.map((label) => label.id));

    for (const category of ISSUE_CATEGORIES) {
      for (const labelId of category.visualCueLabelIds) {
        expect(labelIds.has(labelId)).toBe(true);
      }
      for (const labelId of category.requiredAllLabelIds) {
        expect(labelIds.has(labelId)).toBe(true);
      }
    }
  });

  it('marks target titles without an exact source match', () => {
    const unmatchedTitles = ISSUE_CATEGORIES.filter(
      (category) => category.sourceMatchStatus === 'unmatched'
    ).map((category) => category.title);
    const ambiguousTitles = ISSUE_CATEGORIES.filter(
      (category) => category.sourceMatchStatus === 'ambiguous'
    ).map((category) => category.title);

    expect(unmatchedTitles).toEqual([]);
    expect(ambiguousTitles).toEqual([]);
  });

  it('finds a category by stable id', () => {
    expect(getCategory('road-pothole-road-damage').title).toBe('Road Pothole / Road Damage');
  });

  it('preserves the legacy title fallback for old reports', () => {
    const category = ISSUE_CATEGORIES[0];

    expect(findCategoryByTitle(category.title)?.id).toBe(category.id);
    expect(getCategoryByTitle(category.title).id).toBe(category.id);
  });

  it('keeps the existing default for unknown category ids and titles', () => {
    expect(getCategory('unknown').id).toBe(ISSUE_CATEGORIES[0].id);
    expect(findCategoryByTitle('Unknown title')).toBeUndefined();
    expect(getCategoryByTitle('Unknown title').id).toBe(ISSUE_CATEGORIES[0].id);
  });

  it('does not invent a stable id for legacy general reports', () => {
    expect(findCategoryByTitle('General 311 report')).toBeUndefined();
  });
});
