import { normalizeAnswersForCategory } from './answers';
import { GENERAL_CATEGORY, categoryFromPhotoTopic, getCategory } from './categories';
import type { IssueCategory, Report, ReportDraft } from './types';

export const EMPTY_DRAFT: ReportDraft = {
  categoryId: null,
  photoIssueTopic: null,
  description: '',
  answers: {},
  address: '',
  locationNote: '',
  latitude: null,
  longitude: null,
  photoUri: null,
  thumbnailUri: null,
  photoVisionResult: null,
};

/**
 * The issue a draft resolves to. A photo suggestion from a newer server catalog keeps its own
 * title; anything else unknown falls back to the general report.
 */
export function getDraftCategory(
  draft: Pick<ReportDraft, 'categoryId' | 'photoIssueTopic'>
): IssueCategory {
  if (!draft.categoryId) return GENERAL_CATEGORY;

  const catalogCategory = getCategory(draft.categoryId);
  if (catalogCategory) return catalogCategory;

  const topic = draft.photoIssueTopic;
  return topic?.issueId === draft.categoryId ? categoryFromPhotoTopic(topic) : GENERAL_CATEGORY;
}

export function draftFromReport(report: Report): ReportDraft {
  const draft: ReportDraft = {
    categoryId: report.categoryId,
    photoIssueTopic: report.photoIssueTopic,
    description: report.description,
    answers: report.answers,
    address: report.address,
    locationNote: report.locationNote,
    latitude: report.latitude,
    longitude: report.longitude,
    photoUri: report.photoUri,
    thumbnailUri: report.thumbnailUri,
    photoVisionResult: report.photoVisionResult,
  };

  return {
    ...draft,
    answers: normalizeAnswersForCategory(draft.answers, getDraftCategory(draft)),
  };
}

/** True until the user has added anything worth saving. */
export function isDraftEmpty(draft: ReportDraft) {
  return (
    !draft.photoUri &&
    !draft.categoryId &&
    !draft.photoIssueTopic &&
    !draft.description.trim() &&
    !draft.address.trim() &&
    !draft.locationNote.trim() &&
    draft.latitude == null &&
    Object.keys(draft.answers).length === 0
  );
}
