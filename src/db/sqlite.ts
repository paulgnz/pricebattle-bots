import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { migrations } from './migrations';
import { Logger } from '../utils/logger';

let sqlPromise: Promise<any> | null = null;

async function getSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs();
  }
  return sqlPromise;
}

export async function initDatabase(dbPath: string, logger?: Logger): Promise<Database> {
  const SQL = await getSql();

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let db: Database;

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    logger?.debug('Loaded existing database', { path: dbPath });
  } else {
    db = new SQL.Database();
    logger?.debug('Created new database', { path: dbPath });
  }

  // Run migrations
  runMigrations(db, logger);

  // Save to disk
  saveDatabase(db, dbPath);

  return db;
}

function runMigrations(db: Database, logger?: Logger): void {
  // Create migrations table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get applied migrations
  const result = db.exec('SELECT version FROM migrations');
  const applied = new Set<number>();
  if (result.length > 0) {
    for (const row of result[0].values) {
      applied.add(row[0] as number);
    }
  }

  // Apply pending migrations
  for (const migration of migrations) {
    if (!applied.has(migration.version)) {
      logger?.info(`Applying migration ${migration.version}: ${migration.name}`);

      migration.up(db);
      db.run('INSERT INTO migrations (version, name) VALUES (?, ?)', [
        migration.version,
        migration.name,
      ]);

      logger?.info(`Migration ${migration.version} applied successfully`);
    }
  }
}

export function saveDatabase(db: Database, dbPath: string): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

export type DatabaseInstance = Database;
