import * as SQLite from 'expo-sqlite';

import { deleteReportPhotos } from './photos';
import {
  CREATE_REPORTS_TABLE_SQL,
  REPORTS_SCHEMA_VERSION,
  createReportId,
  getMissingReportColumnMigrations,
  rowToReport,
  serializeAnswers,
  serializeNullableJson,
} from './reportPersistence';
import type { CreateReportInput, ReportRow } from './reportPersistence';
import type { ReportStatus } from './types';

export type { CreateReportInput } from './reportPersistence';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('civic-snap.db');
  }

  const db = await databasePromise;
  await migrateReportsSchema(db);
  return db;
}

async function migrateReportsSchema(db: SQLite.SQLiteDatabase) {
  await db.execAsync(CREATE_REPORTS_TABLE_SQL);

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(reports)');
  for (const migrationSql of getMissingReportColumnMigrations(
    columns.map((column) => column.name)
  )) {
    await db.execAsync(migrationSql);
  }

  const versionRows = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version');
  const userVersion = Number(versionRows[0]?.user_version) || 0;
  if (userVersion < REPORTS_SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${REPORTS_SCHEMA_VERSION};`);
  }
}

export async function createDraftReport(input: CreateReportInput) {
  const db = await getDatabase();
  const id = createReportId();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO reports (
      id, category_id, category, description, answers_json, address, latitude, longitude,
      photo_uri, thumbnail_uri, photo_vision_result_json, photo_issue_topic_json, email_subject, email_body, status, case_number,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.categoryId,
    input.category,
    input.description,
    serializeAnswers(input.answers),
    input.address,
    input.latitude,
    input.longitude,
    input.photoUri,
    input.thumbnailUri,
    serializeNullableJson(input.photoVisionResult),
    serializeNullableJson(input.photoIssueTopic),
    input.emailSubject,
    input.emailBody,
    'Draft',
    '',
    now,
    now
  );

  return id;
}

export async function updateDraftReport(id: string, input: CreateReportInput) {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE reports SET
      category_id = ?,
      category = ?,
      description = ?,
      answers_json = ?,
      address = ?,
      latitude = ?,
      longitude = ?,
      photo_uri = ?,
      thumbnail_uri = ?,
      photo_vision_result_json = ?,
      photo_issue_topic_json = ?,
      email_subject = ?,
      email_body = ?,
      status = ?,
      updated_at = ?
    WHERE id = ?`,
    input.categoryId,
    input.category,
    input.description,
    serializeAnswers(input.answers),
    input.address,
    input.latitude,
    input.longitude,
    input.photoUri,
    input.thumbnailUri,
    serializeNullableJson(input.photoVisionResult),
    serializeNullableJson(input.photoIssueTopic),
    input.emailSubject,
    input.emailBody,
    'Draft',
    new Date().toISOString(),
    id
  );
}

export async function updateReportEmail(id: string, emailSubject: string, emailBody: string) {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE reports SET email_subject = ?, email_body = ?, updated_at = ? WHERE id = ?',
    emailSubject,
    emailBody,
    new Date().toISOString(),
    id
  );
}

export async function listReports() {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ReportRow>('SELECT * FROM reports ORDER BY created_at DESC');
  return rows.map(rowToReport);
}

export async function getReport(id: string) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ReportRow>('SELECT * FROM reports WHERE id = ?', id);
  return rows[0] ? rowToReport(rows[0]) : null;
}

export async function updateReportStatus(id: string, status: ReportStatus) {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE reports SET status = ?, updated_at = ? WHERE id = ?',
    status,
    new Date().toISOString(),
    id
  );
}

export async function updateCaseNumber(id: string, caseNumber: string) {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE reports SET case_number = ?, status = ?, updated_at = ? WHERE id = ?',
    caseNumber,
    caseNumber ? 'Case added' : 'Mail opened',
    new Date().toISOString(),
    id
  );
}

export async function deleteReport(id: string) {
  const report = await getReport(id);
  const db = await getDatabase();

  await db.runAsync('DELETE FROM reports WHERE id = ?', id);
  await deleteReportPhotos([report?.photoUri, report?.thumbnailUri]);
}
