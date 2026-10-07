import { PhotoIssueCandidate, CategoryQuestion, PhotoVisionResult } from './types';

const MAX_SUGGESTED_ISSUE_CANDIDATES = 3;

export function getSuggestedIssueCandidates(result: PhotoVisionResult | null) {
  return result?.issueCandidates.slice(0, MAX_SUGGESTED_ISSUE_CANDIDATES) ?? [];
}

export function getSuggestedAnswerOptions(
  question: CategoryQuestion,
  selectedCandidate: PhotoIssueCandidate | null
) {
  if (!selectedCandidate || question.options.length === 0) return [];

  const supportingLabels = new Set(selectedCandidate.supportingLabelIds);
  return question.options.filter((option) =>
    option.suggestedLabelIds.some((labelId) => supportingLabels.has(labelId))
  );
}

export function appendSuggestedDescription(currentValue: string, suggestion: string) {
  const trimmedSuggestion = suggestion.trim();
  if (!trimmedSuggestion) return currentValue;

  const trimmedCurrent = currentValue.trim();
  if (!trimmedCurrent) return trimmedSuggestion;
  if (trimmedCurrent.includes(trimmedSuggestion)) return currentValue;

  return `${trimmedCurrent}\n${trimmedSuggestion}`;
}
