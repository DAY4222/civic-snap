import * as SQLite from 'expo-sqlite';

import { runMigrations } from './reportMigrations';

const DATABASE_NAME = 'civic-snap.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens the local database once per app session and brings its schema up to date. */
export function openDatabase() {
  if (!databasePromise) {
    databasePromise = openAndMigrate().catch((error: unknown) => {
      // Let the next caller retry instead of caching the failure for the whole session.
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

async function openAndMigrate() {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await runMigrations(db);
  return db;
}
