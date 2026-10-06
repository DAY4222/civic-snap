import { ISSUE_CATEGORIES } from './generated/issueCatalog';
import type { IssueCategory, PhotoIssueCandidate } from './types';

export { ISSUE_CATEGORIES } from './generated/issueCatalog';
export { ISSUE_CATALOG_VERSION } from './generated/versions';

export const TORONTO_311_TARGET_ISSUE_TITLES = ISSUE_CATEGORIES.map(
  (category) => category.title
);

export const GENERAL_CATEGORY: IssueCategory = {
  id: 'general',
  title: 'General 311 report',
  subjectLabel: 'local issue',
  categoryPath: [],
  description: '',
  discoverability: 'not-discoverable',
  visualCueLabelIds: [],
  requiredAnyLabelIds: [],
  requiredAllLabelIds: [],
  observations: [],
  questions: [],
  emailGuidanceChecklist: [],
};

export function getCategory(categoryId: string): IssueCategory | undefined {
  return ISSUE_CATEGORIES.find((category) => category.id === categoryId);
}

export function findCategoryByTitle(title: string) {
  return ISSUE_CATEGORIES.find((category) => category.title === title);
}

/**
 * The server's issue catalog can be newer than this build's, so a photo suggestion may name
 * an issue the app doesn't know. Keep the suggested title and skip the checklist.
 */
export function categoryFromPhotoTopic(topic: PhotoIssueCandidate): IssueCategory {
  return {
    ...GENERAL_CATEGORY,
    id: topic.issueId,
    title: topic.title,
    subjectLabel: topic.title.toLowerCase(),
  };
}
