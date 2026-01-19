import type { Database } from 'sql.js';

export const migration001 = {
  version: 1,
  name: 'initial',
  up: (db: Database) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        price REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_price_timestamp ON price_history(timestamp)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY,
        creator TEXT NOT NULL,
        opponent TEXT,
        amount TEXT NOT NULL,
        direction INTEGER NOT NULL,
        oracle_index INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        start_price TEXT,
        end_price TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        expires_at INTEGER,
        status INTEGER NOT NULL,
        winner TEXT,
        our_role TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_challenge_status ON challenges(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_challenge_creator ON challenges(creator)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenge_id INTEGER,
        action TEXT NOT NULL,
        direction TEXT,
        confidence INTEGER,
        reasoning TEXT,
        ai_provider TEXT,
        ai_model TEXT,
        price_at_decision REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_decision_challenge ON decisions(challenge_id)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS performance (
        date TEXT PRIMARY KEY,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        ties INTEGER DEFAULT 0,
        total_wagered REAL DEFAULT 0,
        total_won REAL DEFAULT 0,
        total_lost REAL DEFAULT 0,
        resolver_earnings REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },
};
