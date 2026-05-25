export type AllowedLabel = {
  id: string;
  label: string;
  description?: string;
};

export type EdgeIssueCatalogItem = {
  id: string;
  title: string;
  categoryPath: readonly string[];
  shortDescription: string;
  discoverability: 'photo' | 'limited-context' | 'not-discoverable';
  visualCueLabelIds: readonly string[];
  requiredAnyLabelIds: readonly string[];
  requiredAllLabelIds?: readonly string[];
  photoHint?: string;
  suppressionGroup?: string;
  forceConfidenceTier?: ConfidenceTier;
};

export type AnalysisRequest = {
  installId?: string;
  imageBase64?: string;
  image?: {
    bytes?: number;
    height?: number;
    width?: number;
  };
  mimeType?: string;
  allowedLabels?: AllowedLabel[];
  taxonomyVersion?: string;
};

type GeminiLabel = {
  id?: string;
  label?: string;
  confidence?: number;
  evidence?: string;
  boundingBox?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
};

type GeminiIssueCandidate = {
  issueId?: string;
  confidence?: number;
  supportingLabelIds?: string[];
  reason?: string;
  suggestedDescription?: string;
};

type NormalizedGeminiLabel = {
  id: string;
  label: string;
  confidence: number;
  evidence: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type ConfidenceTier = 'strong' | 'likely' | 'possible';

export type NormalizedIssueCandidate = {
  issueId: string;
  title: string;
  confidence: number;
  confidenceTier: ConfidenceTier;
  supportingLabelIds: string[];
  evidenceChips: string[];
  reason: string;
  suggestedDescription: string;
  boundingBoxes: {
    labelId: string;
    label: string;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }[];
};

export type LimitConfig = {
  maxAnalysesGlobalPerDay: number;
  maxAnalysesPerInstallPerDay: number;
  maxImageBase64Bytes: number;
};

export const DEFAULT_LIMIT_CONFIG: LimitConfig = {
  maxAnalysesGlobalPerDay: 300,
  maxAnalysesPerInstallPerDay: 50,
  maxImageBase64Bytes: 2_000_000,
};

export const MIN_CONFIDENCE = 0.55;
export const MAX_LABELS = 10;
export const MAX_ISSUE_CANDIDATES = 3;
export const MAX_EVIDENCE_CHARS = 240;
export const MAX_REASON_CHARS = 180;
export const MAX_DESCRIPTION_CHARS = 180;

const MAX_ALLOWED_LABELS = 100;

export function parsePositiveIntegerEnvValue(raw: string | undefined, fallback: number) {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;

  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) return null;

  return value;
}

export function readLimitConfigFromEnv(getEnv: (name: string) => string | undefined) {
  const maxImageBase64Bytes = parsePositiveIntegerEnvValue(
    getEnv('MAX_IMAGE_BASE64_BYTES'),
    DEFAULT_LIMIT_CONFIG.maxImageBase64Bytes
  );
  const maxAnalysesPerInstallPerDay = parsePositiveIntegerEnvValue(
    getEnv('MAX_ANALYSES_PER_INSTALL_PER_DAY'),
    DEFAULT_LIMIT_CONFIG.maxAnalysesPerInstallPerDay
  );
  const maxAnalysesGlobalPerDay = parsePositiveIntegerEnvValue(
    getEnv('MAX_ANALYSES_GLOBAL_PER_DAY'),
    DEFAULT_LIMIT_CONFIG.maxAnalysesGlobalPerDay
  );

  if (
    maxImageBase64Bytes == null ||
    maxAnalysesPerInstallPerDay == null ||
    maxAnalysesGlobalPerDay == null
  ) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    config: {
      maxAnalysesGlobalPerDay,
      maxAnalysesPerInstallPerDay,
      maxImageBase64Bytes,
    },
  };
}

export function validateRequest(
  body: AnalysisRequest,
  limits: Pick<LimitConfig, 'maxImageBase64Bytes'> = DEFAULT_LIMIT_CONFIG
) {
  const installId = typeof body.installId === 'string' ? body.installId.trim() : '';
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : '';
  const taxonomyVersion =
    typeof body.taxonomyVersion === 'string' ? body.taxonomyVersion.trim() : '';

  if (!installId) return { ok: false as const, error: 'missing_install_id' };
  if (!imageBase64) return { ok: false as const, error: 'missing_image' };
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    return { ok: false as const, error: 'unsupported_mime_type' };
  }

  const imageBytes = getBase64ByteSize(imageBase64);
  if (imageBytes > limits.maxImageBase64Bytes) {
    return { ok: false as const, error: 'image_too_large' };
  }

  const allowedLabels = Array.isArray(body.allowedLabels)
    ? body.allowedLabels
        .filter((label) => typeof label.id === 'string' && typeof label.label === 'string')
        .slice(0, MAX_ALLOWED_LABELS)
    : [];

  if (allowedLabels.length === 0) {
    return { ok: false as const, error: 'missing_allowed_labels' };
  }

  return {
    ok: true as const,
    allowedLabels,
    imageBase64,
    imageBytes,
    imageHeight: Number(body.image?.height) || null,
    imageWidth: Number(body.image?.width) || null,
    installId,
    mimeType,
    taxonomyVersion: taxonomyVersion || 'unknown',
  };
}

export type ValidAnalysisRequest = Extract<ReturnType<typeof validateRequest>, { ok: true }>;

export function normalizeGeminiResult(
  body: unknown,
  allowedLabels: AllowedLabel[],
  issueCatalog: readonly EdgeIssueCatalogItem[] = []
) {
  const allowedById = new Map(allowedLabels.map((label) => [label.id, label]));
  const suggestedLabels = Array.isArray((body as { suggestedLabels?: unknown }).suggestedLabels)
    ? ((body as { suggestedLabels: GeminiLabel[] }).suggestedLabels ?? [])
        .map((label) => normalizeLabel(label, allowedById))
        .filter(isNormalizedGeminiLabel)
        .filter((label) => label.confidence >= MIN_CONFIDENCE)
        .sort((left, right) => right.confidence - left.confidence)
        .slice(0, MAX_LABELS)
    : [];

  const modelCandidates = Array.isArray((body as { issueCandidates?: unknown }).issueCandidates)
    ? ((body as { issueCandidates: GeminiIssueCandidate[] }).issueCandidates ?? [])
        .map(normalizeModelIssueCandidate)
        .filter(isModelIssueCandidate)
    : [];
  const issueCandidates = hybridRerankIssueCandidates(
    suggestedLabels,
    modelCandidates,
    issueCatalog,
    allowedLabels
  );

  return { suggestedLabels, issueCandidates };
}

function normalizeLabel(
  label: GeminiLabel,
  allowedById: Map<string, AllowedLabel>
): NormalizedGeminiLabel | null {
  const id = typeof label.id === 'string' ? label.id : '';
  const allowedLabel = allowedById.get(id);
  if (!allowedLabel) return null;

  return {
    id,
    label: allowedLabel.label,
    confidence: clamp(Number(label.confidence) || 0, 0, 1),
    evidence: truncateText(typeof label.evidence === 'string' ? label.evidence : '', MAX_EVIDENCE_CHARS),
    boundingBox: normalizeBoundingBox(label.boundingBox),
  };
}

function isNormalizedGeminiLabel(
  label: NormalizedGeminiLabel | null
): label is NormalizedGeminiLabel {
  return label != null;
}

export type ModelIssueCandidate = {
  issueId: string;
  confidence: number;
  supportingLabelIds: string[];
  reason: string;
  suggestedDescription: string;
};

function normalizeModelIssueCandidate(candidate: GeminiIssueCandidate): ModelIssueCandidate | null {
  const issueId = typeof candidate.issueId === 'string' ? candidate.issueId.trim() : '';
  if (!issueId) return null;

  const supportingLabelIds = Array.isArray(candidate.supportingLabelIds)
    ? candidate.supportingLabelIds.filter((labelId): labelId is string => typeof labelId === 'string')
    : [];

  return {
    issueId,
    confidence: clamp(Number(candidate.confidence) || 0, 0, 1),
    supportingLabelIds,
    reason: truncateText(typeof candidate.reason === 'string' ? candidate.reason : '', MAX_REASON_CHARS),
    suggestedDescription: truncateText(
      typeof candidate.suggestedDescription === 'string' ? candidate.suggestedDescription : '',
      MAX_DESCRIPTION_CHARS
    ),
  };
}

function isModelIssueCandidate(
  candidate: ModelIssueCandidate | null
): candidate is ModelIssueCandidate {
  return candidate != null;
}

export function hybridRerankIssueCandidates(
  suggestedLabels: NormalizedGeminiLabel[],
  modelCandidates: ModelIssueCandidate[],
  issueCatalog: readonly EdgeIssueCatalogItem[],
  allowedLabels: readonly AllowedLabel[] = []
) {
  const labelsById = new Map(suggestedLabels.map((label) => [label.id, label]));
  const allowedLabelsById = new Map(allowedLabels.map((label) => [label.id, label]));
  const issueById = new Map(issueCatalog.map((issue) => [issue.id, issue]));
  const candidatesByIssueId = new Map<string, NormalizedIssueCandidate>();

  for (const modelCandidate of modelCandidates) {
    const issue = issueById.get(modelCandidate.issueId);
    if (!issue || issue.discoverability === 'not-discoverable') continue;

    const support = bridgeRequiredSupportIfSafe(
      issue,
      getSupportedLabelIds(issue, labelsById, modelCandidate.supportingLabelIds),
      modelCandidate
    );
    if (!issueIsSupported(issue, support)) continue;

    const ruleScore = scoreIssue(issue, support);
    addCandidate(candidatesByIssueId, issue, labelsById, allowedLabelsById, {
      confidence: Math.max(modelCandidate.confidence, ruleScore),
      reason: modelCandidate.reason,
      suggestedDescription: modelCandidate.suggestedDescription,
      supportingLabelIds: support,
    });
  }

  for (const issue of issueCatalog) {
    if (issue.discoverability === 'not-discoverable') continue;

    const support = getSupportedLabelIds(issue, labelsById);
    if (!issueIsSupported(issue, support)) continue;

    addCandidate(candidatesByIssueId, issue, labelsById, allowedLabelsById, {
      confidence: scoreIssue(issue, support),
      reason: '',
      suggestedDescription: '',
      supportingLabelIds: support,
    });
  }

  return suppressGroupedCandidates([...candidatesByIssueId.values()], issueById)
    .slice(0, MAX_ISSUE_CANDIDATES);
}

function addCandidate(
  candidatesByIssueId: Map<string, NormalizedIssueCandidate>,
  issue: EdgeIssueCatalogItem,
  labelsById: Map<string, NormalizedGeminiLabel>,
  allowedLabelsById: Map<string, AllowedLabel>,
  input: {
    confidence: number;
    reason: string;
    suggestedDescription: string;
    supportingLabelIds: string[];
  }
) {
  const confidence = issue.forceConfidenceTier === 'possible'
    ? Math.min(input.confidence, 0.69)
    : input.confidence;
  const existing = candidatesByIssueId.get(issue.id);
  if (existing && existing.confidence >= confidence) return;

  const evidenceChips = input.supportingLabelIds
    .map((labelId) => labelsById.get(labelId)?.label ?? allowedLabelsById.get(labelId)?.label)
    .filter((label): label is string => Boolean(label));

  const candidate: NormalizedIssueCandidate = {
    issueId: issue.id,
    title: issue.title,
    confidence,
    confidenceTier: issue.forceConfidenceTier ?? confidenceTierFor(confidence),
    supportingLabelIds: input.supportingLabelIds,
    evidenceChips,
    reason: input.reason || fallbackReason(issue, evidenceChips),
    suggestedDescription:
      input.suggestedDescription || fallbackSuggestedDescription(issue, evidenceChips),
    boundingBoxes: input.supportingLabelIds
      .map((labelId) => {
        const label = labelsById.get(labelId);
        return label?.boundingBox
          ? { labelId, label: label.label, boundingBox: label.boundingBox }
          : null;
      })
      .filter((box): box is NormalizedIssueCandidate['boundingBoxes'][number] => box != null),
  };

  candidatesByIssueId.set(issue.id, candidate);
}

function getSupportedLabelIds(
  issue: EdgeIssueCatalogItem,
  labelsById: Map<string, NormalizedGeminiLabel>,
  modelSupportingLabelIds: string[] = []
) {
  const supported = [
    ...modelSupportingLabelIds.filter((labelId) => labelsById.has(labelId)),
    ...issue.visualCueLabelIds.filter((labelId) => labelsById.has(labelId)),
  ];

  return [...new Set(supported)];
}

function issueIsSupported(
  issue: EdgeIssueCatalogItem,
  support: string[]
) {
  if (support.length === 0) return false;
  const requiredAllLabelIds = issue.requiredAllLabelIds ?? [];
  if (requiredAllLabelIds.some((labelId) => !support.includes(labelId))) return false;
  if (issue.requiredAnyLabelIds.length === 0) return true;
  return issue.requiredAnyLabelIds.some((labelId) => support.includes(labelId));
}

function bridgeRequiredSupportIfSafe(
  issue: EdgeIssueCatalogItem,
  support: string[],
  modelCandidate: ModelIssueCandidate
) {
  if (issueIsSupported(issue, support)) return support;
  if (issue.id !== 'road-pothole-road-damage') return support;
  if (modelCandidate.confidence < 0.82) return support;
  if (!support.some((labelId) => labelId === 'roadway' || labelId === 'bike-lane')) return support;

  return [...support, 'road-surface-damage'];
}

function scoreIssue(issue: EdgeIssueCatalogItem, supportingLabelIds: string[]) {
  const requiredAllLabelIds = issue.requiredAllLabelIds ?? [];
  const requiredAllMatches = requiredAllLabelIds.filter((labelId) =>
    supportingLabelIds.includes(labelId)
  ).length;
  const requiredMatches = issue.requiredAnyLabelIds.filter((labelId) =>
    supportingLabelIds.includes(labelId)
  ).length;
  if (requiredAllMatches !== requiredAllLabelIds.length) return 0;
  if (issue.requiredAnyLabelIds.length > 0 && requiredMatches === 0) return 0;

  const base = issue.discoverability === 'photo' ? 0.82 : 0.66;
  const supportBonus = Math.min(supportingLabelIds.length * 0.035, 0.12);
  const requiredBonus = Math.min(requiredMatches * 0.05 + requiredAllMatches * 0.06, 0.16);
  return clamp(base + supportBonus + requiredBonus, 0, 0.96);
}

function suppressGroupedCandidates(
  candidates: NormalizedIssueCandidate[],
  issueById: Map<string, EdgeIssueCatalogItem>
) {
  const sorted = candidates.sort(compareIssueCandidates);
  const seenGroups = new Set<string>();
  const result: NormalizedIssueCandidate[] = [];

  for (const candidate of sorted) {
    const suppressionGroup = issueById.get(candidate.issueId)?.suppressionGroup;
    if (suppressionGroup) {
      if (seenGroups.has(suppressionGroup)) continue;
      seenGroups.add(suppressionGroup);
    }
    result.push(candidate);
  }

  return result;
}

function compareIssueCandidates(left: NormalizedIssueCandidate, right: NormalizedIssueCandidate) {
  const tierDelta = tierRank(right.confidenceTier) - tierRank(left.confidenceTier);
  return tierDelta || right.confidence - left.confidence;
}

function confidenceTierFor(confidence: number): ConfidenceTier {
  if (confidence >= 0.88) return 'strong';
  if (confidence >= 0.72) return 'likely';
  return 'possible';
}

function tierRank(tier: ConfidenceTier) {
  if (tier === 'strong') return 3;
  if (tier === 'likely') return 2;
  return 1;
}

function fallbackReason(issue: EdgeIssueCatalogItem, evidenceChips: string[]) {
  if (issue.forceConfidenceTier === 'possible') {
    return 'The photo shows visible set-out evidence, but pickup timing still needs confirmation.';
  }

  const evidence = evidenceChips.slice(0, 2).join(' and ').toLowerCase();
  return evidence
    ? `The photo shows ${evidence}, which matches this 311 issue.`
    : 'The visible photo evidence matches this 311 issue.';
}

function fallbackSuggestedDescription(issue: EdgeIssueCatalogItem, evidenceChips: string[]) {
  const evidence = evidenceChips.slice(0, 2).join(' and ').toLowerCase();
  if (issue.forceConfidenceTier === 'possible') {
    return evidence
      ? `Photo shows ${evidence} set out at this location; pickup timing still needs confirmation.`
      : 'Photo shows set-out evidence at this location; pickup timing still needs confirmation.';
  }

  return evidence
    ? `Photo shows ${evidence} at this location.`
    : `Photo shows evidence related to ${issue.title}.`;
}

function normalizeBoundingBox(box: GeminiLabel['boundingBox']) {
  if (!box) return undefined;

  const x = clamp(Number(box.x) || 0, 0, 1);
  const y = clamp(Number(box.y) || 0, 0, 1);
  const width = clamp(Number(box.width) || 0, 0, 1 - x);
  const height = clamp(Number(box.height) || 0, 0, 1 - y);

  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

function getBase64ByteSize(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function truncateText(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
}
