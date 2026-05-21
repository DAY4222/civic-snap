import { ISSUE_CATEGORIES } from '../categories';
import {
  appendSuggestedDescription,
  getSuggestedAnswerOptions,
  getSuggestedIssueCandidates,
} from '../issueSuggestions';
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
    const result: PhotoVisionResult = {
      suggestedLabels: [],
      issueCandidates: [selectedCandidate],
      provider: 'gemini',
      model: 'test-model',
      promptVersion: 'test-prompt',
      taxonomyVersion: 'test-taxonomy',
      analyzedAt: '2026-05-20T00:00:00.000Z',
      latencyMs: 10,
      image: {
        bytes: 100,
        height: 300,
        mimeType: 'image/jpeg',
        width: 400,
      },
    };

    expect(getSuggestedIssueCandidates(result)).toEqual([selectedCandidate]);
  });

  it('suggests checklist answers from supporting labels without filling them', () => {
    const category = ISSUE_CATEGORIES.find((issue) => issue.id === 'residential-bin-lid-damaged');
    const partQuestion = category?.questions.find((question) => question.label === 'What part is damaged?');

    expect(partQuestion).toBeDefined();
    expect(getSuggestedAnswerOptions(partQuestion!, selectedCandidate).map((option) => option.label)).toEqual([
      'Lid',
    ]);
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
});
