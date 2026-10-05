import {
  LATEST_REPORTS_SCHEMA_VERSION,
  REPORT_MIGRATIONS,
  runMigrations,
  type Migration,
  type MigrationDatabase,
} from '../reportMigrations';

type SqliteValue = string | number | null;
type NodeStatement = {
  all(...params: SqliteValue[]): unknown[];
  run(...params: SqliteValue[]): unknown;
};
type NodeDatabase = { exec(source: string): void; prepare(source: string): NodeStatement };

// node:sqlite stands in for expo-sqlite so the real migration SQL runs in Jest.
function createTestDatabase(): MigrationDatabase & { raw: NodeDatabase } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => NodeDatabase;
  };
  const raw = new DatabaseSync(':memory:');

  return {
    raw,
    execAsync: async (source) => {
      raw.exec(source);
    },
    getAllAsync: async <T>(source: string, ...params: SqliteValue[]) =>
      raw.prepare(source).all(...params) as T[],
    runAsync: async (source, ...params) => raw.prepare(source).run(...params),
    withTransactionAsync: async (task) => {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

async function userVersion(db: MigrationDatabase) {
  const rows = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version');
  return rows[0]?.user_version;
}

async function columnNames(db: MigrationDatabase) {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(reports)');
  return columns.map((column) => column.name);
}

describe('report migrations', () => {
  it('keeps versions strictly increasing', () => {
    const versions = REPORT_MIGRATIONS.map((migration) => migration.version);
    expect(versions).toEqual([...versions].sort((left, right) => left - right));
    expect(new Set(versions).size).toBe(versions.length);
    expect(LATEST_REPORTS_SCHEMA_VERSION).toBe(versions[versions.length - 1]);
  });

  it('creates the latest schema on a fresh install', async () => {
    const db = createTestDatabase();

    await runMigrations(db);

    expect(await userVersion(db)).toBe(LATEST_REPORTS_SCHEMA_VERSION);
    expect(await columnNames(db)).toEqual(
      expect.arrayContaining(['category_id', 'thumbnail_uri', 'photo_issue_topic_json'])
    );
  });

  it('upgrades a prototype database without losing reports', async () => {
    const db = createTestDatabase();
    db.raw.exec(`
      CREATE TABLE reports (
        id TEXT PRIMARY KEY NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL,
        answers_json TEXT NOT NULL, address TEXT NOT NULL, latitude REAL, longitude REAL,
        photo_uri TEXT, email_subject TEXT NOT NULL, email_body TEXT NOT NULL,
        status TEXT NOT NULL, case_number TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO reports VALUES (
        'old-1', 'Road Pothole / Road Damage', 'Pothole', '{}', '1 Main St', NULL, NULL,
        'file:///var/Application/OLD/Documents/reports/report-1.jpg', 'Subject', 'Body',
        'Draft', '', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'
      );
    `);

    await runMigrations(db);

    expect(await columnNames(db)).toEqual(expect.arrayContaining(['category_id', 'thumbnail_uri']));
    expect(await db.getAllAsync('SELECT id, photo_uri, description FROM reports')).toEqual([
      { id: 'old-1', photo_uri: 'reports/report-1.jpg', description: 'Pothole' },
    ]);
  });

  it('skips migrations that already ran and is safe to run again', async () => {
    const db = createTestDatabase();
    await runMigrations(db);
    await runMigrations(db);

    expect(await userVersion(db)).toBe(LATEST_REPORTS_SCHEMA_VERSION);
  });

  it('rolls back a failing migration and leaves the version unchanged', async () => {
    const db = createTestDatabase();
    await runMigrations(db);
    const failing: Migration = {
      version: LATEST_REPORTS_SCHEMA_VERSION + 1,
      description: 'fails halfway',
      up: async (database) => {
        await database.execAsync('ALTER TABLE reports ADD COLUMN half_done TEXT;');
        throw new Error('boom');
      },
    };

    await expect(runMigrations(db, [...REPORT_MIGRATIONS, failing])).rejects.toThrow('boom');

    expect(await userVersion(db)).toBe(LATEST_REPORTS_SCHEMA_VERSION);
    expect(await columnNames(db)).not.toContain('half_done');
  });
});
