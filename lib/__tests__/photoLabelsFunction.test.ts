import {
  DEFAULT_LIMIT_CONFIG,
  normalizeGeminiResult,
  parsePositiveIntegerEnvValue,
  readLimitConfigFromEnv,
  validateRequest,
  type AnalysisRequest,
} from '../../supabase/functions/analyze-photo-labels/logic';

const allowedLabels = [
  { id: 'pothole', label: 'Pothole' },
  { id: 'graffiti', label: 'Graffiti' },
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
            id: 'graffiti',
            label: 'model-provided label is ignored',
            confidence: 0.8,
            evidence: '  marker tag on public sign  ',
            boundingBox: { x: 0.9, y: 0.2, width: 0.5, height: 0.3 },
          },
          {
            id: 'pothole',
            confidence: 0.95,
            evidence: 'visible road depression',
          },
          {
            id: 'unknown-id',
            confidence: 0.99,
            evidence: 'not in taxonomy',
          },
          {
            id: 'graffiti',
            confidence: 0.5,
            evidence: 'below threshold',
          },
        ],
        unknownObservations: [
          { name: 'traffic cone', confidence: 0.9, evidence: 'near the curb' },
          { name: '', confidence: 0.9, evidence: 'ignored' },
        ],
      },
      allowedLabels
    );

    expect(result.suggestedLabels).toEqual([
      {
        id: 'pothole',
        label: 'Pothole',
        confidence: 0.95,
        evidence: 'visible road depression',
        boundingBox: undefined,
      },
      {
        id: 'graffiti',
        label: 'Graffiti',
        confidence: 0.8,
        evidence: 'marker tag on public sign',
        boundingBox: { x: 0.9, y: 0.2, width: 0.09999999999999998, height: 0.3 },
      },
    ]);
    expect(result.unknownObservations).toEqual([
      { name: 'traffic cone', confidence: 0.9, evidence: 'near the curb' },
    ]);
  });
});
