import { RpcClient } from '../blockchain';
import { DatabaseQueries } from '../db';
import {
  Challenge,
  PriceBattleConfig,
  PlayerStats,
  BATTLE_STATUS,
} from '../types';
import { Logger, nowSeconds } from '../utils';

export class ChallengeService {
  private rpc: RpcClient;
  private db: DatabaseQueries;
  private account: string;
  private logger?: Logger;

  constructor(
    rpc: RpcClient,
    db: DatabaseQueries,
    account: string,
    logger?: Logger
  ) {
    this.rpc = rpc;
    this.db = db;
    this.account = account;
    this.logger = logger;
  }

  /**
   * Sync challenges from blockchain to local database
   */
  async syncChallenges(): Promise<void> {
    const challenges = await this.getAllChallenges();
    this.db.upsertChallenges(challenges, this.account);
    this.logger?.debug('Synced challenges', { count: challenges.length });
  }

  /**
   * Get all challenges from blockchain
   * Uses reverse order to get most recent challenges first
   */
  async getAllChallenges(limit: number = 200): Promise<Challenge[]> {
    return this.rpc.getTableRows<Challenge>({
      scope: 'pricebattle',
      code: 'pricebattle',
      table: 'challenges',
      limit,
      reverse: true,
    });
  }

  /**
   * Get open challenges (status = 0)
   */
  async getOpenChallenges(): Promise<Challenge[]> {
    const all = await this.getAllChallenges();
    return all.filter((c) => c.status === BATTLE_STATUS.OPEN);
  }

  /**
   * Get active challenges (status = 1)
   */
  async getActiveChallenges(): Promise<Challenge[]> {
    const all = await this.getAllChallenges();
    return all.filter((c) => c.status === BATTLE_STATUS.ACTIVE);
  }

  /**
   * Get a specific challenge by ID
   */
  async getChallenge(id: number): Promise<Challenge | null> {
    const rows = await this.rpc.getTableRows<Challenge>({
      scope: 'pricebattle',
      code: 'pricebattle',
      table: 'challenges',
      lower_bound: id,
      upper_bound: id,
      limit: 1,
    });
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get challenges that are ready to be resolved
   * (status = ACTIVE and duration has passed)
   */
  async getResolvableChallenges(): Promise<Challenge[]> {
    const active = await this.getActiveChallenges();
    const now = nowSeconds();

    return active.filter((c) => {
      const endTime = c.started_at + c.duration;
      return now >= endTime;
    });
  }

  /**
   * Get challenges that have expired (open but past expiry)
   */
  async getExpiredChallenges(): Promise<Challenge[]> {
    const open = await this.getOpenChallenges();
    const now = nowSeconds();

    return open.filter((c) => c.expires_at && now >= c.expires_at);
  }

  /**
   * Get our challenges (as creator or opponent)
   */
  async getOurChallenges(): Promise<Challenge[]> {
    const all = await this.getAllChallenges();
    return all.filter(
      (c) => c.creator === this.account || c.opponent === this.account
    );
  }

  /**
   * Get our active challenges count
   */
  async getOurActiveChallengesCount(): Promise<number> {
    const our = await this.getOurChallenges();
    return our.filter((c) => c.status === BATTLE_STATUS.ACTIVE).length;
  }

  /**
   * Get open challenges that we can accept (not our own)
   */
  async getAcceptableChallenges(): Promise<Challenge[]> {
    const open = await this.getOpenChallenges();
    return open.filter((c) => c.creator !== this.account);
  }

  /**
   * Get PriceBattle config
   */
  async getConfig(): Promise<PriceBattleConfig | null> {
    const rows = await this.rpc.getTableRows<PriceBattleConfig>({
      scope: 'pricebattle',
      code: 'pricebattle',
      table: 'config',
      limit: 1,
    });
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get player stats
   */
  async getPlayerStats(player: string): Promise<PlayerStats | null> {
    const rows = await this.rpc.getTableRows<PlayerStats>({
      scope: 'pricebattle',
      code: 'pricebattle',
      table: 'stats',
      lower_bound: player,
      upper_bound: player,
      limit: 1,
    });
    return rows.length > 0 && rows[0].player === player ? rows[0] : null;
  }

  /**
   * Check if contract is paused
   */
  async isPaused(): Promise<boolean> {
    const config = await this.getConfig();
    return config?.paused ?? false;
  }

  /**
   * Get XPR balance for the account
   */
  async getBalance(): Promise<number> {
    const [balance] = await this.rpc.getCurrencyBalance('eosio.token', this.account, 'XPR');
    if (!balance) return 0;
    return parseFloat(balance.split(' ')[0]);
  }
}
