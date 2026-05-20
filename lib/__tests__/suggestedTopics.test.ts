import { PHOTO_LABELS } from '../photoLabels';
import {
  PHOTO_ISSUE_TOPICS,
  getMissingPhotoTopicLabelIds,
  getSuggestedIssueTopics,
} from '../suggestedTopics';
import { PhotoVisionResult } from '../types';

function resultForLabels(labels: PhotoVisionResult['suggestedLabels']): PhotoVisionResult {
  return {
    suggestedLabels: labels,
    provider: 'gemini',
    model: 'test-model',
    promptVersion: 'test-prompt',
    taxonomyVersion: 'test-taxonomy',
    analyzedAt: '2026-05-13T00:00:00.000Z',
    latencyMs: 10,
    image: {
      bytes: 100,
      height: 300,
      mimeType: 'image/jpeg',
      width: 400,
    },
  };
}

describe('photo issue topic suggestions', () => {
  it('covers every current photo label', () => {
    expect(getMissingPhotoTopicLabelIds()).toEqual([]);
    expect(PHOTO_ISSUE_TOPICS).toHaveLength(PHOTO_LABELS.length);
  });

  it('ranks mapped topics by confidence and limits results to three', () => {
    const suggestions = getSuggestedIssueTopics(
      resultForLabels([
        { id: 'graffiti', label: 'Graffiti', confidence: 0.72, evidence: 'tagged wall' },
        { id: 'pothole', label: 'Pothole', confidence: 0.96, evidence: 'road hole' },
        { id: 'mattress', label: 'Mattress', confidence: 0.81, evidence: 'mattress by curb' },
        { id: 'streetlight', label: 'Streetlight', confidence: 0.88, evidence: 'lamp pole' },
      ])
    );

    expect(suggestions.map((topic) => topic.labelId)).toEqual(['pothole', 'streetlight', 'mattress']);
  });

  it('ignores unknown labels', () => {
    const suggestions = getSuggestedIssueTopics(
      resultForLabels([
        { id: 'not-in-taxonomy', label: 'Mystery', confidence: 0.99, evidence: 'unknown object' },
      ])
    );

    expect(suggestions).toEqual([]);
  });
});
