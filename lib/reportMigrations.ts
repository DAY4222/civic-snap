import { LEGACY_STATUSES, toStoredPhotoPath } from './reportPersistence';

/** The subset of expo-sqlite's async API the migrations use, so tests can run them on node:sqlite. */
export type MigrationDatabase = {
  execAsync(source: string): Promise<void>;
  getAllAsync<T>(source: string, ...params: (string | number | null)[]): Promise<T[]>;
  runAsync(source: string, ...params: (string | number | null)[]): Promise<unknown>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

export type Migration = {
  version: number;
  description: string;
  up: (db: MigrationDatabase) => Promise<void>;
};

const CREATE_REPORTS_TABLE_SQL = `
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
    thumbnail_uri TEXT,
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

/** Columns added during the prototype, before the schema was versioned. */
const PROTOTYPE_COLUMN_BACKFILLS = [
  { name: 'category_id', sql: 'ALTER TABLE reports ADD COLUMN category_id TEXT;' },
  { name: 'thumbnail_uri', sql: 'ALTER TABLE reports ADD COLUMN thumbnail_uri TEXT;' },
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
  return PROTOTYPE_COLUMN_BACKFILLS.filter((column) => !existing.has(column.name)).map(
    (column) => column.sql
  );
}

/**
 * Ordered schema changes. Each runs once, inside a transaction, and records its version in
 * PRAGMA user_version. Never edit a shipped migration; add a new one.
 */
export const REPORT_MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'reports table, including prototype column backfills',
    up: async (db) => {
      await db.execAsync(CREATE_REPORTS_TABLE_SQL);
      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(reports)');
      for (const sql of getMissingReportColumnMigrations(columns.map((column) => column.name))) {
        await db.execAsync(sql);
      }
    },
  },
  {
    version: 2,
    description: 'store photo paths relative to the document directory',
    up: async (db) => {
      const rows = await db.getAllAsync<{
        id: string;
        photo_uri: string | null;
        thumbnail_uri: string | null;
      }>('SELECT id, photo_uri, thumbnail_uri FROM reports');

      for (const row of rows) {
        const photoPath = toStoredPhotoPath(row.photo_uri);
        const thumbnailPath = toStoredPhotoPath(row.thumbnail_uri);
        if (photoPath === row.photo_uri && thumbnailPath === row.thumbnail_uri) continue;

        await db.runAsync(
          'UPDATE reports SET photo_uri = ?, thumbnail_uri = ? WHERE id = ?',
          photoPath,
          thumbnailPath,
          row.id
        );
      }
    },
  },
  {
    version: 3,
    description: 'store report status as codes instead of UI labels',
    up: async (db) => {
      for (const [label, status] of Object.entries(LEGACY_STATUSES)) {
        await db.runAsync('UPDATE reports SET status = ? WHERE status = ?', status, label);
      }
    },
  },
  {
    version: 4,
    description: 'save the location note with the draft',
    up: async (db) => {
      await db.execAsync("ALTER TABLE reports ADD COLUMN location_note TEXT NOT NULL DEFAULT '';");
    },
  },
  {
    version: 5,
    description: 'remember whether the email was generated, edited or AI-polished',
    up: async (db) => {
      await db.execAsync(
        "ALTER TABLE reports ADD COLUMN email_source TEXT NOT NULL DEFAULT 'generated';"
      );
    },
  },
  {
    version: 6,
    description: 'record how and when the report was handed off for sending',
    up: async (db) => {
      await db.execAsync(`
        ALTER TABLE reports ADD COLUMN handoff_method TEXT;
        ALTER TABLE reports ADD COLUMN handoff_app TEXT;
        ALTER TABLE reports ADD COLUMN handed_off_at TEXT;
      `);
    },
  },
];

export const LATEST_REPORTS_SCHEMA_VERSION = REPORT_MIGRATIONS[REPORT_MIGRATIONS.length - 1].version;

export async function runMigrations(
  db: MigrationDatabase,
  migrations: Migration[] = REPORT_MIGRATIONS
) {
  const versionRows = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = Number(versionRows[0]?.user_version) || 0;

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
