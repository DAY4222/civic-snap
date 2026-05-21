import { PhotoIssueCandidate, CategoryQuestion, CategoryQuestionOption, PhotoVisionResult } from './types';

export function getSuggestedIssueCandidates(result: PhotoVisionResult | null) {
  return result?.issueCandidates ?? [];
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

export function toggleMultiAnswer(currentValue: string, option: CategoryQuestionOption) {
  const current = currentValue
    .split(', ')
    .map((value) => value.trim())
    .filter(Boolean);
  const next = current.includes(option.label)
    ? current.filter((value) => value !== option.label)
    : [...current, option.label];

  return next.join(', ');
}

export function appendSuggestedDescription(currentValue: string, suggestion: string) {
  const trimmedSuggestion = suggestion.trim();
  if (!trimmedSuggestion) return currentValue;

  const trimmedCurrent = currentValue.trim();
  if (!trimmedCurrent) return trimmedSuggestion;
  if (trimmedCurrent.includes(trimmedSuggestion)) return currentValue;

  return `${trimmedCurrent}\n${trimmedSuggestion}`;
}
