import type { PhotoIssueCandidate, PhotoVisionResult } from '../types';

export const TEST_PHOTO_IMAGE: PhotoVisionResult['image'] = {
  bytes: 100,
  height: 300,
  mimeType: 'image/jpeg',
  width: 400,
};

export function makePhotoIssueCandidate(
  overrides: Partial<PhotoIssueCandidate> = {}
): PhotoIssueCandidate {
  return {
    issueId: 'road-pothole-road-damage',
    title: 'Road Pothole / Road Damage',
    confidence: 0.91,
    confidenceTier: 'strong',
    supportingLabelIds: ['road-pothole'],
    evidenceChips: ['Road pothole'],
    reason: 'The photo shows a road pothole.',
    suggestedDescription: 'Photo shows a road pothole at this location.',
    boundingBoxes: [],
    ...overrides,
  };
}

export function makePhotoVisionResult(
  overrides: Partial<PhotoVisionResult> = {}
): PhotoVisionResult {
  return {
    suggestedLabels: [
      {
        id: 'road-pothole',
        label: 'Road pothole',
        confidence: 0.9,
        evidence: 'visible road pothole',
      },
    ],
    issueCandidates: [makePhotoIssueCandidate()],
    provider: 'gemini',
    model: 'test-model',
    promptVersion: 'test-prompt',
    taxonomyVersion: 'test-taxonomy',
    analyzedAt: '2026-05-20T00:00:00.000Z',
    latencyMs: 10,
    image: TEST_PHOTO_IMAGE,
    ...overrides,
  };
}
