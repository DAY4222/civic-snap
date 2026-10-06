import { CITY, isWithinBounds } from './city';
import type { CategoryQuestion, IssueCategory, ReportAnswers, ReportDraft } from './types';

/** An answer the app can fill in from what the user already gave, and why. */
export type ChecklistDefault = {
  questionId: string;
  value: string;
  source: 'location' | 'island';
};

/** Answers the app filled in last time, by question id, to tell them apart from the user's. */
export type FilledAnswers = Record<string, string>;

const EXACT_LOCATION_LABEL = /\b(exact location|details of (the )?location|location of the)\b/i;
// "Indicate the exact location of where the items will be placed" asks where items will be
// left for pickup, not where the problem is.
const NOT_THE_ISSUE_LOCATION = /will be placed/i;
const ISLAND_LABEL = /toronto island/i;

/** A free-text question asking where exactly the problem is. */
export function isExactLocationQuestion(question: CategoryQuestion) {
  return (
    question.answerType === 'text' &&
    EXACT_LOCATION_LABEL.test(question.label) &&
    !NOT_THE_ISSUE_LOCATION.test(question.label)
  );
}

/** "Is this … on Toronto Island?" with Yes and No options. */
export function isIslandQuestion(question: CategoryQuestion) {
  return (
    ISLAND_LABEL.test(question.label) &&
    findOption(question, 'yes') != null &&
    findOption(question, 'no') != null
  );
}

function findOption(question: CategoryQuestion, label: 'yes' | 'no') {
  return question.options.find((option) => option.label.trim().toLowerCase() === label);
}

/**
 * The checklist answers that follow from the report's location: the exact-location question
 * gets the address and note, and the Toronto Island question is answered from the pin.
 */
export function getChecklistDefaults(
  category: Pick<IssueCategory, 'questions'>,
  draft: Pick<ReportDraft, 'address' | 'latitude' | 'longitude' | 'locationNote'>
): ChecklistDefault[] {
  const locationText = [draft.address.trim(), draft.locationNote.trim()]
    .filter(Boolean)
    .join(' — ');
  const pinInCity =
    draft.latitude != null &&
    draft.longitude != null &&
    isWithinBounds(draft.latitude, draft.longitude, CITY.bounds);
  const onIsland =
    pinInCity && isWithinBounds(draft.latitude!, draft.longitude!, CITY.islandBounds);

  const defaults: ChecklistDefault[] = [];
  for (const question of category.questions) {
    if (isExactLocationQuestion(question) && locationText) {
      defaults.push({ questionId: question.id, value: locationText, source: 'location' });
    } else if (isIslandQuestion(question) && pinInCity) {
      const option = findOption(question, onIsland ? 'yes' : 'no');
      if (option) defaults.push({ questionId: question.id, value: option.label, source: 'island' });
    }
  }
  return defaults;
}

/**
 * Fills defaults into answers the user hasn't given: empty ones, and ones still holding what
 * was filled last time (so moving the pin updates them). A filled answer whose default no
 * longer applies is cleared. Answers the user typed or chose are never changed.
 */
export function applyChecklistDefaults(
  answers: ReportAnswers,
  defaults: ChecklistDefault[],
  previouslyFilled: FilledAnswers
): { answers: ReportAnswers; filled: FilledAnswers } {
  const next: ReportAnswers = { ...answers };
  const filled: FilledAnswers = {};
  const isUntouched = (questionId: string) => {
    const current = answers[questionId];
    if (current == null || current === '') return true;
    if (Array.isArray(current)) return current.length === 0;
    return current === previouslyFilled[questionId];
  };

  for (const { questionId, value } of defaults) {
    if (!isUntouched(questionId)) continue;
    next[questionId] = value;
    filled[questionId] = value;
  }

  for (const [questionId, value] of Object.entries(previouslyFilled)) {
    const stillDefault = defaults.some((item) => item.questionId === questionId);
    if (!stillDefault && answers[questionId] === value) delete next[questionId];
  }

  return { answers: next, filled };
}

/** Required questions first ("311 needs to know"), then the optional ones. */
export function splitChecklist(questions: CategoryQuestion[]) {
  return {
    required: questions.filter((question) => question.isRequired),
    optional: questions.filter((question) => !question.isRequired),
  };
}

export function isAnswered(value: ReportAnswers[string] | undefined) {
  if (Array.isArray(value)) return value.some((item) => item.trim());
  return Boolean(value?.trim());
}
