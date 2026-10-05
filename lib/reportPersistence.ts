import { CATEGORY_TITLE_IDS } from './generated/categoryTitleIds';
import { parseStoredPhotoVisionResult } from './photoAnalysisContract';
import { EmailSource, PhotoIssueCandidate, Report, ReportAnswers, ReportStatus } from './types';

export type ReportRow = {
  id: string;
  category_id: string | null;
  category: string;
  description: string;
  answers_json: string;
  address: string;
  location_note: string | null;
  latitude: number | null;
  longitude: number | null;
  photo_uri: string | null;
  thumbnail_uri: string | null;
  photo_vision_result_json: string | null;
  photo_issue_topic_json: string | null;
  email_subject: string;
  email_body: string;
  email_source: string | null;
  status: string;
  case_number: string;
  created_at: string;
  updated_at: string;
};

/** A report as saved from the wizard: the draft plus its issue title and current email. */
export type CreateReportInput = Omit<
  Report,
  'id' | 'status' | 'caseNumber' | 'createdAt' | 'updatedAt'
>;

export function createReportId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
  );
}

export function serializeAnswers(answers: ReportAnswers) {
  return JSON.stringify(answers);
}

export function serializeNullableJson(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

const PHOTO_FOLDER = 'reports/';

/**
 * Report photos are stored relative to the document directory (`reports/<file>`), because
 * iOS can move the app container on update or restore, which breaks absolute paths.
 */
export function toStoredPhotoPath(uri: string | null) {
  if (!uri) return null;

  const folderIndex = uri.lastIndexOf(`/${PHOTO_FOLDER}`);
  return folderIndex >= 0 ? uri.slice(folderIndex + 1) : uri;
}

/** Resolves a stored photo path, including legacy absolute paths from an older container. */
export function resolveStoredPhotoPath(stored: string | null, documentDirectory: string | null) {
  const relativePath = toStoredPhotoPath(stored);
  if (!relativePath) return null;
  if (!documentDirectory || !relativePath.startsWith(PHOTO_FOLDER)) return relativePath;

  return `${documentDirectory}${relativePath}`;
}

export function rowToReport(row: ReportRow, photoDirectory: string | null = null): Report {
  const photoUri = resolveStoredPhotoPath(row.photo_uri || null, photoDirectory);

  return {
    id: stringValue(row.id),
    categoryId: row.category_id || CATEGORY_TITLE_IDS[row.category] || null,
    category: stringValue(row.category),
    description: stringValue(row.description),
    answers: parseAnswers(row.answers_json),
    address: stringValue(row.address),
    locationNote: stringValue(row.location_note),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    photoUri,
    thumbnailUri: resolveStoredPhotoPath(row.thumbnail_uri || null, photoDirectory) ?? photoUri,
    photoVisionResult: parsePhotoVisionResult(row.photo_vision_result_json),
    photoIssueTopic: parsePhotoIssueTopic(row.photo_issue_topic_json),
    emailSubject: stringValue(row.email_subject),
    emailBody: stringValue(row.email_body),
    emailSource: parseEmailSource(row.email_source),
    status: parseReportStatus(row.status),
    caseNumber: stringValue(row.case_number),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

export function parseAnswers(raw: string | null): ReportAnswers {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const answers: ReportAnswers = {};
  for (const [questionId, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      answers[questionId] = value;
    } else if (Array.isArray(value)) {
      answers[questionId] = value.filter((item): item is string => typeof item === 'string');
    }
  }
  return answers;
}

export function parsePhotoVisionResult(raw: string | null) {
  return parseStoredPhotoVisionResult(parseJson(raw));
}

export function parsePhotoIssueTopic(raw: string | null): PhotoIssueCandidate | null {
  const candidate = parseJson(raw);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;

  const item = candidate as Partial<PhotoIssueCandidate>;
  if (!item.issueId || !item.title) return null;

  return {
    issueId: item.issueId,
    title: item.title,
    confidence: Number(item.confidence) || 0,
    confidenceTier: normalizeConfidenceTier(item.confidenceTier),
    supportingLabelIds: stringArray(item.supportingLabelIds),
    evidenceChips: stringArray(item.evidenceChips),
    reason: typeof item.reason === 'string' ? item.reason : '',
    suggestedDescription: typeof item.suggestedDescription === 'string' ? item.suggestedDescription : '',
    boundingBoxes: Array.isArray(item.boundingBoxes)
      ? item.boundingBoxes.filter((box) => box?.boundingBox && typeof box.labelId === 'string')
      : [],
  };
}

/** Status labels stored before migration 3 replaced them with codes. */
export const LEGACY_STATUSES: Record<string, ReportStatus> = {
  Draft: 'draft',
  'Mail opened': 'handed_off',
  'Case added': 'case_added',
};

export function parseEmailSource(raw: string | null): EmailSource {
  return raw === 'user' || raw === 'ai' ? raw : 'generated';
}

export function parseReportStatus(raw: string): ReportStatus {
  if (raw === 'draft' || raw === 'handed_off' || raw === 'sent' || raw === 'case_added') return raw;
  return LEGACY_STATUSES[raw] ?? 'draft';
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeConfidenceTier(value: unknown) {
  return value === 'strong' || value === 'likely' || value === 'possible'
    ? value
    : 'possible';
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function nullableNumber(value: unknown) {
  if (value == null) return null;

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
