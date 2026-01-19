import { TransactionSigner } from './signer';
import { Action, TransactResult, Authorization } from './types';
import { Direction, ORACLE } from '../types';
import { Logger, formatXPRWithSymbol } from '../utils';

export class PriceBattleActions {
  private signer: TransactionSigner;
  private account: string;
  private permission: string;
  private logger?: Logger;

  constructor(
    signer: TransactionSigner,
    account: string,
    permission: string = 'active',
    logger?: Logger
  ) {
    this.signer = signer;
    this.account = account;
    this.permission = permission;
    this.logger = logger;
  }

  private get auth(): Authorization {
    return { actor: this.account, permission: this.permission };
  }

  /**
   * Create a new challenge
   */
  async createChallenge(params: {
    amount: string; // e.g., "100.0000 XPR"
    direction: Direction;
    oracleIndex?: number;
    duration: number;
  }): Promise<TransactResult> {
    const { amount, direction, oracleIndex = ORACLE.BTC_USD, duration } = params;

    this.logger?.info('Creating challenge', {
      amount,
      direction: direction === 1 ? 'UP' : 'DOWN',
      duration,
    });

    const actions: Action[] = [
      // Transfer stake to contract
      {
        account: 'eosio.token',
        name: 'transfer',
        authorization: [this.auth],
        data: {
          from: this.account,
          to: 'pricebattle',
          quantity: amount,
          memo: 'PriceBattle stake',
        },
      },
      // Create the challenge
      {
        account: 'pricebattle',
        name: 'create',
        authorization: [this.auth],
        data: {
          creator: this.account,
          amount,
          direction,
          oracle_index: oracleIndex,
          duration,
        },
      },
    ];

    return this.signer.transact(actions);
  }

  /**
   * Accept an open challenge
   */
  async acceptChallenge(params: {
    challengeId: number;
    amount: string; // Must match challenge amount
    currentPrice: string; // u64 format with 8 decimals
  }): Promise<TransactResult> {
    const { challengeId, amount, currentPrice } = params;

    this.logger?.info('Accepting challenge', {
      challengeId,
      amount,
      currentPrice,
    });

    const actions: Action[] = [
      // Transfer stake to contract
      {
        account: 'eosio.token',
        name: 'transfer',
        authorization: [this.auth],
        data: {
          from: this.account,
          to: 'pricebattle',
          quantity: amount,
          memo: 'PriceBattle stake',
        },
      },
      // Accept the challenge
      {
        account: 'pricebattle',
        name: 'accept',
        authorization: [this.auth],
        data: {
          opponent: this.account,
          challenge_id: challengeId,
          current_price: currentPrice,
        },
      },
    ];

    return this.signer.transact(actions);
  }

  /**
   * Cancel an open challenge (creator only)
   */
  async cancelChallenge(challengeId: number): Promise<TransactResult> {
    this.logger?.info('Cancelling challenge', { challengeId });

    const actions: Action[] = [
      {
        account: 'pricebattle',
        name: 'cancel',
        authorization: [this.auth],
        data: {
          creator: this.account,
          challenge_id: challengeId,
        },
      },
    ];

    return this.signer.transact(actions);
  }

  /**
   * Expire an unaccepted challenge (anyone can call after expiry)
   */
  async expireChallenge(challengeId: number): Promise<TransactResult> {
    this.logger?.info('Expiring challenge', { challengeId });

    const actions: Action[] = [
      {
        account: 'pricebattle',
        name: 'expire',
        authorization: [this.auth],
        data: {
          challenge_id: challengeId,
        },
      },
    ];

    return this.signer.transact(actions);
  }

  /**
   * Resolve an active battle (anyone can call after duration ends)
   */
  async resolveBattle(params: {
    challengeId: number;
    endPrice: string; // u64 format with 8 decimals
  }): Promise<TransactResult> {
    const { challengeId, endPrice } = params;

    this.logger?.info('Resolving battle', {
      challengeId,
      endPrice,
    });

    const actions: Action[] = [
      {
        account: 'pricebattle',
        name: 'resolve',
        authorization: [this.auth],
        data: {
          challenge_id: challengeId,
          resolver: this.account,
          end_price: endPrice,
        },
      },
    ];

    return this.signer.transact(actions);
  }

  /**
   * Get the account this actions instance operates on
   */
  getAccount(): string {
    return this.account;
  }
}
