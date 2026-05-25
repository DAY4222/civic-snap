import { normalizePhotoVisionResponse, parseStoredPhotoVisionResult } from '../photoAnalysisContract';
import { TEST_PHOTO_IMAGE } from '../testUtils/photoVisionFixtures';
import { normalizeGeminiResult } from '../../supabase/functions/analyze-photo-labels/logic';
import { EDGE_ISSUE_CATALOG } from '../../supabase/functions/analyze-photo-labels/issueCatalog';

const allowedLabels = [
  { id: 'road-pothole', label: 'Road pothole' },
  { id: 'road-surface-damage', label: 'Road surface damage' },
  { id: 'roadway', label: 'Roadway' },
];

const fallbackImage = TEST_PHOTO_IMAGE;

describe('photo analysis contract', () => {
  it('accepts normalized Edge output with an issue catalog version', () => {
    const safeResult = normalizeGeminiResult(
      {
        suggestedLabels: [
          {
            id: 'road-pothole',
            confidence: 0.95,
            evidence: 'visible road depression',
            boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
          },
        ],
        issueCandidates: [
          {
            issueId: 'road-pothole-road-damage',
            confidence: 0.93,
            supportingLabelIds: ['road-pothole'],
            reason: 'The photo shows a pothole.',
            suggestedDescription: 'Photo shows a pothole at this location.',
          },
        ],
      },
      allowedLabels,
      EDGE_ISSUE_CATALOG
    );

    const result = normalizePhotoVisionResponse(
      {
        ...safeResult,
        provider: 'gemini',
        model: 'gemini-test',
        promptVersion: 'photo-issue-candidates-v1',
        taxonomyVersion: 'photo-label-taxonomy-v1',
        issueCatalogVersion: 'edge-issue-catalog-v1',
        analyzedAt: '2026-05-20T00:00:00.000Z',
        latencyMs: 12,
        image: fallbackImage,
      },
      fallbackImage
    );

    expect(result.issueCatalogVersion).toBe('edge-issue-catalog-v1');
    expect(result.suggestedLabels[0]).toMatchObject({
      id: 'road-pothole',
      label: 'Road pothole',
    });
    expect(result.issueCandidates[0]).toMatchObject({
      issueId: 'road-pothole-road-damage',
      evidenceChips: ['Road pothole'],
    });
  });

  it('normalizes malformed stored results to null or safe arrays', () => {
    expect(parseStoredPhotoVisionResult(null)).toBeNull();
    expect(
      parseStoredPhotoVisionResult({
        suggestedLabels: [{ id: 'road-pothole', label: 'Road pothole', confidence: '0.9' }],
        issueCandidates: [{ issueId: 'missing-title' }],
        provider: 'other',
        image: fallbackImage,
      })
    ).toMatchObject({
      issueCandidates: [],
      provider: 'gemini',
      suggestedLabels: [{ id: 'road-pothole', confidence: 0.9 }],
    });
  });

  it('limits live and stored issue candidates to the top three', () => {
    const rawResult = {
      suggestedLabels: [{ id: 'road-pothole', label: 'Road pothole', confidence: 0.9 }],
      issueCandidates: ['one', 'two', 'three', 'four'].map((id) => ({
        issueId: `issue-${id}`,
        title: `Issue ${id}`,
        confidence: 0.9,
        confidenceTier: 'strong',
        supportingLabelIds: ['road-pothole'],
        evidenceChips: ['Road pothole'],
        reason: `Reason ${id}`,
        suggestedDescription: `Description ${id}`,
      })),
      provider: 'gemini',
      model: 'gemini-test',
      promptVersion: 'photo-issue-candidates-v1',
      taxonomyVersion: 'photo-label-taxonomy-v3',
      issueCatalogVersion: 'toronto-311-ai-issue-catalog-v2',
      analyzedAt: '2026-05-20T00:00:00.000Z',
      latencyMs: 12,
      image: fallbackImage,
    };

    expect(normalizePhotoVisionResponse(rawResult, fallbackImage).issueCandidates).toHaveLength(3);
    expect(parseStoredPhotoVisionResult(rawResult)?.issueCandidates).toHaveLength(3);
  });

  it('normalizes bounding boxes and drops unsupported candidate label evidence', () => {
    const result = normalizePhotoVisionResponse(
      {
        suggestedLabels: [
          {
            id: 'road-pothole',
            label: 'Road pothole',
            confidence: 0.9,
            evidence: 'visible road depression',
            boundingBox: { x: 0.8, y: -0.1, width: 0.5, height: 0.25 },
          },
          {
            id: 'roadway',
            label: 'Roadway',
            confidence: 0.8,
            evidence: 'road surface',
            boundingBox: { x: 0.2, y: 0.2, width: 0, height: 0.4 },
          },
        ],
        issueCandidates: [
          {
            issueId: 'road-pothole-road-damage',
            title: 'Road Pothole / Road Damage',
            confidence: 0.9,
            confidenceTier: 'strong',
            supportingLabelIds: ['road-pothole', 'unknown-label'],
            evidenceChips: ['Road pothole', false],
            reason: 'The photo shows a pothole.',
            suggestedDescription: 'Photo shows a pothole at this location.',
            boundingBoxes: [
              {
                labelId: 'road-pothole',
                label: 'Road pothole',
                boundingBox: { x: 0.9, y: 0.1, width: 0.3, height: 0.4 },
              },
              {
                labelId: 'roadway',
                label: 'Roadway',
                boundingBox: { x: 0.1, y: 0.2, width: -1, height: 0.4 },
              },
            ],
          },
        ],
        image: fallbackImage,
      },
      fallbackImage
    );

    expect(result.suggestedLabels).toEqual([
      {
        id: 'road-pothole',
        label: 'Road pothole',
        confidence: 0.9,
        evidence: 'visible road depression',
        boundingBox: { x: 0.8, y: 0, width: 0.19999999999999996, height: 0.25 },
      },
      {
        id: 'roadway',
        label: 'Roadway',
        confidence: 0.8,
        evidence: 'road surface',
      },
    ]);
    expect(result.issueCandidates[0]).toMatchObject({
      supportingLabelIds: ['road-pothole'],
      evidenceChips: ['Road pothole'],
      boundingBoxes: [
        {
          labelId: 'road-pothole',
          label: 'Road pothole',
          boundingBox: { x: 0.9, y: 0.1, width: 0.09999999999999998, height: 0.4 },
        },
      ],
    });
  });
});
