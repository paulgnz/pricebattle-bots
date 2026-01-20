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
    // Calculate confidence bucket for tracking
    const confidenceBucket = params.confidence !== undefined
      ? this.getConfidenceBucket(params.confidence)
      : null;

    this.db.run(
      `INSERT INTO decisions (
        challenge_id, action, direction, confidence, confidence_bucket, reasoning,
        ai_provider, ai_model, price_at_decision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.challengeId ?? null,
        params.action,
        params.direction ?? null,
        params.confidence ?? null,
        confidenceBucket,
        params.reasoning ?? null,
        params.aiProvider ?? null,
        params.aiModel ?? null,
        params.priceAtDecision ?? null,
      ]
    );
    this.save();
  }

  // Get confidence bucket from percentage
  private getConfidenceBucket(confidence: number): string {
    if (confidence >= 90) return 'very_high';
    if (confidence >= 75) return 'high';
    if (confidence >= 60) return 'medium';
    return 'low';
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

  incrementWin(amount: number, date: string = todayDate(), confidence?: number): void {
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

    // Track by confidence bucket
    if (confidence !== undefined) {
      this.incrementConfidenceWin(confidence, amount);
    }

    // Update streak
    this.updateStreak(true, date);
  }

  incrementLoss(amount: number, date: string = todayDate(), confidence?: number): void {
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

    // Track by confidence bucket
    if (confidence !== undefined) {
      this.incrementConfidenceLoss(confidence, amount);
    }

    // Update streak
    this.updateStreak(false, date);
  }

  incrementTie(date: string = todayDate(), confidence?: number): void {
    const existing = this.db.exec(`SELECT date FROM performance WHERE date = '${date}'`);

    if (existing.length > 0 && existing[0].values.length > 0) {
      this.db.run(`UPDATE performance SET ties = ties + 1 WHERE date = ?`, [date]);
    } else {
      this.db.run(`INSERT INTO performance (date, ties) VALUES (?, 1)`, [date]);
    }
    this.save();

    // Track by confidence bucket (ties don't break streaks)
    if (confidence !== undefined) {
      this.incrementConfidenceTie(confidence);
    }
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

  getTotalPerformance(): BotPerformance & { resolverEarnings: number; currentStreak: number; bestWinStreak: number; worstLossStreak: number } {
    const result = this.db.exec(`
      SELECT
        COALESCE(SUM(wins), 0) as wins,
        COALESCE(SUM(losses), 0) as losses,
        COALESCE(SUM(ties), 0) as ties,
        COALESCE(SUM(total_won), 0) as total_won,
        COALESCE(SUM(total_lost), 0) as total_lost,
        COALESCE(SUM(resolver_earnings), 0) as resolver_earnings,
        COALESCE(MAX(best_win_streak), 0) as best_win_streak,
        COALESCE(MIN(worst_loss_streak), 0) as worst_loss_streak
      FROM performance
    `);

    // Get current streak from most recent date
    const streakResult = this.db.exec(`
      SELECT COALESCE(current_streak, 0) FROM performance ORDER BY date DESC LIMIT 1
    `);

    const currentStreak = streakResult.length > 0 && streakResult[0].values.length > 0
      ? streakResult[0].values[0][0] as number || 0
      : 0;

    if (result.length === 0 || result[0].values.length === 0) {
      return {
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        totalWon: 0,
        totalLost: 0,
        resolverEarnings: 0,
        currentStreak: 0,
        bestWinStreak: 0,
        worstLossStreak: 0,
      };
    }

    const values = result[0].values[0];
    const wins = values[0] as number || 0;
    const losses = values[1] as number || 0;
    const ties = values[2] as number || 0;
    const totalWon = values[3] as number || 0;
    const totalLost = values[4] as number || 0;
    const resolverEarnings = values[5] as number || 0;
    const bestWinStreak = values[6] as number || 0;
    const worstLossStreak = values[7] as number || 0;

    const total = wins + losses + ties;

    return {
      wins,
      losses,
      ties,
      winRate: total > 0 ? (wins / total) * 100 : 0,
      totalWon,
      totalLost,
      resolverEarnings,
      currentStreak,
      bestWinStreak,
      worstLossStreak,
    };
  }

  // ========== Confidence Performance ==========

  incrementConfidenceWin(confidence: number, amount: number): void {
    const bucket = this.getConfidenceBucket(confidence);
    this.db.run(
      `UPDATE confidence_performance
       SET wins = wins + 1, total_won = total_won + ?, updated_at = CURRENT_TIMESTAMP
       WHERE bucket = ?`,
      [amount, bucket]
    );
    this.save();
  }

  incrementConfidenceLoss(confidence: number, amount: number): void {
    const bucket = this.getConfidenceBucket(confidence);
    this.db.run(
      `UPDATE confidence_performance
       SET losses = losses + 1, total_lost = total_lost + ?, updated_at = CURRENT_TIMESTAMP
       WHERE bucket = ?`,
      [amount, bucket]
    );
    this.save();
  }

  incrementConfidenceTie(confidence: number): void {
    const bucket = this.getConfidenceBucket(confidence);
    this.db.run(
      `UPDATE confidence_performance
       SET ties = ties + 1, updated_at = CURRENT_TIMESTAMP
       WHERE bucket = ?`,
      [bucket]
    );
    this.save();
  }

  getConfidencePerformance(): { bucket: string; wins: number; losses: number; ties: number; winRate: number }[] {
    const result = this.db.exec(`
      SELECT bucket, wins, losses, ties FROM confidence_performance ORDER BY bucket
    `);

    if (result.length === 0) return [];

    return result[0].values.map((row: any[]) => {
      const wins = row[1] as number || 0;
      const losses = row[2] as number || 0;
      const ties = row[3] as number || 0;
      const total = wins + losses + ties;

      return {
        bucket: row[0] as string,
        wins,
        losses,
        ties,
        winRate: total > 0 ? (wins / total) * 100 : 0,
      };
    });
  }

  // ========== Streak Tracking ==========

  updateStreak(isWin: boolean, date: string = todayDate()): void {
    const existing = this.db.exec(`SELECT current_streak, best_win_streak, worst_loss_streak FROM performance WHERE date = '${date}'`);

    let currentStreak: number;
    let bestWinStreak: number;
    let worstLossStreak: number;

    if (existing.length > 0 && existing[0].values.length > 0) {
      const row = existing[0].values[0];
      currentStreak = row[0] as number || 0;
      bestWinStreak = row[1] as number || 0;
      worstLossStreak = row[2] as number || 0;
    } else {
      // Get streak from previous day
      const prevResult = this.db.exec(`SELECT current_streak, best_win_streak, worst_loss_streak FROM performance ORDER BY date DESC LIMIT 1`);
      if (prevResult.length > 0 && prevResult[0].values.length > 0) {
        const row = prevResult[0].values[0];
        currentStreak = row[0] as number || 0;
        bestWinStreak = row[1] as number || 0;
        worstLossStreak = row[2] as number || 0;
      } else {
        currentStreak = 0;
        bestWinStreak = 0;
        worstLossStreak = 0;
      }
    }

    // Update streak
    if (isWin) {
      // Win: positive streak increments, negative streak resets to +1
      currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
      bestWinStreak = Math.max(bestWinStreak, currentStreak);
    } else {
      // Loss: negative streak decrements, positive streak resets to -1
      currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
      worstLossStreak = Math.min(worstLossStreak, currentStreak);
    }

    // Update or insert
    if (existing.length > 0 && existing[0].values.length > 0) {
      this.db.run(
        `UPDATE performance SET current_streak = ?, best_win_streak = ?, worst_loss_streak = ? WHERE date = ?`,
        [currentStreak, bestWinStreak, worstLossStreak, date]
      );
    } else {
      this.db.run(
        `INSERT INTO performance (date, current_streak, best_win_streak, worst_loss_streak) VALUES (?, ?, ?, ?)`,
        [date, currentStreak, bestWinStreak, worstLossStreak]
      );
    }
    this.save();
  }

  getCurrentStreak(): number {
    const result = this.db.exec(`SELECT current_streak FROM performance ORDER BY date DESC LIMIT 1`);
    if (result.length === 0 || result[0].values.length === 0) return 0;
    return result[0].values[0][0] as number || 0;
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
