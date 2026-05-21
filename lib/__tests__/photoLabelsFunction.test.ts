import {
  DEFAULT_LIMIT_CONFIG,
  hybridRerankIssueCandidates,
  normalizeGeminiResult,
  parsePositiveIntegerEnvValue,
  readLimitConfigFromEnv,
  validateRequest,
  type AnalysisRequest,
} from '../../supabase/functions/analyze-photo-labels/logic';
import { EDGE_ISSUE_CATALOG } from '../../supabase/functions/analyze-photo-labels/issueCatalog';

const allowedLabels = [
  { id: 'road-pothole', label: 'Road pothole' },
  { id: 'road-surface-damage', label: 'Road surface damage' },
  { id: 'roadway', label: 'Roadway' },
  { id: 'graffiti-private-property', label: 'Graffiti on private property' },
  { id: 'curbside-garbage', label: 'Curbside garbage' },
];

const validRequest: AnalysisRequest = {
  installId: 'install-1',
  imageBase64: 'AAAA',
  image: {
    height: 10,
    width: 12,
  },
  mimeType: 'image/jpeg',
  allowedLabels,
  taxonomyVersion: 'photo-label-taxonomy-v1',
};

describe('photo label Edge Function logic', () => {
  it('rejects malformed numeric env values instead of disabling limits', () => {
    expect(parsePositiveIntegerEnvValue(undefined, 50)).toBe(50);
    expect(parsePositiveIntegerEnvValue(' 25 ', 50)).toBe(25);
    expect(parsePositiveIntegerEnvValue('2_000_000', 50)).toBeNull();
    expect(parsePositiveIntegerEnvValue('2MB', 50)).toBeNull();
    expect(parsePositiveIntegerEnvValue('0', 50)).toBeNull();
  });

  it('builds a limit config with defaults and fails closed on bad configured values', () => {
    expect(readLimitConfigFromEnv(() => undefined)).toEqual({
      ok: true,
      config: DEFAULT_LIMIT_CONFIG,
    });
    expect(
      readLimitConfigFromEnv((name) =>
        name === 'MAX_ANALYSES_GLOBAL_PER_DAY' ? '300 requests' : undefined
      )
    ).toEqual({ ok: false });
  });

  it('validates request shape and configured image size limits', () => {
    expect(validateRequest({ ...validRequest, installId: '' })).toEqual({
      ok: false,
      error: 'missing_install_id',
    });
    expect(validateRequest({ ...validRequest, mimeType: 'image/gif' })).toEqual({
      ok: false,
      error: 'unsupported_mime_type',
    });
    expect(validateRequest(validRequest, { maxImageBase64Bytes: 2 })).toEqual({
      ok: false,
      error: 'image_too_large',
    });

    const result = validateRequest(validRequest);
    expect(result).toMatchObject({
      ok: true,
      imageBytes: 3,
      imageHeight: 10,
      imageWidth: 12,
    });
  });

  it('normalizes Gemini output to allowed high-confidence labels only', () => {
    const result = normalizeGeminiResult(
      {
        suggestedLabels: [
          {
            id: 'graffiti-private-property',
            label: 'model-provided label is ignored',
            confidence: 0.8,
            evidence: '  marker tag on public sign  ',
            boundingBox: { x: 0.9, y: 0.2, width: 0.5, height: 0.3 },
          },
          {
            id: 'road-pothole',
            confidence: 0.95,
            evidence: 'visible road depression',
          },
          {
            id: 'unknown-id',
            confidence: 0.99,
            evidence: 'not in taxonomy',
          },
          {
            id: 'graffiti-private-property',
            confidence: 0.5,
            evidence: 'below threshold',
          },
        ],
        issueCandidates: [
          {
            issueId: 'road-pothole-road-damage',
            confidence: 0.9,
            supportingLabelIds: ['road-pothole'],
            reason: 'Visible road surface damage.',
            suggestedDescription: 'Photo shows a pothole in the road.',
          },
          {
            issueId: 'amplified-or-musical-instrument-noise',
            confidence: 0.99,
            supportingLabelIds: ['road-pothole'],
            reason: 'Noise is not photo-discoverable.',
          },
        ],
      },
      allowedLabels,
      EDGE_ISSUE_CATALOG
    );

    expect(result.suggestedLabels).toEqual([
      {
        id: 'road-pothole',
        label: 'Road pothole',
        confidence: 0.95,
        evidence: 'visible road depression',
        boundingBox: undefined,
      },
      {
        id: 'graffiti-private-property',
        label: 'Graffiti on private property',
        confidence: 0.8,
        evidence: 'marker tag on public sign',
        boundingBox: { x: 0.9, y: 0.2, width: 0.09999999999999998, height: 0.3 },
      },
    ]);
    expect(result.issueCandidates[0]).toMatchObject({
      issueId: 'road-pothole-road-damage',
      confidenceTier: 'strong',
      supportingLabelIds: ['road-pothole'],
    });
    expect(result.issueCandidates.map((candidate) => candidate.issueId)).not.toContain(
      'amplified-or-musical-instrument-noise'
    );
  });

  it('adds obvious candidates from labels and keeps missed pickup possible', () => {
    const candidates = hybridRerankIssueCandidates(
      [
        {
          id: 'curbside-garbage',
          label: 'Curbside garbage',
          confidence: 0.92,
          evidence: 'bags at curb',
        },
      ],
      [],
      EDGE_ISSUE_CATALOG
    );

    expect(candidates.map((candidate) => candidate.issueId)).toContain(
      'residential-garbage-day-collection-not-picked-up'
    );
    expect(candidates.every((candidate) => candidate.confidenceTier === 'possible')).toBe(true);
  });

  it('keeps a high-confidence pothole candidate when Gemini returns roadway support only', () => {
    const result = normalizeGeminiResult(
      {
        suggestedLabels: [
          {
            id: 'roadway',
            confidence: 0.91,
            evidence: 'asphalt road is visible',
          },
        ],
        issueCandidates: [
          {
            issueId: 'road-pothole-road-damage',
            confidence: 0.91,
            supportingLabelIds: ['roadway'],
            reason: 'The image shows road pavement damage.',
            suggestedDescription: 'Photo shows damaged road pavement at this location.',
          },
        ],
      },
      allowedLabels,
      EDGE_ISSUE_CATALOG
    );

    expect(result.issueCandidates[0]).toMatchObject({
      issueId: 'road-pothole-road-damage',
      confidenceTier: 'strong',
      supportingLabelIds: ['roadway', 'road-surface-damage'],
      evidenceChips: ['Roadway', 'Road surface damage'],
    });
  });
});
