import { getCategory } from '../categories';
import {
  applyChecklistDefaults,
  getChecklistDefaults,
  isAnswered,
  isExactLocationQuestion,
  isIslandQuestion,
  splitChecklist,
} from '../checklistRules';
import { ISSUE_CATEGORIES } from '../categories';
import type { IssueCategory } from '../types';

const pothole = getCategory('road-pothole-road-damage') as IssueCategory;
const islandQuestion = pothole.questions.find(isIslandQuestion)!;
const exactLocationQuestion = pothole.questions.find(isExactLocationQuestion)!;

const QUEEN_ST = { latitude: 43.6487, longitude: -79.3962 };
const CENTRE_ISLAND = { latitude: 43.6205, longitude: -79.3745 };
const MISSISSAUGA = { latitude: 43.589, longitude: -79.6441 };

function draftAt(position: { latitude: number; longitude: number } | null, address = '', note = '') {
  return {
    address,
    latitude: position?.latitude ?? null,
    longitude: position?.longitude ?? null,
    locationNote: note,
  };
}

describe('checklist question rules', () => {
  it('finds the Toronto Island and exact-location questions on the pothole checklist', () => {
    expect(islandQuestion.label).toMatch(/Toronto Island/);
    expect(exactLocationQuestion.label).toBe('What is the exact location of the pothole/road damage?');
  });

  it('does not treat "where the items will be placed" as the issue location', () => {
    const hazardous = getCategory('hazardous-waste-pick-up') as IssueCategory;
    expect(hazardous.questions.some(isExactLocationQuestion)).toBe(false);
  });

  it('only matches island questions that have Yes and No answers', () => {
    const islandQuestions = ISSUE_CATEGORIES.flatMap((category) =>
      category.questions.filter(isIslandQuestion)
    );
    expect(islandQuestions.length).toBeGreaterThanOrEqual(2);
  });
});

describe('getChecklistDefaults', () => {
  it('answers No to the island question for a downtown pin, and fills the exact location', () => {
    const defaults = getChecklistDefaults(
      pothole,
      draftAt(QUEEN_ST, '439 Queen St W, Toronto', 'curb lane, east of Spadina')
    );
    expect(defaults).toEqual(
      expect.arrayContaining([
        { questionId: islandQuestion.id, value: 'No', source: 'island' },
        {
          questionId: exactLocationQuestion.id,
          value: '439 Queen St W, Toronto — curb lane, east of Spadina',
          source: 'location',
        },
      ])
    );
  });

  it('answers Yes for a pin on the island', () => {
    const defaults = getChecklistDefaults(pothole, draftAt(CENTRE_ISLAND));
    expect(defaults).toEqual([{ questionId: islandQuestion.id, value: 'Yes', source: 'island' }]);
  });

  it('leaves the island question alone without a pin, or with a pin outside the city', () => {
    expect(getChecklistDefaults(pothole, draftAt(null, '439 Queen St W'))).toEqual([
      { questionId: exactLocationQuestion.id, value: '439 Queen St W', source: 'location' },
    ]);
    expect(getChecklistDefaults(pothole, draftAt(MISSISSAUGA))).toEqual([]);
  });
});

describe('applyChecklistDefaults', () => {
  const defaults = [
    { questionId: 'island', value: 'No', source: 'island' as const },
    { questionId: 'where', value: '439 Queen St W', source: 'location' as const },
  ];

  it('fills empty answers and remembers what it filled', () => {
    expect(applyChecklistDefaults({ other: 'yes' }, defaults, {})).toEqual({
      answers: { other: 'yes', island: 'No', where: '439 Queen St W' },
      filled: { island: 'No', where: '439 Queen St W' },
    });
  });

  it('never changes an answer the user gave', () => {
    const result = applyChecklistDefaults({ where: 'In front of the bakery' }, defaults, {
      where: '439 Queen St W',
    });
    expect(result.answers.where).toBe('In front of the bakery');
    expect(result.filled).toEqual({ island: 'No' });
  });

  it('updates a filled answer when the location changes, and clears one that no longer applies', () => {
    const moved = applyChecklistDefaults(
      { island: 'No', where: '439 Queen St W' },
      [{ questionId: 'where', value: '100 Queen St W', source: 'location' }],
      { island: 'No', where: '439 Queen St W' }
    );
    expect(moved.answers).toEqual({ where: '100 Queen St W' });
    expect(moved.filled).toEqual({ where: '100 Queen St W' });
  });
});

describe('splitChecklist', () => {
  it('puts required questions first and counts answers', () => {
    const { required, optional } = splitChecklist(pothole.questions);
    expect(required.length + optional.length).toBe(pothole.questions.length);
    expect(required.every((question) => question.isRequired)).toBe(true);
    expect(isAnswered(' ')).toBe(false);
    expect(isAnswered(['', 'Yes'])).toBe(true);
  });
});
