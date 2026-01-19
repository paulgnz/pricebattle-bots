import type { Database } from 'sql.js';
import { Challenge, BotPerformance } from '../types';
import { todayDate } from '../utils/time';
import { saveDatabase } from './sqlite';

export class DatabaseQueries {
  private db: Database;
  private dbPath: string;

  constructor(db: Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  private save(): void {
    saveDatabase(this.db, this.dbPath);
  }

  // ========== Price History ==========

  insertPrice(price: number, timestamp: number): void {
    this.db.run('INSERT INTO price_history (price, timestamp) VALUES (?, ?)', [price, timestamp]);
    this.save();
  }

  getRecentPrices(limit: number = 60): { price: number; timestamp: number }[] {
    const result = this.db.exec(
      `SELECT price, timestamp FROM price_history ORDER BY timestamp DESC LIMIT ${limit}`
    );

    if (result.length === 0) return [];

    return result[0].values.map((row: any[]) => ({
      price: row[0] as number,
      timestamp: row[1] as number,
    }));
  }

  getPriceAt(timestamp: number): number | null {
    const result = this.db.exec(
      `SELECT price FROM price_history WHERE timestamp <= ${timestamp} ORDER BY timestamp DESC LIMIT 1`
    );

    if (result.length === 0 || result[0].values.length === 0) return null;
    return result[0].values[0][0] as number;
  }

  // ========== Challenges ==========

  upsertChallenge(challenge: Challenge, ourRole?: string): void {
    // Check if exists
    const existing = this.db.exec(`SELECT id FROM challenges WHERE id = ${challenge.id}`);

    if (existing.length > 0 && existing[0].values.length > 0) {
      // Update
      this.db.run(
        `UPDATE challenges SET
          opponent = ?, start_price = ?, end_price = ?, started_at = ?,
          expires_at = ?, status = ?, winner = ?, synced_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          challenge.opponent || null,
          challenge.start_price || null,
          challenge.end_price || null,
          challenge.started_at || null,
          challenge.expires_at || null,
          challenge.status,
          challenge.winner || null,
          challenge.id,
        ]
      );
    } else {
      // Insert
      this.db.run(
        `INSERT INTO challenges (
          id, creator, opponent, amount, direction, oracle_index, duration,
          start_price, end_price, created_at, started_at, expires_at, status, winner, our_role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          challenge.id,
          challenge.creator,
          challenge.opponent || null,
          challenge.amount,
          challenge.direction,
          challenge.oracle_index,
          challenge.duration,
          challenge.start_price || null,
          challenge.end_price || null,
          challenge.created_at,
          challenge.started_at || null,
          challenge.expires_at || null,
          challenge.status,
          challenge.winner || null,
          ourRole || null,
        ]
      );
    }
    this.save();
  }

  upsertChallenges(challenges: Challenge[], account?: string): void {
    for (const c of challenges) {
      let ourRole: string | null = null;
      if (account) {
        if (c.creator === account) ourRole = 'creator';
        else if (c.opponent === account) ourRole = 'opponent';
      }
      this.upsertChallenge(c, ourRole || undefined);
    }
  }

  getOurChallenges(account: string): Challenge[] {
    const result = this.db.exec(
      `SELECT * FROM challenges WHERE creator = '${account}' OR opponent = '${account}' ORDER BY id DESC`
    );

    if (result.length === 0) return [];
    return this.rowsToObjects(result[0]) as Challenge[];
  }

  getActiveChallenges(): Challenge[] {
    const result = this.db.exec('SELECT * FROM challenges WHERE status = 1 ORDER BY id DESC');
    if (result.length === 0) return [];
    return this.rowsToObjects(result[0]) as Challenge[];
  }

  getChallengeById(id: number): Challenge | null {
    const result = this.db.exec(`SELECT * FROM challenges WHERE id = ${id}`);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return this.rowsToObjects(result[0])[0] as Challenge;
  }

  // ========== Decisions ==========

  logDecision(params: {
    challengeId?: number;
    action: string;
    direction?: string;
    confidence?: number;
    reasoning?: string;
    aiProvider?: string;
    aiModel?: string;
    priceAtDecision?: number;
  }): void {
    this.db.run(
      `INSERT INTO decisions (
        challenge_id, action, direction, confidence, reasoning,
        ai_provider, ai_model, price_at_decision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.challengeId ?? null,
        params.action,
        params.direction ?? null,
        params.confidence ?? null,
        params.reasoning ?? null,
        params.aiProvider ?? null,
        params.aiModel ?? null,
        params.priceAtDecision ?? null,
      ]
    );
    this.save();
  }

  getRecentDecisions(limit: number = 20): any[] {
    const result = this.db.exec(
      `SELECT * FROM decisions ORDER BY created_at DESC LIMIT ${limit}`
    );
    if (result.length === 0) return [];
    return this.rowsToObjects(result[0]);
  }

  // ========== Performance ==========

  getPerformance(date: string = todayDate()): BotPerformance {
    const result = this.db.exec(`SELECT * FROM performance WHERE date = '${date}'`);

    if (result.length === 0 || result[0].values.length === 0) {
      return {
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        totalWon: 0,
        totalLost: 0,
      };
    }

    const row = this.rowsToObjects(result[0])[0] as any;
    const total = row.wins + row.losses + row.ties;

    return {
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      winRate: total > 0 ? (row.wins / total) * 100 : 0,
      totalWon: row.total_won,
      totalLost: row.total_lost,
    };
  }

  incrementWin(amount: number, date: string = todayDate()): void {
    const existing = this.db.exec(`SELECT date FROM performance WHERE date = '${date}'`);

    if (existing.length > 0 && existing[0].values.length > 0) {
      this.db.run(
        `UPDATE performance SET wins = wins + 1, total_won = total_won + ? WHERE date = ?`,
        [amount, date]
      );
    } else {
      this.db.run(
        `INSERT INTO performance (date, wins, total_won) VALUES (?, 1, ?)`,
        [date, amount]
      );
    }
    this.save();
  }

  incrementLoss(amount: number, date: string = todayDate()): void {
    const existing = this.db.exec(`SELECT date FROM performance WHERE date = '${date}'`);

    if (existing.length > 0 && existing[0].values.length > 0) {
      this.db.run(
        `UPDATE performance SET losses = losses + 1, total_lost = total_lost + ? WHERE date = ?`,
        [amount, date]
      );
    } else {
      this.db.run(
        `INSERT INTO performance (date, losses, total_lost) VALUES (?, 1, ?)`,
        [date, amount]
      );
    }
    this.save();
  }

  incrementTie(date: string = todayDate()): void {
    const existing = this.db.exec(`SELECT date FROM performance WHERE date = '${date}'`);

    if (existing.length > 0 && existing[0].values.length > 0) {
      this.db.run(`UPDATE performance SET ties = ties + 1 WHERE date = ?`, [date]);
    } else {
      this.db.run(`INSERT INTO performance (date, ties) VALUES (?, 1)`, [date]);
    }
    this.save();
  }

  incrementResolverEarnings(amount: number, date: string = todayDate()): void {
    const existing = this.db.exec(`SELECT date FROM performance WHERE date = '${date}'`);

    if (existing.length > 0 && existing[0].values.length > 0) {
      this.db.run(
        `UPDATE performance SET resolver_earnings = resolver_earnings + ? WHERE date = ?`,
        [amount, date]
      );
    } else {
      this.db.run(
        `INSERT INTO performance (date, resolver_earnings) VALUES (?, ?)`,
        [date, amount]
      );
    }
    this.save();
  }

  getTotalPerformance(): BotPerformance & { resolverEarnings: number } {
    const result = this.db.exec(`
      SELECT
        COALESCE(SUM(wins), 0) as wins,
        COALESCE(SUM(losses), 0) as losses,
        COALESCE(SUM(ties), 0) as ties,
        COALESCE(SUM(total_won), 0) as total_won,
        COALESCE(SUM(total_lost), 0) as total_lost,
        COALESCE(SUM(resolver_earnings), 0) as resolver_earnings
      FROM performance
    `);

    if (result.length === 0 || result[0].values.length === 0) {
      return {
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        totalWon: 0,
        totalLost: 0,
        resolverEarnings: 0,
      };
    }

    const values = result[0].values[0];
    const wins = values[0] as number || 0;
    const losses = values[1] as number || 0;
    const ties = values[2] as number || 0;
    const totalWon = values[3] as number || 0;
    const totalLost = values[4] as number || 0;
    const resolverEarnings = values[5] as number || 0;

    const total = wins + losses + ties;

    return {
      wins,
      losses,
      ties,
      winRate: total > 0 ? (wins / total) * 100 : 0,
      totalWon,
      totalLost,
      resolverEarnings,
    };
  }

  // Helper to convert sql.js result to objects
  private rowsToObjects(result: { columns: string[]; values: any[][] }): Record<string, any>[] {
    const { columns, values } = result;
    return values.map((row) => {
      const obj: Record<string, any> = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  }
}
