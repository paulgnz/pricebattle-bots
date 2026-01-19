import { PriceBattleActions } from '../blockchain';
import { ChallengeService } from './challenges';
import { OracleService } from './oracle';
import { DatabaseQueries } from '../db';
import { Challenge, ResolveResult, BATTLE_STATUS } from '../types';
import { Logger, formatXPR, nowSeconds } from '../utils';

export class ResolverService {
  private actions: PriceBattleActions;
  private challengeService: ChallengeService;
  private oracleService: OracleService;
  private db: DatabaseQueries;
  private logger?: Logger;

  constructor(
    actions: PriceBattleActions,
    challengeService: ChallengeService,
    oracleService: OracleService,
    db: DatabaseQueries,
    logger?: Logger
  ) {
    this.actions = actions;
    this.challengeService = challengeService;
    this.oracleService = oracleService;
    this.db = db;
    this.logger = logger;
  }

  /**
   * Find and resolve all resolvable battles
   */
  async resolveAll(): Promise<ResolveResult[]> {
    const resolvable = await this.challengeService.getResolvableChallenges();
    const results: ResolveResult[] = [];

    this.logger?.info('Checking for resolvable battles', {
      found: resolvable.length,
    });

    for (const challenge of resolvable) {
      const result = await this.resolveBattle(challenge);
      results.push(result);

      // Small delay between resolutions to avoid rate limiting
      if (results.length < resolvable.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return results;
  }

  /**
   * Resolve a single battle
   */
  async resolveBattle(challenge: Challenge): Promise<ResolveResult> {
    try {
      // Verify battle is actually resolvable
      const endTime = challenge.started_at + challenge.duration;
      const now = nowSeconds();

      if (now < endTime) {
        return {
          challengeId: challenge.id,
          success: false,
          error: `Battle not yet ended. Ends in ${endTime - now} seconds`,
        };
      }

      if (challenge.status !== BATTLE_STATUS.ACTIVE) {
        return {
          challengeId: challenge.id,
          success: false,
          error: `Invalid status: ${challenge.status}`,
        };
      }

      // Get current price from oracle
      const { price } = await this.oracleService.getBTCPrice();
      const endPrice = this.oracleService.priceToU64(price);

      this.logger?.info('Resolving battle', {
        challengeId: challenge.id,
        creator: challenge.creator,
        opponent: challenge.opponent,
        startPrice: challenge.start_price,
        endPrice,
        priceUSD: price,
      });

      // Execute resolve transaction
      const result = await this.actions.resolveBattle({
        challengeId: challenge.id,
        endPrice,
      });

      // Calculate resolver reward (2% of total pot)
      const pot = parseInt(challenge.amount, 10) * 2;
      const resolverReward = pot * 0.02;

      // Log the earnings
      this.db.incrementResolverEarnings(resolverReward / 10000); // Convert from smallest unit

      this.logger?.info('Battle resolved successfully', {
        challengeId: challenge.id,
        txId: result.transaction_id,
        resolverReward: formatXPR(resolverReward),
      });

      // Log decision
      this.db.logDecision({
        challengeId: challenge.id,
        action: 'resolve',
        priceAtDecision: price,
      });

      return {
        challengeId: challenge.id,
        success: true,
        txId: result.transaction_id,
        resolverReward: resolverReward / 10000,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger?.error('Failed to resolve battle', {
        challengeId: challenge.id,
        error: errorMessage,
      });

      return {
        challengeId: challenge.id,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Expire all expired challenges and claim refunds
   */
  async expireAll(): Promise<ResolveResult[]> {
    const expired = await this.challengeService.getExpiredChallenges();
    const results: ResolveResult[] = [];

    this.logger?.info('Checking for expired challenges', {
      found: expired.length,
    });

    for (const challenge of expired) {
      try {
        const result = await this.actions.expireChallenge(challenge.id);

        this.logger?.info('Expired challenge', {
          challengeId: challenge.id,
          txId: result.transaction_id,
        });

        results.push({
          challengeId: challenge.id,
          success: true,
          txId: result.transaction_id,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        this.logger?.error('Failed to expire challenge', {
          challengeId: challenge.id,
          error: errorMessage,
        });

        results.push({
          challengeId: challenge.id,
          success: false,
          error: errorMessage,
        });
      }

      // Small delay between operations
      if (results.length < expired.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return results;
  }
}
