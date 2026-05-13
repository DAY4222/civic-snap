import { ISSUE_CATEGORIES, findCategoryByTitle, getCategory, getCategoryByTitle } from '../categories';

describe('category lookup', () => {
  it('finds a category by stable id', () => {
    expect(getCategory('illegal-dumping').title).toBe('Illegal dumping');
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
