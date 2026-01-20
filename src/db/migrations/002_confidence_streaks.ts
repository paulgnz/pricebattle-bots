import type { Database } from 'sql.js';

export const migration002 = {
  version: 2,
  name: 'confidence_streaks',
  up: (db: Database) => {
    // Add confidence_bucket column to decisions table
    // Buckets: 'low' (50-59), 'medium' (60-74), 'high' (75-89), 'very_high' (90-100)
    db.run(`ALTER TABLE decisions ADD COLUMN confidence_bucket TEXT`);

    // Create confidence performance tracking table
    db.run(`
      CREATE TABLE IF NOT EXISTS confidence_performance (
        bucket TEXT PRIMARY KEY,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        ties INTEGER DEFAULT 0,
        total_wagered REAL DEFAULT 0,
        total_won REAL DEFAULT 0,
        total_lost REAL DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize confidence buckets
    db.run(`INSERT OR IGNORE INTO confidence_performance (bucket) VALUES ('low')`);
    db.run(`INSERT OR IGNORE INTO confidence_performance (bucket) VALUES ('medium')`);
    db.run(`INSERT OR IGNORE INTO confidence_performance (bucket) VALUES ('high')`);
    db.run(`INSERT OR IGNORE INTO confidence_performance (bucket) VALUES ('very_high')`);

    // Add streak tracking columns to performance table
    db.run(`ALTER TABLE performance ADD COLUMN current_streak INTEGER DEFAULT 0`);
    db.run(`ALTER TABLE performance ADD COLUMN best_win_streak INTEGER DEFAULT 0`);
    db.run(`ALTER TABLE performance ADD COLUMN worst_loss_streak INTEGER DEFAULT 0`);
  },
};
