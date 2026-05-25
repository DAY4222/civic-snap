import { findCategoryByTitle } from './categories';
import { parseStoredPhotoVisionResult } from './photoAnalysisContract';
import { PhotoIssueCandidate, Report, ReportStatus } from './types';

export type ReportRow = {
  id: string;
  category_id: string | null;
  category: string;
  description: string;
  answers_json: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  photo_uri: string | null;
  photo_vision_result_json: string | null;
  photo_issue_topic_json: string | null;
  email_subject: string;
  email_body: string;
  status: string;
  case_number: string;
  created_at: string;
  updated_at: string;
};

export type CreateReportInput = Omit<
  Report,
  'id' | 'status' | 'caseNumber' | 'createdAt' | 'updatedAt'
>;

export const REPORTS_SCHEMA_VERSION = 1;

export const CREATE_REPORTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    photo_uri TEXT,
    photo_vision_result_json TEXT,
    photo_issue_topic_json TEXT,
    email_subject TEXT NOT NULL,
    email_body TEXT NOT NULL,
    status TEXT NOT NULL,
    case_number TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const COLUMN_BACKFILLS = [
  { name: 'category_id', sql: 'ALTER TABLE reports ADD COLUMN category_id TEXT;' },
  {
    name: 'photo_vision_result_json',
    sql: 'ALTER TABLE reports ADD COLUMN photo_vision_result_json TEXT;',
  },
  {
    name: 'photo_issue_topic_json',
    sql: 'ALTER TABLE reports ADD COLUMN photo_issue_topic_json TEXT;',
  },
] as const;

export function getMissingReportColumnMigrations(columnNames: string[]) {
  const existing = new Set(columnNames);
  return COLUMN_BACKFILLS.filter((column) => !existing.has(column.name)).map((column) => column.sql);
}

export function createReportId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
  );
}

export function serializeAnswers(answers: Record<string, string>) {
  return JSON.stringify(answers);
}

export function serializeNullableJson(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

export function rowToReport(row: ReportRow): Report {
  return {
    id: stringValue(row.id),
    categoryId: row.category_id || findCategoryByTitle(row.category)?.id || null,
    category: stringValue(row.category),
    description: stringValue(row.description),
    answers: parseAnswers(row.answers_json),
    address: stringValue(row.address),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    photoUri: row.photo_uri || null,
    photoVisionResult: parsePhotoVisionResult(row.photo_vision_result_json),
    photoIssueTopic: parsePhotoIssueTopic(row.photo_issue_topic_json),
    emailSubject: stringValue(row.email_subject),
    emailBody: stringValue(row.email_body),
    status: parseReportStatus(row.status),
    caseNumber: stringValue(row.case_number),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

export function parseAnswers(raw: string | null) {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === 'string' && typeof entry[1] === 'string'
    )
  );
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

export function parseReportStatus(raw: string): ReportStatus {
  if (raw === 'Draft' || raw === 'Mail opened' || raw === 'Case added') return raw;
  return 'Draft';
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
  return value == null ? null : Number(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
