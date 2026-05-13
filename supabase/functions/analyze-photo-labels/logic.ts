export type AllowedLabel = {
  id: string;
  label: string;
  description?: string;
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

type GeminiObservation = {
  name?: string;
  confidence?: number;
  evidence?: string;
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

type NormalizedGeminiObservation = {
  name: string;
  confidence: number;
  evidence: string;
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

export const MIN_CONFIDENCE = 0.7;
export const MAX_LABELS = 5;
export const MAX_UNKNOWN_OBSERVATIONS = 5;
export const MAX_EVIDENCE_CHARS = 240;
export const MAX_UNKNOWN_EVIDENCE_CHARS = 120;

const MAX_ALLOWED_LABELS = 40;

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

export function normalizeGeminiResult(body: unknown, allowedLabels: AllowedLabel[]) {
  const allowedById = new Map(allowedLabels.map((label) => [label.id, label]));
  const suggestedLabels = Array.isArray((body as { suggestedLabels?: unknown }).suggestedLabels)
    ? ((body as { suggestedLabels: GeminiLabel[] }).suggestedLabels ?? [])
        .map((label) => normalizeLabel(label, allowedById))
        .filter(isNormalizedGeminiLabel)
        .filter((label) => label.confidence >= MIN_CONFIDENCE)
        .sort((left, right) => right.confidence - left.confidence)
        .slice(0, MAX_LABELS)
    : [];

  const unknownObservations = Array.isArray(
    (body as { unknownObservations?: unknown }).unknownObservations
  )
    ? ((body as { unknownObservations: GeminiObservation[] }).unknownObservations ?? [])
        .map(normalizeUnknownObservation)
        .filter(isNormalizedGeminiObservation)
        .slice(0, MAX_UNKNOWN_OBSERVATIONS)
    : [];

  return { suggestedLabels, unknownObservations };
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

function normalizeUnknownObservation(
  observation: GeminiObservation
): NormalizedGeminiObservation | null {
  const name = typeof observation.name === 'string' ? truncateText(observation.name, 80) : '';
  if (!name) return null;

  return {
    name,
    confidence: clamp(Number(observation.confidence) || 0, 0, 1),
    evidence: truncateText(
      typeof observation.evidence === 'string' ? observation.evidence : '',
      MAX_UNKNOWN_EVIDENCE_CHARS
    ),
  };
}

function isNormalizedGeminiLabel(
  label: NormalizedGeminiLabel | null
): label is NormalizedGeminiLabel {
  return label != null;
}

function isNormalizedGeminiObservation(
  observation: NormalizedGeminiObservation | null
): observation is NormalizedGeminiObservation {
  return observation != null;
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
