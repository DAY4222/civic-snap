import {
  SUPPORTED_TAXONOMY_VERSION,
  buildServerAllowedLabels,
  DEFAULT_LIMIT_CONFIG,
  hybridRerankIssueCandidates,
  normalizeGeminiResult,
  parsePositiveIntegerEnvValue,
  readLimitConfigFromEnv,
  validateRequest,
  type AnalysisRequest,
  type EdgeIssueCatalogItem,
} from '../../supabase/functions/analyze-photo-labels/logic';
import { EDGE_ISSUE_CATALOG } from '../../supabase/functions/analyze-photo-labels/issueCatalog';

const allowedLabels = [
  { id: 'road-pothole', label: 'Road pothole' },
  { id: 'road-surface-damage', label: 'Road surface damage' },
  { id: 'roadway', label: 'Roadway' },
  { id: 'residential-curb', label: 'Residential curb' },
  { id: 'graffiti-private-property', label: 'Graffiti on private property' },
  { id: 'curbside-garbage', label: 'Curbside garbage' },
];

const validRequest: AnalysisRequest = {
  installId: 'install-1234567890abcdef',
  imageBase64: 'AAAA',
  image: {
    height: 10,
    width: 12,
  },
  mimeType: 'image/jpeg',
  allowedLabels,
  taxonomyVersion: SUPPORTED_TAXONOMY_VERSION,
};

function labelsFor(labelIds: string[]) {
  return labelIds.map((id) => ({
    id,
    label: id,
    confidence: 0.92,
    evidence: `${id} visible`,
  }));
}

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
    expect(validateRequest({ ...validRequest, installId: 'short' })).toEqual({
      ok: false,
      error: 'invalid_install_id',
    });
    expect(validateRequest({ ...validRequest, mimeType: 'image/gif' })).toEqual({
      ok: false,
      error: 'unsupported_mime_type',
    });
    expect(validateRequest({ ...validRequest, taxonomyVersion: 'photo-label-taxonomy-v1' })).toEqual({
      ok: false,
      error: 'unsupported_taxonomy_version',
    });
    expect(validateRequest(validRequest, { maxImageBase64Bytes: 2 })).toEqual({
      ok: false,
      error: 'image_too_large',
    });
    expect(validateRequest(validRequest)).toEqual({
      ok: false,
      error: 'server_label_catalog_unavailable',
    });

    const result = validateRequest(validRequest, DEFAULT_LIMIT_CONFIG, EDGE_ISSUE_CATALOG);
    expect(result).toMatchObject({
      ok: true,
      imageBytes: 3,
      imageHeight: 10,
      imageWidth: 12,
    });
  });

  it('builds allowed labels from the server issue catalog instead of trusting client labels', () => {
    const labels = buildServerAllowedLabels(EDGE_ISSUE_CATALOG);
    const labelIds = new Set(labels.map((label) => label.id));

    expect(labelIds.has('road-pothole')).toBe(true);
    expect(labelIds.has('unknown-client-label')).toBe(false);
    expect(labels.find((label) => label.id === 'road-pothole')).toMatchObject({
      label: 'Road Pothole',
    });
  });

  it('normalizes non-object Gemini output to empty safe arrays', () => {
    expect(normalizeGeminiResult(null, allowedLabels, EDGE_ISSUE_CATALOG)).toEqual({
      suggestedLabels: [],
      issueCandidates: [],
    });
    expect(normalizeGeminiResult([], allowedLabels, EDGE_ISSUE_CATALOG)).toEqual({
      suggestedLabels: [],
      issueCandidates: [],
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

  it('requires all mandatory labels before adding label-derived candidates', () => {
    const catalog: EdgeIssueCatalogItem[] = [
      {
        id: 'icy-sidewalk-needs-salting',
        title: 'Icy Sidewalk Needs Salting',
        categoryPath: [],
        shortDescription: '',
        discoverability: 'photo',
        visualCueLabelIds: ['icy-sidewalk', 'sidewalk'],
        requiredAnyLabelIds: ['icy-sidewalk'],
        requiredAllLabelIds: ['sidewalk'],
      },
    ];

    expect(
      hybridRerankIssueCandidates(
        [
          {
            id: 'sidewalk',
            label: 'Sidewalk',
            confidence: 0.94,
            evidence: 'sidewalk visible',
          },
        ],
        [],
        catalog
      )
    ).toEqual([]);

    expect(
      hybridRerankIssueCandidates(
        [
          {
            id: 'sidewalk',
            label: 'Sidewalk',
            confidence: 0.94,
            evidence: 'sidewalk visible',
          },
          {
            id: 'icy-sidewalk',
            label: 'Icy sidewalk',
            confidence: 0.9,
            evidence: 'ice on sidewalk',
          },
        ],
        [],
        catalog
      )[0]
    ).toMatchObject({
      issueId: 'icy-sidewalk-needs-salting',
      supportingLabelIds: ['icy-sidewalk', 'sidewalk'],
    });
  });

  it('adds supported missed-pickup candidates and keeps them possible', () => {
    const unsupportedCandidates = hybridRerankIssueCandidates(
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

    expect(unsupportedCandidates).toEqual([]);

    const candidates = hybridRerankIssueCandidates(
      [
        {
          id: 'curbside-garbage',
          label: 'Curbside garbage',
          confidence: 0.92,
          evidence: 'bags at curb',
        },
        {
          id: 'residential-curb',
          label: 'Residential curb',
          confidence: 0.86,
          evidence: 'residential curbside set-out',
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

  it('returns at most three candidates after scoring', () => {
    const catalog: EdgeIssueCatalogItem[] = ['a', 'b', 'c', 'd'].map((id) => ({
      id: `issue-${id}`,
      title: `Issue ${id}`,
      categoryPath: [],
      shortDescription: '',
      discoverability: 'photo',
      visualCueLabelIds: [`label-${id}`],
      requiredAnyLabelIds: [`label-${id}`],
      requiredAllLabelIds: [],
    }));

    const candidates = hybridRerankIssueCandidates(
      ['a', 'b', 'c', 'd'].map((id) => ({
        id: `label-${id}`,
        label: `Label ${id}`,
        confidence: 0.9,
        evidence: `evidence ${id}`,
      })),
      [],
      catalog
    );

    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.issueId)).toEqual([
      'issue-a',
      'issue-b',
      'issue-c',
    ]);
  });

  it('keeps only the strongest candidate in a suppression group', () => {
    const catalog: EdgeIssueCatalogItem[] = [
      {
        id: 'weaker-tree-issue',
        title: 'Weaker Tree Issue',
        categoryPath: [],
        shortDescription: '',
        discoverability: 'photo',
        visualCueLabelIds: ['tree-hazard'],
        requiredAnyLabelIds: ['tree-hazard'],
        requiredAllLabelIds: [],
        suppressionGroup: 'tree-hazard',
      },
      {
        id: 'stronger-tree-issue',
        title: 'Stronger Tree Issue',
        categoryPath: [],
        shortDescription: '',
        discoverability: 'photo',
        visualCueLabelIds: ['tree-hazard'],
        requiredAnyLabelIds: ['tree-hazard'],
        requiredAllLabelIds: [],
        suppressionGroup: 'tree-hazard',
      },
    ];

    const candidates = hybridRerankIssueCandidates(
      [
        {
          id: 'tree-hazard',
          label: 'Tree hazard',
          confidence: 0.88,
          evidence: 'large limb blocking sidewalk',
        },
      ],
      [
        {
          issueId: 'weaker-tree-issue',
          confidence: 0.75,
          supportingLabelIds: ['tree-hazard'],
          reason: 'Visible hazard.',
          suggestedDescription: 'Photo shows a visible tree hazard.',
        },
        {
          issueId: 'stronger-tree-issue',
          confidence: 0.95,
          supportingLabelIds: ['tree-hazard'],
          reason: 'Visible hazard.',
          suggestedDescription: 'Photo shows a visible tree hazard.',
        },
      ],
      catalog
    );

    expect(candidates.map((candidate) => candidate.issueId)).toEqual(['stronger-tree-issue']);
  });

  it('does not suggest issues from generic context labels alone', () => {
    for (const label of [
      { id: 'traffic-sign', label: 'Traffic sign' },
      { id: 'water-service-box', label: 'Water service box' },
      { id: 'garbage-bin', label: 'Garbage bin' },
      { id: 'sidewalk', label: 'Sidewalk' },
    ]) {
      expect(
        hybridRerankIssueCandidates(
          [
            {
              ...label,
              confidence: 0.96,
              evidence: `${label.label} is visible`,
            },
          ],
          [],
          EDGE_ISSUE_CATALOG
        )
      ).toEqual([]);
    }
  });

  it('suppresses duplicates in the real ambiguous issue clusters', () => {
    const issueById = new Map<string, EdgeIssueCatalogItem>(
      EDGE_ISSUE_CATALOG.map((issue) => [issue.id, issue])
    );
    const examples = [
      {
        group: 'tree-hazard',
        labels: [
          'fallen-tree-blocking-road-or-sidewalk',
          'private-hazardous-tree',
          'hanging-or-broken-branch',
        ],
      },
      {
        group: 'water-service-box',
        labels: [
          'water-service-box-damaged',
          'water-leaking-from-service-box',
          'surface-watermain-break',
          'water-service-box',
        ],
      },
      {
        group: 'street-traffic-signs',
        labels: [
          'damaged-or-missing-traffic-sign',
          'regulatory-sign-damaged',
          'traffic-sign',
          'regulatory-or-warning-sign',
        ],
      },
      {
        group: 'road-sinking',
        labels: ['sunken-road-surface', 'open-sinkhole', 'road-sinking-or-sinkhole', 'roadway'],
      },
      {
        group: 'missed-garbage',
        labels: ['curbside-garbage', 'residential-curb', 'multiple-curbside-setouts', 'garbage-bin'],
      },
      {
        group: 'intersection-snow-sightline',
        labels: ['snow-blocking-intersection-sightline', 'intersection', 'roadway'],
      },
    ];

    for (const example of examples) {
      const candidates = hybridRerankIssueCandidates(labelsFor(example.labels), [], EDGE_ISSUE_CATALOG);
      const groupedCandidates = candidates.filter(
        (candidate) => issueById.get(candidate.issueId)?.suppressionGroup === example.group
      );

      expect(groupedCandidates).toHaveLength(1);
    }
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
