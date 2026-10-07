import { openDatabase } from './db';
import {
  deleteOrphanReportPhotos,
  deleteReportPhotos,
  getReportPhotoBaseDirectory,
} from './photos';
import {
  createReportId,
  rowToReport,
  serializeAnswers,
  serializeNullableJson,
  toStoredPhotoPath,
} from './reportPersistence';
import type { CreateReportInput, ReportRow } from './reportPersistence';
import type { ReportStatus } from './types';

export type { CreateReportInput } from './reportPersistence';

export async function createDraftReport(input: CreateReportInput) {
  const db = await openDatabase();
  const id = createReportId();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO reports (
      id, category_id, category, description, answers_json, address, location_note, latitude, longitude,
      photo_uri, thumbnail_uri, photo_vision_result_json, photo_issue_topic_json, email_subject, email_body, status, case_number,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.categoryId,
    input.category,
    input.description,
    serializeAnswers(input.answers),
    input.address,
    input.locationNote,
    input.latitude,
    input.longitude,
    toStoredPhotoPath(input.photoUri),
    toStoredPhotoPath(input.thumbnailUri),
    serializeNullableJson(input.photoVisionResult),
    serializeNullableJson(input.photoIssueTopic),
    input.emailSubject,
    input.emailBody,
    'draft',
    '',
    now,
    now
  );

  return id;
}

/**
 * Saves the wizard's latest content. Only drafts are updated, so a save that lands after the
 * report was handed off can't overwrite it or turn it back into a draft.
 */
export async function updateDraftReport(id: string, input: CreateReportInput) {
  const db = await openDatabase();
  await db.runAsync(
    `UPDATE reports SET
      category_id = ?,
      category = ?,
      description = ?,
      answers_json = ?,
      address = ?,
      location_note = ?,
      latitude = ?,
      longitude = ?,
      photo_uri = ?,
      thumbnail_uri = ?,
      photo_vision_result_json = ?,
      photo_issue_topic_json = ?,
      email_subject = ?,
      email_body = ?,
      updated_at = ?
    WHERE id = ? AND status = 'draft'`,
    input.categoryId,
    input.category,
    input.description,
    serializeAnswers(input.answers),
    input.address,
    input.locationNote,
    input.latitude,
    input.longitude,
    toStoredPhotoPath(input.photoUri),
    toStoredPhotoPath(input.thumbnailUri),
    serializeNullableJson(input.photoVisionResult),
    serializeNullableJson(input.photoIssueTopic),
    input.emailSubject,
    input.emailBody,
    new Date().toISOString(),
    id
  );
}

export async function updateReportEmail(id: string, emailSubject: string, emailBody: string) {
  const db = await openDatabase();
  await db.runAsync(
    'UPDATE reports SET email_subject = ?, email_body = ?, updated_at = ? WHERE id = ?',
    emailSubject,
    emailBody,
    new Date().toISOString(),
    id
  );
}

export async function listReports() {
  const db = await openDatabase();
  const rows = await db.getAllAsync<ReportRow>('SELECT * FROM reports ORDER BY created_at DESC');
  const photoDirectory = getReportPhotoBaseDirectory();
  return rows.map((row) => rowToReport(row, photoDirectory));
}

export async function getReport(id: string) {
  const db = await openDatabase();
  const rows = await db.getAllAsync<ReportRow>('SELECT * FROM reports WHERE id = ?', id);
  return rows[0] ? rowToReport(rows[0], getReportPhotoBaseDirectory()) : null;
}

export async function updateReportStatus(id: string, status: ReportStatus) {
  const db = await openDatabase();
  await db.runAsync(
    'UPDATE reports SET status = ?, updated_at = ? WHERE id = ?',
    status,
    new Date().toISOString(),
    id
  );
}

export async function updateCaseNumber(id: string, caseNumber: string) {
  const db = await openDatabase();
  await db.runAsync(
    'UPDATE reports SET case_number = ?, status = ?, updated_at = ? WHERE id = ?',
    caseNumber,
    caseNumber ? 'case_added' : 'sent',
    new Date().toISOString(),
    id
  );
}

export async function deleteReport(id: string) {
  const report = await getReport(id);
  const db = await openDatabase();

  await db.runAsync('DELETE FROM reports WHERE id = ?', id);
  await deleteReportPhotos([report?.photoUri, report?.thumbnailUri]);
}

/** Removes photo files no report uses: leftovers from crashes or abandoned retakes. */
export async function sweepOrphanReportPhotos() {
  if (!getReportPhotoBaseDirectory()) return 0;

  const db = await openDatabase();
  const rows = await db.getAllAsync<{ photo_uri: string | null; thumbnail_uri: string | null }>(
    'SELECT photo_uri, thumbnail_uri FROM reports'
  );
  return deleteOrphanReportPhotos(rows.flatMap((row) => [row.photo_uri, row.thumbnail_uri]));
}
