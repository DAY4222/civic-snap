import type {
  CategoryQuestion,
  CategoryQuestionOption,
  IssueCategory,
  ReportAnswerValue,
  ReportAnswers,
} from './types';

/**
 * Choice answers store the option label, not its value: the catalog's option values are opaque
 * Salesforce ids, so a label still reads correctly in an email if the catalog changes later.
 */
export function formatAnswer(value: ReportAnswerValue | undefined) {
  if (Array.isArray(value)) {
    return value
      .map((item) => item.trim())
      .filter(Boolean)
      .join(', ');
  }

  return value?.trim() ?? '';
}

export function isOptionSelected(
  question: CategoryQuestion,
  value: ReportAnswerValue | undefined,
  option: CategoryQuestionOption
) {
  if (question.answerType === 'multipicklist') {
    return Array.isArray(value) ? value.includes(option.label) : value === option.label;
  }

  return value === option.label;
}

export function toggleMultiAnswer(
  value: ReportAnswerValue | undefined,
  option: CategoryQuestionOption
) {
  const current = Array.isArray(value) ? value : value ? [value] : [];
  return current.includes(option.label)
    ? current.filter((label) => label !== option.label)
    : [...current, option.label];
}

/**
 * Drafts saved before answers became lists stored multi-choice answers as one ", "-joined
 * string, which breaks for labels that contain ", ". Recover the labels by matching the
 * question's known options.
 */
export function normalizeAnswersForCategory(
  answers: ReportAnswers,
  category: IssueCategory
): ReportAnswers {
  const normalized: ReportAnswers = { ...answers };

  for (const question of category.questions) {
    const value = normalized[question.id];
    if (question.answerType !== 'multipicklist' || typeof value !== 'string') continue;

    normalized[question.id] = question.options
      .map((option) => option.label)
      .filter((label) => isLabelInJoinedAnswer(value, label));
  }

  return normalized;
}

function isLabelInJoinedAnswer(joined: string, label: string) {
  return (
    joined === label ||
    joined.startsWith(`${label}, `) ||
    joined.endsWith(`, ${label}`) ||
    joined.includes(`, ${label}, `)
  );
}
