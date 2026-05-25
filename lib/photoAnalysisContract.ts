import { PhotoIssueCandidate, PhotoVisionLabel, PhotoVisionResult } from './types';

type PhotoVisionImage = PhotoVisionResult['image'];

export function normalizePhotoVisionResponse(
  result: unknown,
  fallbackImage: PhotoVisionImage
): PhotoVisionResult {
  return normalizePhotoVisionResult(result, fallbackImage) ?? {
    suggestedLabels: [],
    issueCandidates: [],
    provider: 'gemini',
    model: '',
    promptVersion: '',
    taxonomyVersion: '',
    analyzedAt: '',
    latencyMs: 0,
    image: fallbackImage,
  };
}

export function parseStoredPhotoVisionResult(raw: unknown): PhotoVisionResult | null {
  const body = asRecord(raw);
  const image = normalizeImage(body?.image, null);
  if (!image) return null;

  return normalizePhotoVisionResult(raw, image);
}

function normalizePhotoVisionResult(
  result: unknown,
  fallbackImage: PhotoVisionImage
): PhotoVisionResult | null {
  const body = asRecord(result);
  if (!body) return null;

  const suggestedLabels = Array.isArray(body.suggestedLabels)
    ? body.suggestedLabels.map(normalizeLabel).filter(isPhotoVisionLabel)
    : [];

  const image = normalizeImage(body.image, fallbackImage) ?? fallbackImage;

  return {
    suggestedLabels,
    issueCandidates: normalizeIssueCandidates(body.issueCandidates, suggestedLabels),
    provider: 'gemini',
    model: stringValue(body.model),
    promptVersion: stringValue(body.promptVersion),
    taxonomyVersion: stringValue(body.taxonomyVersion),
    issueCatalogVersion: optionalStringValue(body.issueCatalogVersion),
    analyzedAt: stringValue(body.analyzedAt),
    latencyMs: numberValue(body.latencyMs),
    image,
  };
}

function normalizeIssueCandidates(
  candidates: unknown,
  labels: PhotoVisionLabel[]
): PhotoIssueCandidate[] {
  if (!Array.isArray(candidates)) return [];

  const labelsById = new Map(labels.map((label) => [label.id, label]));

  return candidates
    .map((candidate): PhotoIssueCandidate | null => {
      const item = asRecord(candidate);
      if (!item) return null;

      const issueId = stringValue(item.issueId);
      const title = stringValue(item.title);
      if (!issueId || !title) return null;

      const supportingLabelIds = Array.isArray(item.supportingLabelIds)
        ? item.supportingLabelIds.filter((labelId): labelId is string => labelsById.has(labelId))
        : [];
      const evidenceChips = Array.isArray(item.evidenceChips)
        ? item.evidenceChips.filter((chip): chip is string => typeof chip === 'string')
        : supportingLabelIds
            .map((labelId) => labelsById.get(labelId)?.label)
            .filter((chip): chip is string => Boolean(chip));

      return {
        issueId,
        title,
        confidence: numberValue(item.confidence),
        confidenceTier: normalizeConfidenceTier(item.confidenceTier),
        supportingLabelIds,
        evidenceChips,
        reason: stringValue(item.reason),
        suggestedDescription: stringValue(item.suggestedDescription),
        boundingBoxes: Array.isArray(item.boundingBoxes)
          ? item.boundingBoxes.map(normalizeCandidateBoundingBox).filter(isCandidateBoundingBox)
          : [],
      };
    })
    .filter((candidate): candidate is PhotoIssueCandidate => candidate != null)
    .slice(0, 5);
}

function normalizeConfidenceTier(value: unknown) {
  return value === 'strong' || value === 'likely' || value === 'possible'
    ? value
    : 'possible';
}

function normalizeLabel(label: unknown): PhotoVisionLabel | null {
  const item = asRecord(label);
  if (!item) return null;

  const id = stringValue(item.id);
  const labelText = stringValue(item.label);
  if (!id || !labelText) return null;

  const normalized: PhotoVisionLabel = {
    id,
    label: labelText,
    confidence: numberValue(item.confidence),
    evidence: stringValue(item.evidence),
  };

  const boundingBox = normalizeBoundingBox(item.boundingBox);
  if (boundingBox) {
    normalized.boundingBox = boundingBox;
  }

  return normalized;
}

function normalizeCandidateBoundingBox(
  box: unknown
): PhotoIssueCandidate['boundingBoxes'][number] | null {
  const item = asRecord(box);
  if (!item || typeof item.labelId !== 'string' || typeof item.label !== 'string') return null;

  const boundingBox = normalizeBoundingBox(item.boundingBox);
  if (!boundingBox) return null;

  return {
    labelId: item.labelId,
    label: item.label,
    boundingBox,
  };
}

function isCandidateBoundingBox(
  box: PhotoIssueCandidate['boundingBoxes'][number] | null
): box is PhotoIssueCandidate['boundingBoxes'][number] {
  return box != null;
}

function normalizeImage(raw: unknown, fallback: PhotoVisionImage | null): PhotoVisionImage | null {
  const item = asRecord(raw);
  if (!item) return fallback;

  return {
    bytes: numberValue(item.bytes),
    height: numberValue(item.height),
    mimeType: stringValue(item.mimeType) || fallback?.mimeType || 'image/jpeg',
    width: numberValue(item.width),
  };
}

function normalizeBoundingBox(raw: unknown) {
  const box = asRecord(raw);
  if (!box) return undefined;

  const x = clamp(numberValue(box.x), 0, 1);
  const y = clamp(numberValue(box.y), 0, 1);
  const width = clamp(numberValue(box.width), 0, 1 - x);
  const height = clamp(numberValue(box.height), 0, 1 - y);

  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

function isPhotoVisionLabel(label: PhotoVisionLabel | null): label is PhotoVisionLabel {
  return label != null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function optionalStringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
