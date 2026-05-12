import * as SQLite from 'expo-sqlite';

import { Report, ReportStatus } from './types';

type ReportRow = {
  id: string;
  category: string;
  description: string;
  answers_json: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  photo_uri: string | null;
  email_subject: string;
  email_body: string;
  status: ReportStatus;
  case_number: string;
  created_at: string;
  updated_at: string;
};

export type CreateReportInput = Omit<Report, 'id' | 'status' | 'caseNumber' | 'createdAt' | 'updatedAt'>;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('civic-snap.db');
  }

  const db = await databasePromise;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      address TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      photo_uri TEXT,
      email_subject TEXT NOT NULL,
      email_body TEXT NOT NULL,
      status TEXT NOT NULL,
      case_number TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export async function createDraftReport(input: CreateReportInput) {
  const db = await getDatabase();
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO reports (
      id, category, description, answers_json, address, latitude, longitude,
      photo_uri, email_subject, email_body, status, case_number, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.category,
    input.description,
    JSON.stringify(input.answers),
    input.address,
    input.latitude,
    input.longitude,
    input.photoUri,
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
      category = ?,
      description = ?,
      answers_json = ?,
      address = ?,
      latitude = ?,
      longitude = ?,
      photo_uri = ?,
      email_subject = ?,
      email_body = ?,
      status = ?,
      updated_at = ?
    WHERE id = ?`,
    input.category,
    input.description,
    JSON.stringify(input.answers),
    input.address,
    input.latitude,
    input.longitude,
    input.photoUri,
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
  const rows = await db.getAllAsync<ReportRow>(
    'SELECT * FROM reports ORDER BY created_at DESC'
  );
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

function rowToReport(row: ReportRow): Report {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    answers: parseAnswers(row.answers_json),
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    photoUri: row.photo_uri,
    emailSubject: row.email_subject,
    emailBody: row.email_body,
    status: row.status,
    caseNumber: row.case_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseAnswers(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}
