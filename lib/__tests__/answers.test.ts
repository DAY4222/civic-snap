import {
  formatAnswer,
  isOptionSelected,
  normalizeAnswersForCategory,
  toggleMultiAnswer,
} from '../answers';
import type { CategoryQuestion, CategoryQuestionOption, IssueCategory } from '../types';
import { GENERAL_CATEGORY } from '../categories';

function option(label: string): CategoryQuestionOption {
  return { label, value: `sf-${label}`, isEligibleResponse: null, suggestedLabelIds: [] };
}

const multiQuestion: CategoryQuestion = {
  id: 'parts',
  label: 'Which parts are damaged?',
  placeholder: '',
  answerType: 'multipicklist',
  isRequired: false,
  sectionName: '',
  options: [option('Lid'), option('Body, handle or frame'), option('Wheels')],
};

const singleQuestion: CategoryQuestion = {
  ...multiQuestion,
  id: 'size',
  answerType: 'picklist',
  options: [option('Small'), option('Large')],
};

const category: IssueCategory = {
  ...GENERAL_CATEGORY,
  id: 'bin',
  questions: [multiQuestion, singleQuestion],
};

describe('report answers', () => {
  it('toggles multi-choice answers as a list of labels', () => {
    const lid = option('Lid');

    expect(toggleMultiAnswer(undefined, lid)).toEqual(['Lid']);
    expect(toggleMultiAnswer(['Wheels'], lid)).toEqual(['Wheels', 'Lid']);
    expect(toggleMultiAnswer(['Wheels', 'Lid'], lid)).toEqual(['Wheels']);
  });

  it('keeps labels that contain ", " intact when toggling and selecting', () => {
    const bodyOption = option('Body, handle or frame');
    const value = toggleMultiAnswer(['Lid'], bodyOption);

    expect(value).toEqual(['Lid', 'Body, handle or frame']);
    expect(isOptionSelected(multiQuestion, value, bodyOption)).toBe(true);
    expect(isOptionSelected(multiQuestion, value, option('Wheels'))).toBe(false);
  });

  it('formats single and multi-choice answers for the email', () => {
    expect(formatAnswer(['Lid', 'Body, handle or frame'])).toBe('Lid, Body, handle or frame');
    expect(formatAnswer('  Large ')).toBe('Large');
    expect(formatAnswer(undefined)).toBe('');
    expect(formatAnswer([' ', ''])).toBe('');
  });

  it('recovers legacy joined multi-choice answers using the known option labels', () => {
    const normalized = normalizeAnswersForCategory(
      { parts: 'Lid, Body, handle or frame', size: 'Large', note: 'free text' },
      category
    );

    expect(normalized).toEqual({
      parts: ['Lid', 'Body, handle or frame'],
      size: 'Large',
      note: 'free text',
    });
  });
});
