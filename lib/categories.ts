import { ISSUE_CATEGORIES } from './generated/issueCatalog';

export { ISSUE_CATEGORIES, ISSUE_CATALOG_VERSION } from './generated/issueCatalog';

export const TORONTO_311_TARGET_ISSUE_TITLES = ISSUE_CATEGORIES.map(
  (category) => category.title
);

export function getCategory(categoryId: string) {
  return ISSUE_CATEGORIES.find((category) => category.id === categoryId) ?? ISSUE_CATEGORIES[0];
}

export function findCategoryByTitle(title: string) {
  return ISSUE_CATEGORIES.find((category) => category.title === title);
}

export function getCategoryByTitle(title: string) {
  return findCategoryByTitle(title) ?? ISSUE_CATEGORIES[0];
}
