import { ISSUE_CATEGORIES } from '../categories';
import {
  appendSuggestedDescription,
  getSuggestedAnswerOptions,
  getSuggestedIssueCandidates,
  toggleMultiAnswer,
} from '../issueSuggestions';
import { makePhotoIssueCandidate, makePhotoVisionResult } from '../testUtils/photoVisionFixtures';
import type { PhotoIssueCandidate, PhotoVisionResult } from '../types';

const selectedCandidate: PhotoIssueCandidate = {
  issueId: 'residential-bin-lid-damaged',
  title: 'Residential Bin Lid Damaged',
  confidence: 0.9,
  confidenceTier: 'strong',
  supportingLabelIds: ['bin-lid-damaged'],
  evidenceChips: ['Bin lid damaged'],
  reason: 'The photo shows a damaged bin lid.',
  suggestedDescription: 'Photo shows a damaged residential bin lid.',
  boundingBoxes: [],
};

describe('issue suggestions', () => {
  it('returns candidates from a normalized vision result', () => {
    const result: PhotoVisionResult = makePhotoVisionResult({
      suggestedLabels: [],
      issueCandidates: [selectedCandidate],
    });

    expect(getSuggestedIssueCandidates(result)).toEqual([selectedCandidate]);
  });

  it('returns no candidates for null results and caps suggestions at three', () => {
    const result = makePhotoVisionResult({
      issueCandidates: ['one', 'two', 'three', 'four'].map((id) =>
        makePhotoIssueCandidate({
          issueId: `issue-${id}`,
          title: `Issue ${id}`,
        })
      ),
    });

    expect(getSuggestedIssueCandidates(null)).toEqual([]);
    expect(getSuggestedIssueCandidates(result).map((candidate) => candidate.issueId)).toEqual([
      'issue-one',
      'issue-two',
      'issue-three',
    ]);
  });

  it('suggests checklist answers from supporting labels without filling them', () => {
    const category = ISSUE_CATEGORIES.find((issue) => issue.id === 'residential-bin-lid-damaged');
    const partQuestion = category?.questions.find(
      (question) => question.label === 'What part is damaged?'
    );

    expect(partQuestion).toBeDefined();
    expect(
      getSuggestedAnswerOptions(partQuestion!, selectedCandidate).map((option) => option.label)
    ).toEqual(['Lid']);
  });

  it('appends suggested descriptions once', () => {
    expect(appendSuggestedDescription('', selectedCandidate.suggestedDescription)).toBe(
      selectedCandidate.suggestedDescription
    );
    expect(
      appendSuggestedDescription(
        selectedCandidate.suggestedDescription,
        selectedCandidate.suggestedDescription
      )
    ).toBe(selectedCandidate.suggestedDescription);
  });

  it('toggles multipicklist answers without duplicating options', () => {
    const option = {
      label: 'Lid',
      value: 'lid',
      isEligibleResponse: true,
      suggestedLabelIds: ['bin-lid-damaged'],
    };

    expect(toggleMultiAnswer('', option)).toBe('Lid');
    expect(toggleMultiAnswer('Body', option)).toBe('Body, Lid');
    expect(toggleMultiAnswer('Body, Lid', option)).toBe('Body');
  });
});
